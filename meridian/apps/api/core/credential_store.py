"""In-process credential store backed by the feed_credentials DB table.

Priority order for get_credential(key):
  1. DB row in feed_credentials (set via Settings UI)
  2. Environment variable (set in .env / Docker environment)
  3. Empty string

Workers call get_credential("OPENSKY_CLIENT_ID") instead of
get_settings().opensky_client_id so that UI-entered keys take effect
without restarting the container.
"""
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_cache: dict[str, str] = {}


async def load_from_db() -> None:
    """Load all stored credentials from DB into the in-process cache."""
    from core.database import AsyncSessionLocal
    from sqlalchemy import text

    global _cache
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT key, value FROM feed_credentials")
            )
            rows = result.fetchall()
            _cache = {r[0]: r[1] for r in rows if r[1]}
            logger.info(
                "credential_store_loaded",
                extra={"count": len(_cache)},
            )
    except Exception as exc:
        logger.warning("credential_store_load_failed", extra={"error": str(exc)})


def get_credential(key: str) -> str:
    """Return a credential value. DB value overrides env var."""
    return _cache.get(key) or os.environ.get(key, "")


# Only these credential key names are exposed via the API.
# Prevents leaking env vars like DATABASE_URL, SECRET_KEY, PATH, etc.
_CREDENTIAL_ALLOWLIST = {
    "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
    "LLM_MODEL", "LLM_PROVIDER",
    "OPENSKY_CLIENT_ID", "OPENSKY_CLIENT_SECRET",
    "ACLED_API_KEY", "ACLED_EMAIL",
    "SPACETRACK_USERNAME", "SPACETRACK_PASSWORD",
    "ALPHA_VANTAGE_API_KEY", "FINNHUB_API_KEY",
    "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET",
    "CLOUDFLARE_API_TOKEN",
    "COPERNICUS_API_KEY",
    "FLIGHTAWARE_API_KEY",
    "AISSTREAM_API_KEY",
    "NASA_API_KEY",
    "SENDGRID_API_KEY",
}


def list_configured() -> list[str]:
    """Return credential key names that have a non-empty value (DB or env).
    Only returns keys from the allowlist to prevent leaking sensitive env vars."""
    return [k for k in _CREDENTIAL_ALLOWLIST if get_credential(k)]


async def set_credential(key: str, value: str) -> None:
    """Persist a credential to DB and update the in-process cache."""
    from core.database import AsyncSessionLocal
    from sqlalchemy import text

    if value:
        _cache[key] = value
    else:
        _cache.pop(key, None)

    async with AsyncSessionLocal() as session:
        if value:
            await session.execute(
                text("""
                    INSERT INTO feed_credentials (key, value)
                    VALUES (:key, :value)
                    ON CONFLICT (key) DO UPDATE
                        SET value = EXCLUDED.value,
                            updated_at = now()
                """),
                {"key": key, "value": value},
            )
        else:
            await session.execute(
                text("DELETE FROM feed_credentials WHERE key = :key"),
                {"key": key},
            )
        await session.commit()
