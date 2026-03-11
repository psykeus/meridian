"""Redis-based rate limiting middleware. Tier-based: free=60/min, pro=300/min, enterprise=1000/min."""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from core.redis_client import get_redis

logger = logging.getLogger(__name__)

TIER_LIMITS: dict[str, int] = {
    "free": 60,
    "pro": 300,
    "team": 600,
    "enterprise": 1000,
    "unlimited": 99999,
}

# Paths that bypass rate limiting
BYPASS_PREFIXES = ("/health", "/ws/", "/docs", "/openapi.json")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip rate limiting for bypass paths
        if any(path.startswith(p) for p in BYPASS_PREFIXES):
            return await call_next(request)

        # Identify caller: prefer user_id from JWT, fall back to IP
        key_id = request.client.host if request.client else "unknown"
        tier = "free"

        # Try to extract user info from state (set by auth dependency)
        if hasattr(request.state, "user_id"):
            key_id = f"user:{request.state.user_id}"
            tier = getattr(request.state, "user_tier", "free")
        else:
            # For unauthenticated requests, use IP
            key_id = f"ip:{key_id}"

        limit = TIER_LIMITS.get(tier, TIER_LIMITS["free"])
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
