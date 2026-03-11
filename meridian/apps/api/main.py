import asyncio
import logging

import orjson
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from core.redis_client import close_redis, get_redis
from core.rate_limiter import RateLimitMiddleware
from routers import events, feeds, auth, alerts, plan_rooms, intel
from routers import orgs, tokens, billing, exports, collab, chat_sessions, credentials
from core.credential_store import load_from_db
from workers.scheduler import get_scheduler, run_all_workers_once
from services.alert_engine import run_alert_engine

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Meridian API starting up...")

    await load_from_db()

    scheduler = get_scheduler()
    scheduler.start()

    await run_all_workers_once()

    asyncio.create_task(_redis_event_broadcaster())
    asyncio.create_task(run_alert_engine())

    yield

    scheduler.shutdown(wait=False)
    await close_redis()
    logger.info("Meridian API shut down.")


app = FastAPI(
    title="Meridian API",
    description="Open-source global situational awareness platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(feeds.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(plan_rooms.router, prefix="/api/v1")
app.include_router(intel.router, prefix="/api/v1")
app.include_router(collab.router, prefix="/api/v1")
app.include_router(exports.router, prefix="/api/v1")
app.include_router(orgs.router, prefix="/api/v1")
app.include_router(tokens.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(chat_sessions.router, prefix="/api/v1")
app.include_router(credentials.router, prefix="/api/v1")


# ─── WebSocket connection manager ────────────────────────────────────────────

class ConnectionManager:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("ws_connected", extra={"total": len(self._connections)})

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.remove(ws)
        logger.info("ws_disconnected", extra={"total": len(self._connections)})

    async def broadcast(self, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.remove(ws)


manager = ConnectionManager()


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def _redis_event_broadcaster() -> None:
    """Subscribe to Redis channel and forward events to all WebSocket clients."""
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe("meridian:events")
    logger.info("redis_broadcaster_started")

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        payload = message["data"]
        if payload and manager._connections:
            await manager.broadcast(payload)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
