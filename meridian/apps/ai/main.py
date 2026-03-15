import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import litellm
import orjson
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from services.chat import chat_stream, EXAMPLE_QUERIES
from services.daily_brief import generate_daily_brief, generate_situation_report
from services.anomaly import run_anomaly_detection
from services.risk_score import compute_risk_scores
from services.sanitize import sanitize_event_text as _sanitize_event_text, sanitize_user_input, validate_system_prompt

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler(timezone="UTC")
_daily_brief_cache: dict = {}
_anomaly_cache: list = []
_risk_cache: list = []

MODEL = os.getenv("LLM_MODEL", "openai/gpt-4o-mini")

# Known model IDs per provider — used as fallback when live API listing is unavailable.
# Validated keys fetch live model lists from each provider's API.
_OPENAI_KNOWN_MODELS = {
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-pro",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o3-pro",
    "o4-mini",
}

_GEMINI_KNOWN_MODELS = {
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
}

_ANTHROPIC_KNOWN_MODELS = {
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
}


def _is_chat_model(model_id: str) -> bool:
    """Return True if an OpenAI model ID is a current-gen chat model."""
    return model_id in _OPENAI_KNOWN_MODELS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# ── JWT auth dependency ──────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Validate JWT from the Authorization header. Returns the decoded payload."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        # Carry raw token for downstream API calls (e.g., fetching per-user AI keys)
        payload["_raw_token"] = credentials.credentials
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def _service_auth_headers() -> dict[str, str]:
    """Create a short-lived service JWT for internal API-to-API calls.

    The API credential endpoints require authentication. The AI service
    shares the same SECRET_KEY and can mint a valid token for internal use."""
    from datetime import datetime, timedelta, timezone

    payload = {
        "sub": "0",
        "type": "access",
        "email": "ai-service@internal",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {"Authorization": f"Bearer {token}"}


async def _load_credentials_from_api() -> None:
    """Fetch saved credentials from the API credential store on startup.

    The API persists keys to its DB via PUT /api/v1/credentials.
    On restart, the AI container needs to pull those saved keys back."""
    import httpx

    api_base = os.getenv("API_BASE", "http://api:8000/api/v1")
    svc_headers = _service_auth_headers()
    key_map = {
        "OPENAI_API_KEY": ("openai_key", lambda k: setattr(litellm, "openai_key", k)),
        "ANTHROPIC_API_KEY": ("anthropic_key", lambda k: setattr(litellm, "anthropic_key", k)),
        "GEMINI_API_KEY": (None, None),
    }

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            # Check which keys the API has stored
            resp = await client.get(f"{api_base}/credentials", headers=svc_headers)
            if resp.status_code != 200:
                logger.warning(f"Could not load credentials from API: status {resp.status_code}")
                return
            configured = resp.json().get("configured", [])

            for env_key in key_map:
                if env_key in configured and not os.getenv(env_key):
                    val_resp = await client.get(
                        f"{api_base}/credentials/{env_key}/value",
                        headers=svc_headers,
                    )
                    if val_resp.status_code == 200:
                        value = val_resp.json().get("value", "")
                        if value:
                            os.environ[env_key] = value
                            logger.info(f"Loaded {env_key} from API credential store")
    except Exception as exc:
        logger.warning(f"Could not load credentials from API: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    litellm.set_verbose = False
    litellm.drop_params = True  # silently drop unsupported params for cross-provider compat

    # Load credentials saved via Settings UI from the API's DB
    await _load_credentials_from_api()

    if os.getenv("OPENAI_API_KEY"):
        litellm.openai_key = os.getenv("OPENAI_API_KEY")
    if os.getenv("ANTHROPIC_API_KEY"):
        litellm.anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if os.getenv("GEMINI_API_KEY"):
        os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY")

    # Restore saved model selection
    await _load_saved_model_from_api()

    _scheduler.add_job(_refresh_daily_brief, "cron", hour=6, minute=0, id="daily_brief")
    _scheduler.add_job(_refresh_anomalies, "interval", minutes=30, id="anomalies")
    _scheduler.add_job(_refresh_risk_scores, "interval", hours=6, id="risk_scores")
    _scheduler.start()

    await _refresh_anomalies()
    await _refresh_risk_scores()

    yield
    _scheduler.shutdown(wait=False)


async def _load_saved_model_from_api() -> None:
    """Load the previously saved AI model selection from the API credential store."""
    import httpx
    global MODEL

    api_base = os.getenv("API_BASE", "http://api:8000/api/v1")
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                f"{api_base}/credentials/LLM_MODEL/value",
                headers=_service_auth_headers(),
            )
            if resp.status_code == 200:
                value = resp.json().get("value", "")
                if value:
                    MODEL = value
                    os.environ["LLM_MODEL"] = MODEL
                    logger.info(f"Restored saved AI model: {MODEL}")
    except Exception:
        pass


app = FastAPI(title="Meridian AI Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


async def _refresh_daily_brief():
    global _daily_brief_cache
    try:
        _daily_brief_cache = await generate_daily_brief(MODEL)
        logger.info("daily_brief_refreshed")
    except Exception as e:
        logger.error(f"daily_brief_error: {e}")


async def _refresh_anomalies():
    global _anomaly_cache
    try:
        _anomaly_cache = await run_anomaly_detection()
        logger.info(f"anomalies_refreshed count={len(_anomaly_cache)}")
    except Exception as e:
        logger.error(f"anomaly_error: {e}")


async def _refresh_risk_scores():
    global _risk_cache
    try:
        _risk_cache = await compute_risk_scores()
        logger.info(f"risk_scores_refreshed count={len(_risk_cache)}")
    except Exception as e:
        logger.error(f"risk_score_error: {e}")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    stream: bool = True
    system_prompt: str | None = None
    model_override: str | None = None
    temperature: float | None = None


class SituationReportRequest(BaseModel):
    topic: str
    region: str | None = None
    system_prompt: str | None = None
    model_override: str | None = None
    temperature: float | None = None
    # Custom event filters — when provided, the report is based on this filtered set
    categories: list[str] | None = None
    severities: list[str] | None = None
    source_ids: list[str] | None = None
    hours_back: int | None = None
    event_ids: list[str] | None = None  # explicit event IDs to include


def _validated_system_prompt(prompt: str | None) -> str | None:
    """Validate an optional system prompt override, returning 400 on failure."""
    if prompt is None:
        return None
    try:
        return validate_system_prompt(prompt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _get_user_ai_key(user_payload: dict) -> tuple[str | None, str | None]:
    """Fetch user's AI key from API credential store. Returns (api_key, model)."""
    import httpx

    user_id = user_payload.get("sub")
    if not user_id:
        return None, None

    api_base = os.getenv("API_BASE", "http://api:8000/api/v1")
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                f"{api_base}/credentials/ai/key",
                headers={"Authorization": f"Bearer {user_payload.get('_raw_token', '')}"},
                params={"user_id": user_id},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("api_key"), data.get("model_preference")
    except Exception:
        pass
    return None, None


@app.post("/ai/chat")
async def chat(req: ChatRequest, _user: dict = Depends(require_auth)):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    model = req.model_override or MODEL
    sys_prompt = _validated_system_prompt(req.system_prompt)
    user_key, user_model = await _get_user_ai_key(_user)
    effective_key = user_key or None
    if user_model and not req.model_override:
        model = user_model

    async def gen() -> AsyncGenerator[bytes, None]:
        async for chunk in chat_stream(messages, model, system_prompt=sys_prompt, temperature=req.temperature, api_key=effective_key):
            if chunk.startswith("[tool:"):
                yield f"data: {orjson.dumps({'type': 'tool_call', 'tool': chunk[6:-1]}).decode()}\n\n".encode()
            else:
                yield f"data: {orjson.dumps({'type': 'content', 'text': chunk}).decode()}\n\n".encode()
        yield b"data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                              headers={"Cache-Control": "no-cache"})


@app.get("/ai/examples")
async def get_examples() -> dict:
    return {"queries": EXAMPLE_QUERIES}


@app.get("/ai/brief/daily")
async def get_daily_brief() -> dict:
    if _daily_brief_cache is None or (isinstance(_daily_brief_cache, dict) and not _daily_brief_cache):
        return {"error": "Daily brief not yet generated. Check back shortly."}
    return _daily_brief_cache


@app.post("/ai/brief/daily/refresh")
async def refresh_brief(_user: dict = Depends(require_auth)) -> dict:
    await _refresh_daily_brief()
    return {"status": "ok"}


@app.post("/ai/report")
async def situation_report(req: SituationReportRequest, _user: dict = Depends(require_auth)) -> dict:
    model = req.model_override or MODEL
    sys_prompt = _validated_system_prompt(req.system_prompt)
    user_key, user_model = await _get_user_ai_key(_user)
    if user_model and not req.model_override:
        model = user_model
    return await generate_situation_report(
        model, req.topic, req.region,
        system_prompt=sys_prompt, temperature=req.temperature, api_key=user_key,
        categories=req.categories, severities=req.severities,
        source_ids=req.source_ids, hours_back=req.hours_back,
        event_ids=req.event_ids,
    )


@app.get("/ai/anomalies")
async def get_anomalies() -> list:
    return _anomaly_cache


@app.get("/ai/risk-scores")
async def get_risk_scores() -> list:
    return _risk_cache


class TranslateRequest(BaseModel):
    text: str
    source_lang: str | None = None
    target_lang: str = "en"
    system_prompt: str | None = None
    model_override: str | None = None
    temperature: float | None = None


@app.post("/ai/translate")
async def translate_text(req: TranslateRequest, _user: dict = Depends(require_auth)):
    """Auto-translate OSINT posts — multilingual signal extraction via LLM."""
    sanitized_text = sanitize_user_input(req.text)
    if req.target_lang == "en" and req.source_lang == "en":
        return {"original": req.text, "translated": req.text, "detected_lang": "en"}

    prompt = (
        f"Translate the following text to {req.target_lang}. "
        f"{'Detected source language: ' + req.source_lang + '.' if req.source_lang else 'Auto-detect the source language.'} "
        f"Return ONLY the translated text, no explanations.\n\n{sanitized_text}"
    )
    messages = [{"role": "user", "content": prompt}]
    model = req.model_override or MODEL
    sys_prompt = _validated_system_prompt(req.system_prompt)
    user_key, user_model = await _get_user_ai_key(_user)
    if user_model and not req.model_override:
        model = user_model
    chunks = []
    async for chunk in chat_stream(messages, model, system_prompt=sys_prompt, temperature=req.temperature, api_key=user_key):
        if not chunk.startswith("[tool:"):
            chunks.append(chunk)
    return {"original": req.text, "translated": "".join(chunks).strip(), "target_lang": req.target_lang}


class PersonalizedBriefRequest(BaseModel):
    top_categories: list[str]
    region_focus: str | None = None
    system_prompt: str | None = None
    model_override: str | None = None
    temperature: float | None = None


@app.post("/ai/brief/personalized")
async def personalized_brief(req: PersonalizedBriefRequest, _user: dict = Depends(require_auth)):
    """Generate a personalized intelligence brief based on user reading history."""
    sanitized_cats = [sanitize_user_input(c, max_len=50) for c in req.top_categories]
    sanitized_region = sanitize_user_input(req.region_focus, max_len=100) if req.region_focus else ""
    focus = f"Focus especially on: {', '.join(sanitized_cats)}." if sanitized_cats else ""
    region = f"Regional focus: {sanitized_region}." if sanitized_region else ""
    prompt = (
        f"Generate a personalized intelligence brief for an analyst. {focus} {region} "
        f"Summarize the most critical developments in the analyst's areas of interest over the last 24 hours. "
        f"Be concise — 3-5 bullet points maximum. Use an authoritative, professional tone."
    )
    messages = [{"role": "user", "content": prompt}]
    model = req.model_override or MODEL
    sys_prompt = _validated_system_prompt(req.system_prompt)
    user_key, user_model = await _get_user_ai_key(_user)
    if user_model and not req.model_override:
        model = user_model
    chunks = []
    async for chunk in chat_stream(messages, model, system_prompt=sys_prompt, temperature=req.temperature, api_key=user_key):
        if not chunk.startswith("[tool:"):
            chunks.append(chunk)
    return {"brief": "".join(chunks).strip(), "categories": req.top_categories}


class PlanRoomBriefRequest(BaseModel):
    room_name: str
    annotations: list[dict]
    timeline_events: list[dict]
    tasks: list[dict]
    watch_list: list[dict]
    system_prompt: str | None = None
    model_override: str | None = None
    temperature: float | None = None


@app.post("/ai/planroom/brief")
async def plan_room_brief(req: PlanRoomBriefRequest, _user: dict = Depends(require_auth)):
    """Generate an AI briefing summary for a Plan Room."""
    ann_text = "\n".join([f"- {_sanitize_event_text(a.get('annotation_type','annotation'), 30)}: {_sanitize_event_text(a.get('label',''), 100)}" for a in req.annotations[:10]])
    tl_text = "\n".join([f"- {_sanitize_event_text(e.get('event_time','')[:10], 20)}: {_sanitize_event_text(e.get('title',''), 150)}" for e in req.timeline_events[:10]])
    task_text = "\n".join([f"- [{_sanitize_event_text(t.get('status','open'), 20)}] {_sanitize_event_text(t.get('title',''), 150)}" for t in req.tasks[:10]])
    watch_text = "\n".join([f"- {_sanitize_event_text(w.get('entity_type','entity'), 30)}: {_sanitize_event_text(w.get('name',''), 100)}" for w in req.watch_list[:10]])

    prompt = (
        f"You are an intelligence analyst. Generate a concise briefing summary for Plan Room: '{_sanitize_event_text(req.room_name, 100)}'.\n\n"
        f"Annotations on map:\n{ann_text or 'None'}\n\n"
        f"Recent timeline events:\n{tl_text or 'None'}\n\n"
        f"Active tasks:\n{task_text or 'None'}\n\n"
        f"Watch list entities:\n{watch_text or 'None'}\n\n"
        f"Produce a 2-3 paragraph executive briefing summary. Highlight key developments, risks, and recommended actions."
    )
    messages = [{"role": "user", "content": prompt}]
    model = req.model_override or MODEL
    sys_prompt = _validated_system_prompt(req.system_prompt)
    user_key, user_model = await _get_user_ai_key(_user)
    if user_model and not req.model_override:
        model = user_model

    async def gen() -> AsyncGenerator[bytes, None]:
        async for chunk in chat_stream(messages, model, system_prompt=sys_prompt, temperature=req.temperature, api_key=user_key):
            if not chunk.startswith("[tool:"):
                yield f"data: {orjson.dumps({'type': 'content', 'text': chunk}).decode()}\n\n".encode()
        yield b"data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


class EscalationRequest(BaseModel):
    country: str
    category: str = "conflict"
    events: list[dict]
    system_prompt: str | None = None
    model_override: str | None = None
    temperature: float | None = None


@app.post("/ai/escalation")
async def predict_escalation(req: EscalationRequest, _user: dict = Depends(require_auth)):
    """Predictive threat escalation indicators based on event trajectory."""
    event_text = "\n".join([
        f"- {_sanitize_event_text(e.get('event_time', '')[:10], 20)}: {_sanitize_event_text(e.get('title', ''), 150)} [severity: {_sanitize_event_text(e.get('severity', 'unknown'), 10)}]"
        for e in req.events[-20:]
    ])
    prompt = (
        f"You are a conflict analyst. Based on the following recent {_sanitize_event_text(req.category, 50)} events in {_sanitize_event_text(req.country, 100)}, "
        f"assess the escalation trajectory and provide a threat escalation prediction.\n\n"
        f"Recent events:\n{event_text or 'No events provided'}\n\n"
        f"Respond with:\n1. Escalation Risk Level (Low/Medium/High/Critical)\n"
        f"2. Key escalation indicators (2-3 bullets)\n3. Most likely scenario (1 sentence)\n"
        f"4. Recommended monitoring actions (1-2 bullets)\n"
        f"Be concise and analytical."
    )
    messages = [{"role": "user", "content": prompt}]
    model = req.model_override or MODEL
    sys_prompt = _validated_system_prompt(req.system_prompt)
    user_key, user_model = await _get_user_ai_key(_user)
    if user_model and not req.model_override:
        model = user_model
    chunks = []
    async for chunk in chat_stream(messages, model, system_prompt=sys_prompt, temperature=req.temperature, api_key=user_key):
        if not chunk.startswith("[tool:"):
            chunks.append(chunk)
    return {"country": req.country, "category": req.category, "assessment": "".join(chunks).strip()}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": MODEL}


# ── AI Provider Configuration ─────────────────────────────────────────────────

class ValidateKeyRequest(BaseModel):
    provider: str = "openai"
    api_key: str


class SaveConfigRequest(BaseModel):
    provider: str = "openai"
    api_key: str
    model: str


@app.post("/ai/config/validate-key")
async def validate_key(req: ValidateKeyRequest):
    """Validate an API key by calling the provider's models endpoint.

    Returns the live model list from the provider API so the user sees
    real, usable model IDs rather than a stale hardcoded list."""
    import httpx

    _FALLBACK_MODELS = {
        "openai": sorted(_OPENAI_KNOWN_MODELS),
        "anthropic": sorted(_ANTHROPIC_KNOWN_MODELS),
        "gemini": sorted(_GEMINI_KNOWN_MODELS),
    }

    if req.provider not in _FALLBACK_MODELS:
        return {"valid": False, "error": f"Unsupported provider: {req.provider}"}

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            if req.provider == "openai":
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {req.api_key}"},
                )
                if resp.status_code in (401, 403):
                    return {"valid": False, "error": "Invalid API key"}
                if resp.status_code != 200:
                    return {"valid": False, "error": f"API error: {resp.status_code}"}
                # Parse live model list — filter to chat-capable models
                data = resp.json().get("data", [])
                live_models = sorted({
                    m["id"] for m in data
                    if isinstance(m.get("id"), str) and (
                        m["id"].startswith("gpt-") or m["id"].startswith("o")
                    ) and "instruct" not in m["id"]
                    and "realtime" not in m["id"]
                    and "audio" not in m["id"]
                    and "tts" not in m["id"]
                    and "whisper" not in m["id"]
                    and "dall-e" not in m["id"]
                    and "embedding" not in m["id"]
                })
                models = live_models if live_models else _FALLBACK_MODELS["openai"]

            elif req.provider == "anthropic":
                # Validate key with a minimal messages request (1 max_token).
                # The models list endpoint requires a beta header that may
                # not be available on all accounts, so this is more reliable.
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": req.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-haiku-4-5-20251001",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "hi"}],
                    },
                )
                if resp.status_code in (401, 403):
                    return {"valid": False, "error": "Invalid API key"}
                if resp.status_code not in (200, 529):
                    # 529 = overloaded (key is valid, server busy)
                    error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                    error_msg = error_body.get("error", {}).get("message", f"API error: {resp.status_code}")
                    return {"valid": False, "error": error_msg}
                models = _FALLBACK_MODELS["anthropic"]

            elif req.provider == "gemini":
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={req.api_key}",
                )
                if resp.status_code in (400, 403):
                    return {"valid": False, "error": "Invalid API key"}
                if resp.status_code != 200:
                    return {"valid": False, "error": f"API error: {resp.status_code}"}
                raw_models = resp.json().get("models", [])
                live_models = sorted({
                    m.get("name", "").removeprefix("models/")
                    for m in raw_models
                    if "generateContent" in (m.get("supportedGenerationMethods") or [])
                })
                models = live_models if live_models else _FALLBACK_MODELS["gemini"]

            else:
                return {"valid": False, "error": f"Unsupported provider: {req.provider}"}

        return {"valid": True, "models": models, "provider": req.provider}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


