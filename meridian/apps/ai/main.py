import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import litellm
import orjson
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.chat import chat_stream, EXAMPLE_QUERIES
from services.daily_brief import generate_daily_brief, generate_situation_report
from services.anomaly import run_anomaly_detection
from services.risk_score import compute_risk_scores

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler(timezone="UTC")
_daily_brief_cache: dict = {}
_anomaly_cache: list = []
_risk_cache: list = []

MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    litellm.set_verbose = False
    if os.getenv("OPENAI_API_KEY"):
        litellm.openai_key = os.getenv("OPENAI_API_KEY")
    if os.getenv("ANTHROPIC_API_KEY"):
        litellm.anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    _scheduler.add_job(_refresh_daily_brief, "cron", hour=6, minute=0, id="daily_brief")
    _scheduler.add_job(_refresh_anomalies, "interval", minutes=30, id="anomalies")
    _scheduler.add_job(_refresh_risk_scores, "interval", hours=6, id="risk_scores")
    _scheduler.start()

    await _refresh_anomalies()
    await _refresh_risk_scores()

    yield
    _scheduler.shutdown(wait=False)


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


class SituationReportRequest(BaseModel):
    topic: str
    region: str | None = None


@app.post("/ai/chat")
async def chat(req: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    async def gen() -> AsyncGenerator[bytes, None]:
        async for chunk in chat_stream(messages, MODEL):
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
    if not _daily_brief_cache:
        return {"error": "Daily brief not yet generated. Check back shortly."}
    return _daily_brief_cache


@app.post("/ai/brief/daily/refresh")
async def refresh_brief() -> dict:
    await _refresh_daily_brief()
    return {"status": "ok"}


@app.post("/ai/report")
async def situation_report(req: SituationReportRequest) -> dict:
    return await generate_situation_report(MODEL, req.topic, req.region)


@app.get("/ai/anomalies")
async def get_anomalies() -> list:
    return _anomaly_cache


@app.get("/ai/risk-scores")
async def get_risk_scores() -> list:
    return _risk_cache


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": MODEL}
