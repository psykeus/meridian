from fastapi import APIRouter

from core.credential_store import get_credential, list_configured, set_credential

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.get("")
async def get_credentials() -> dict:
    """Return which env-var keys have a configured value (DB or env).
    Values are never returned — only True/False per key."""
    configured = list_configured()
    return {"configured": configured}


@router.put("")
async def save_credentials(data: dict[str, str]) -> dict:
    """Persist credential values to DB and update the in-process cache.
    Pass an empty string to clear a key."""
    saved: list[str] = []
    for key, value in data.items():
        if key:
            await set_credential(key.strip(), value.strip())
            saved.append(key)
    return {"saved": saved}


@router.get("/{key}/configured")
async def is_key_configured(key: str) -> dict:
    """Check if a single key has a value."""
    return {"key": key, "configured": bool(get_credential(key))}