@app.get("/ai/config")
async def get_config(_user: dict = Depends(require_auth)):
    """Return AI configuration — per-user keys + global fallback status."""
    import httpx

    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))
    has_gemini = bool(os.getenv("GEMINI_API_KEY"))

    # Fetch per-user configured providers from API
    user_providers: list[dict] = []
    api_base = os.getenv("API_BASE", "http://api:8000/api/v1")
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                f"{api_base}/credentials/ai",
                headers={"Authorization": f"Bearer {_user.get('_raw_token', '')}"},
            )
            if resp.status_code == 200:
                user_providers = resp.json()
    except Exception:
        pass

    return {
        "model": MODEL,
        "user_providers": user_providers,
        "global_fallback": {
            "openai": {"configured": has_openai, "key_preview": os.getenv("OPENAI_API_KEY", "")[:8] + "..." if has_openai else None},
            "anthropic": {"configured": has_anthropic, "key_preview": os.getenv("ANTHROPIC_API_KEY", "")[:8] + "..." if has_anthropic else None},
            "gemini": {"configured": has_gemini, "key_preview": os.getenv("GEMINI_API_KEY", "")[:8] + "..." if has_gemini else None},
        },
    }


@app.get("/ai/config/models")
async def list_available_models():
    """Return known models for all providers."""
    return {
        "openai": sorted(_OPENAI_KNOWN_MODELS),
        "anthropic": sorted(_ANTHROPIC_KNOWN_MODELS),
        "gemini": sorted(_GEMINI_KNOWN_MODELS),
    }


