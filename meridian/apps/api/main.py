import asyncio
import logging

import orjson
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from core.redis_client import close_redis, get_redis
from core.rate_limiter import RateLimitMiddleware
from core.audit import AuditMiddleware
from core.security import decode_token
from routers import events, feeds, auth, alerts, plan_rooms, intel
from routers import orgs, tokens, exports, collab, chat_sessions, credentials, prompt_configs, proxy
from core.credential_store import load_from_db
from workers.scheduler import get_scheduler, run_all_workers_once
from services.alert_engine import run_alert_engine, dispose_alert_engine

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Meridian API starting up...")

    await load_from_db()

    scheduler = get_scheduler()
    scheduler.start()

    asyncio.create_task(run_all_workers_once())

    asyncio.create_task(_redis_event_broadcaster())
    asyncio.create_task(run_alert_engine())

    yield

    scheduler.shutdown(wait=False)
    await dispose_alert_engine()
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
app.add_middleware(AuditMiddleware)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(feeds.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(exports.router, prefix="/api/v1")       # before plan_rooms — /view/{token} must not be shadowed by /{room_id}
app.include_router(plan_rooms.router, prefix="/api/v1")
app.include_router(intel.router, prefix="/api/v1")
app.include_router(collab.router, prefix="/api/v1")
app.include_router(orgs.router, prefix="/api/v1")
app.include_router(tokens.router, prefix="/api/v1")
app.include_router(chat_sessions.router, prefix="/api/v1")
app.include_router(credentials.router, prefix="/api/v1")
app.include_router(prompt_configs.router, prefix="/api/v1")
app.include_router(proxy.router, prefix="/api/v1")


# ─── WebSocket connection manager ────────────────────────────────────────────

class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.info("ws_connected", extra={"total": len(self._connections)})

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.info("ws_disconnected", extra={"total": len(self._connections)})

    async def broadcast(self, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.discard(ws)


manager = ConnectionManager()


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket, token: str = Query(default="")) -> None:
    # Accept first so the client can see close codes/reasons
    await websocket.accept()

    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    manager._connections.add(websocket)
    logger.info("ws_connected", extra={"total": len(manager._connections)})
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        manager.disconnect(websocket)


async def _redis_event_broadcaster() -> None:
    """Subscribe to Redis channel and forward events to all WebSocket clients."""
    while True:
        try:
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
        except Exception as e:
            logger.error(f"redis_broadcaster_error: {e}, reconnecting in 5s")
            await asyncio.sleep(5)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
