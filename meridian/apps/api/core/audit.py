"""Audit logging middleware — records mutating API actions to the audit_logs table.

Fires AFTER successful POST/PUT/PATCH/DELETE requests (2xx status) as a
fire-and-forget background task so it never blocks the response.
"""

import asyncio
import logging
import re
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from core.config import get_settings
from core.database import AsyncSessionLocal
from core.security import decode_token
from models.org import AuditLog

logger = logging.getLogger(__name__)

# Strong references to fire-and-forget tasks so they aren't garbage-collected
_background_tasks: set[asyncio.Task] = set()

# HTTP methods that represent mutating actions
AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

METHOD_ACTION_MAP = {
    "POST": "create",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
}

# Paths that should never be audited
SKIP_PREFIXES = ("/health", "/ws/", "/docs", "/openapi.json", "/redoc")

# Regex to pull the first resource segment and optional sub-resource from a REST-style path.
# Examples:
#   /api/v1/plan-rooms/5/tasks/3  -> resource_type="plan-rooms", resource_id="5"
#   /api/v1/events/42             -> resource_type="events", resource_id="42"
#   /api/v1/events                -> resource_type="events", resource_id=None
#   /api/v1/auth/2fa/verify       -> resource_type="auth", resource_id=None
_RESOURCE_RE = re.compile(
    r"/api/v1/"
    r"(?P<type>[a-z][a-z0-9_-]*)"   # first resource type segment
    r"(?:/(?P<id>[^/]+))?"          # optional resource id
    r"(?:/.*)?"                     # optional trailing sub-resources
    r"/?$"
)

# Secondary pattern: grabs the plan_room_id when the path contains /plan-rooms/<id>/…
_PLAN_ROOM_RE = re.compile(r"/api/v1/plan-rooms/(?P<room_id>\d+)")


def _extract_resource(path: str) -> tuple[Optional[str], Optional[str], Optional[int]]:
    """Return (resource_type, resource_id, plan_room_id) from a URL path."""
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    plan_room_id: Optional[int] = None

    m = _RESOURCE_RE.match(path)
    if m:
        resource_type = m.group("type")
        resource_id = m.group("id")

    pm = _PLAN_ROOM_RE.search(path)
    if pm:
        plan_room_id = int(pm.group("room_id"))

    return resource_type, resource_id, plan_room_id


def _extract_user_id(request: Request) -> Optional[int]:
    """Best-effort extraction of user_id from the Authorization header JWT."""
    auth_header = request.headers.get("authorization")
    if not auth_header:
        return None

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    payload = decode_token(parts[1])
    if payload is None:
        return None

    try:
        return int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        return None


async def _persist_audit_log(
    user_id: Optional[int],
    action: str,
    resource_type: Optional[str],
    resource_id: Optional[str],
    plan_room_id: Optional[int],
    ip_address: Optional[str],
    detail: dict,
) -> None:
    """Insert a row into audit_logs inside its own short-lived session."""
    try:
        async with AsyncSessionLocal() as session:
            entry = AuditLog(
                user_id=user_id,
                plan_room_id=plan_room_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                detail=detail,
                ip_address=ip_address,
            )
            session.add(entry)
            await session.commit()
    except Exception:
        # Audit failures must never break the application
        logger.exception("audit_log_write_failed")


class AuditMiddleware(BaseHTTPMiddleware):
    """Starlette middleware that asynchronously records mutating API actions."""

    async def __call__(self, scope, receive, send):
        # BaseHTTPMiddleware breaks WebSocket connections — bypass entirely
        if scope["type"] == "websocket":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

    async def dispatch(self, request: Request, call_next):
        # Fast-path: skip non-mutating methods
        if request.method not in AUDITED_METHODS:
            return await call_next(request)

        path = request.url.path

        # Skip endpoints that should never be audited
        if any(path.startswith(prefix) for prefix in SKIP_PREFIXES):
            return await call_next(request)

        # Extract user before the response body is consumed
        user_id = _extract_user_id(request)
        ip_address = request.client.host if request.client else None

        response = await call_next(request)

        # Only audit successful mutations
        if 200 <= response.status_code < 300:
            resource_type, resource_id, plan_room_id = _extract_resource(path)
            action = METHOD_ACTION_MAP.get(request.method, request.method.lower())

            detail = {
                "method": request.method,
                "path": path,
                "status": response.status_code,
            }

            # Fire-and-forget: schedule the DB write without awaiting it.
            # We keep a strong reference in _background_tasks so the task is not
            # garbage-collected before completion.
            task = asyncio.create_task(
                _persist_audit_log(
                    user_id=user_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    plan_room_id=plan_room_id,
                    ip_address=ip_address,
                    detail=detail,
                )
            )
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

        return response