@app.post("/ai/config/save")
async def save_config(req: SaveConfigRequest, _user: dict = Depends(require_auth)):
    """Save AI provider config — persists as per-user key via API credential store."""
    import httpx

    if req.provider not in ("openai", "anthropic", "gemini"):
        raise HTTPException(400, f"Unsupported provider: {req.provider}")

    model_name = req.model.split("/")[-1]  # strip any existing prefix
    model_with_prefix = f"{req.provider}/{model_name}"

    # Save per-user key via API
    api_base = os.getenv("API_BASE", "http://api:8000/api/v1")
    raw_token = _user.get("_raw_token", "")
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            if req.api_key:
                # Full save: new API key + model preference
                await client.put(
                    f"{api_base}/credentials/ai",
                    headers={"Authorization": f"Bearer {raw_token}"},
                    json={
                        "provider": req.provider,
                        "api_key": req.api_key,
                        "model_preference": model_with_prefix,
                    },
                )
            else:
                # Model-only change: update model_preference on existing key
                await client.put(
                    f"{api_base}/credentials/ai",
                    headers={"Authorization": f"Bearer {raw_token}"},
                    json={
                        "provider": req.provider,
                        "model_preference": model_with_prefix,
                    },
                )
    except Exception as exc:
        logger.warning(f"Could not persist per-user AI key to API: {exc}")

    # Update global MODEL so subsequent requests use it immediately
    global MODEL
    MODEL = model_with_prefix
    os.environ["LLM_MODEL"] = MODEL

    # Also persist to credential store so it survives restarts
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            await client.put(
                f"{api_base}/credentials",
                headers={"Authorization": f"Bearer {raw_token}"},
                json={"LLM_MODEL": model_with_prefix},
            )
    except Exception:
        pass

    logger.info(f"AI config saved for user={_user.get('sub')}: provider={req.provider} model={model_with_prefix}")
    return {"status": "ok", "model": model_with_prefix, "provider": req.provider}
