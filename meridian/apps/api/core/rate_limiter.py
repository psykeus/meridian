"""Redis-based rate limiting middleware. Flat limits: 600/min authenticated, 120/min anonymous."""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from core.redis_client import get_redis

logger = logging.getLogger(__name__)

RATE_LIMIT_AUTHENTICATED = 600  # per user per minute
RATE_LIMIT_ANONYMOUS = 120      # per IP per minute

# Paths that bypass rate limiting
BYPASS_PREFIXES = ("/health", "/ws/", "/docs", "/openapi.json")


def _extract_user_from_jwt(request: Request) -> str | None:
    """Extract user_id from the Authorization header JWT.

    Returns user_id or None if no valid JWT is found.
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        from core.security import decode_token
        payload = decode_token(token)
        if payload and payload.get("type") == "access":
            return payload.get("sub")
    except Exception:
        pass
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def __call__(self, scope, receive, send):
        # BaseHTTPMiddleware breaks WebSocket connections — bypass entirely
        if scope["type"] == "websocket":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip rate limiting for bypass paths
        if any(path.startswith(p) for p in BYPASS_PREFIXES):
            return await call_next(request)

        # Identify caller: extract user_id from JWT, fall back to IP
        ip = request.client.host if request.client else "unknown"
        user_id = _extract_user_from_jwt(request)

        if user_id:
            key_id = f"user:{user_id}"
            limit = RATE_LIMIT_AUTHENTICATED
        else:
            key_id = f"ip:{ip}"
            limit = RATE_LIMIT_ANONYMOUS

        window = 60  # 1-minute window

        try:
            redis = await get_redis()
            redis_key = f"rl:{key_id}:{int(time.time()) // window}"

            current = await redis.incr(redis_key)
            if current == 1:
                await redis.expire(redis_key, window + 5)

            # Add rate limit headers
            response = await call_next(request) if current <= limit else JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again shortly."},
            )

            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(max(0, limit - current))
            response.headers["X-RateLimit-Reset"] = str(((int(time.time()) // window) + 1) * window)

            return response

        except Exception:
            # If Redis is down, don't block requests
            logger.debug("rate_limit_redis_unavailable")
            return await call_next(request)
