from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.credential_store import get_credential, list_configured, set_credential
from core.database import get_db
from core.security import decode_token
from models.user import User
from models.user_ai_key import UserAIKey, UserAIKeyCreate, UserAIKeyResponse
from routers.auth import get_current_user

router = APIRouter(prefix="/credentials", tags=["credentials"])
CurrentUser = Annotated[User, Depends(get_current_user)]

_VALID_AI_PROVIDERS = {"openai", "anthropic", "gemini"}


async def _require_user_or_service(
    authorization: str | None = Header(None),
) -> None:
    """Allow access with either a valid user JWT or an internal service JWT.

    Internal service JWTs are minted by the AI service using the shared SECRET_KEY
    with sub="0" and email="ai-service@internal".  Since user_id=0 doesn't exist in
    the DB, the normal get_current_user dependency rejects them.  This lightweight
    check only validates the JWT signature and type — sufficient for the global
    credential store endpoints (which don't need a real User object)."""
    if not authorization:
        raise HTTPException(401, "Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(401, "Invalid token")


ServiceOrUser = Depends(_require_user_or_service)


@router.get("", dependencies=[ServiceOrUser])
async def get_credentials() -> dict:
    """Return which credential keys have a configured value (DB or env).
    Values are never returned — only True/False per key."""
    configured = list_configured()
    return {"configured": configured}


@router.put("", dependencies=[ServiceOrUser])
async def save_credentials(data: dict[str, str]) -> dict:
    """Persist credential values to DB and update the in-process cache.
    Pass an empty string to clear a key."""
    saved: list[str] = []
    for key, value in data.items():
        if key:
            await set_credential(key.strip(), value.strip())
            saved.append(key)
    return {"saved": saved}


@router.get("/{key}/configured", dependencies=[ServiceOrUser])
async def is_key_configured(key: str) -> dict:
    """Check if a single key has a value."""
    return {"key": key, "configured": bool(get_credential(key))}


@router.get("/{key}/value", dependencies=[ServiceOrUser])
async def get_credential_value(key: str) -> dict:
    """Return the actual value for a credential key.
    Internal endpoint used by the AI service to restore saved API keys.
    Requires authentication and restricts to known credential keys."""
    _ALLOWED_KEYS = {
        "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
        "LLM_MODEL", "LLM_PROVIDER",
    }
    if key not in _ALLOWED_KEYS:
        return {"key": key, "value": ""}
    return {"key": key, "value": get_credential(key)}


# ─── Per-User AI Key Management ──────────────────────────────────────────────


def _key_preview(raw_key: str) -> str:
    """Return a safe preview of an API key (first 8 chars + ...)."""
    if len(raw_key) <= 8:
        return "***"
    return raw_key[:8] + "..."


@router.get("/ai", response_model=list[UserAIKeyResponse])
async def list_user_ai_keys(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """List current user's configured AI providers (no raw keys)."""
    result = await db.execute(
        select(UserAIKey).where(UserAIKey.user_id == current_user.id)
    )
    keys = result.scalars().all()
    return [
        UserAIKeyResponse(
            provider=k.provider,
            key_preview=_key_preview(k.encrypted_api_key),
            model_preference=k.model_preference,
            is_active=k.is_active,
        )
        for k in keys
    ]


@router.put("/ai", response_model=UserAIKeyResponse)
async def upsert_user_ai_key(
    body: UserAIKeyCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Upsert an AI provider key for the current user.
    If api_key is omitted, only updates model_preference on an existing key."""
    if body.provider not in _VALID_AI_PROVIDERS:
        raise HTTPException(400, f"Unsupported provider: {body.provider}")

    has_key = body.api_key and body.api_key.strip()

    result = await db.execute(
        select(UserAIKey).where(
            UserAIKey.user_id == current_user.id,
            UserAIKey.provider == body.provider,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        if has_key:
            existing.encrypted_api_key = body.api_key.strip()  # type: ignore[union-attr]
        if body.model_preference is not None:
            existing.model_preference = body.model_preference
        existing.is_active = True
        existing.updated_at = datetime.now(timezone.utc)
    else:
        if not has_key:
            raise HTTPException(400, "API key is required when adding a new provider")
        existing = UserAIKey(
            user_id=current_user.id,
            provider=body.provider,
            encrypted_api_key=body.api_key.strip(),  # type: ignore[union-attr]
            model_preference=body.model_preference,
            is_active=True,
        )
        db.add(existing)

    await db.commit()
    await db.refresh(existing)

    return UserAIKeyResponse(
        provider=existing.provider,
        key_preview=_key_preview(existing.encrypted_api_key),
        model_preference=existing.model_preference,
        is_active=existing.is_active,
    )


@router.delete("/ai/{provider}", status_code=204)
async def delete_user_ai_key(
    provider: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Remove user's key for a provider."""
    await db.execute(
        delete(UserAIKey).where(
            UserAIKey.user_id == current_user.id,
            UserAIKey.provider == provider,
        )
    )
    await db.commit()


@router.get("/ai/key")
async def get_user_ai_key_internal(
    current_user: CurrentUser,
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Internal endpoint for AI service: returns raw key for a user's active provider.
    Requires authentication; user can only retrieve their own key."""
    if current_user.id != user_id:
        raise HTTPException(403, "Cannot access another user's API key")

    result = await db.execute(
        select(UserAIKey).where(
            UserAIKey.user_id == user_id,
            UserAIKey.is_active == True,
        ).order_by(UserAIKey.updated_at.desc()).limit(1)
    )
    key_row = result.scalar_one_or_none()
    if not key_row:
        return {"api_key": None, "model_preference": None, "provider": None}

    # Determine model prefix based on provider
    model = key_row.model_preference
    if model and "/" not in model:
        model = f"{key_row.provider}/{model}"

    return {
        "api_key": key_row.encrypted_api_key,
        "model_preference": model,
        "provider": key_row.provider,
    }
