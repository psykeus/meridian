import time
import httpx
from datetime import datetime, timezone
from typing import List, Optional
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel
from core.config import get_settings

_EMERGENCY_SQUAWKS = {"7700", "7600", "7500"}

_SQUAWK_LABELS = {
    "7700": "General Emergency",
    "7600": "Radio Failure",
    "7500": "Hijack / Unlawful Interference",
}

_SQUAWK_SEVERITY = {
    "7700": SeverityLevel.high,
    "7600": SeverityLevel.medium,
    "7500": SeverityLevel.critical,
}

# OAuth2 Client Credentials endpoint (new auth flow)
_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)
_STATES_URL = "https://opensky-network.org/api/states/all"


class OpenSkyWorker(FeedWorker):
    """OpenSky Network — live ADS-B flight states (emergency squawks only).

    Auth priority:
      1. OAuth2 Client Credentials (OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET)
      2. Legacy Basic Auth (OPENSKY_USERNAME + OPENSKY_PASSWORD) — deprecated,
         supported only during OpenSky's transition period.
      3. Anonymous — limited to 10 req/min and fewer state vectors.
    """

    source_id = "opensky"
    display_name = "OpenSky Aircraft Tracking"
    category = FeedCategory.aviation
    refresh_interval = 15

    def __init__(self) -> None:
        super().__init__()
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0

    # ── Token management ──────────────────────────────────────────────────────

    async def _get_bearer_token(self, client: httpx.AsyncClient) -> Optional[str]:
        """Fetch/refresh an OAuth2 access token using Client Credentials flow."""
        s = get_settings()
        if not (s.opensky_client_id and s.opensky_client_secret):
            return None

        # Return cached token if still valid (with 30s buffer)
        if self._token and time.monotonic() < self._token_expires_at - 30:
            return self._token

        try:
            resp = await client.post(
                _TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": s.opensky_client_id,
                    "client_secret": s.opensky_client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10,
            )
            resp.raise_for_status()
            payload = resp.json()
            self._token = payload["access_token"]
            self._token_expires_at = time.monotonic() + float(payload.get("expires_in", 300))
            return self._token
        except Exception:
            self._token = None
            return None

    def _build_auth(self, token: Optional[str]) -> dict:
        """Return appropriate auth kwargs for httpx based on available credentials."""
        if token:
            return {"headers": {"Authorization": f"Bearer {token}"}}

        # Legacy Basic Auth fallback (will stop working once OpenSky ends support)
        s = get_settings()
        if s.opensky_username and s.opensky_password:
            return {"auth": (s.opensky_username, s.opensky_password)}

        return {}

    # ── Main fetch ────────────────────────────────────────────────────────────

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=20) as client:
            token = await self._get_bearer_token(client)
            auth_kwargs = self._build_auth(token)

            try:
                resp = await client.get(
                    _STATES_URL,
                    params={"extended": 1},
                    **auth_kwargs,
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

        states = data.get("states") or []
        events: List[GeoEvent] = []
        now_iso = datetime.now(timezone.utc).isoformat()

        for state in states:
            try:
                (icao24, callsign, origin, time_pos, last_contact,
                 lng, lat, baro_alt, on_ground, velocity,
                 heading, vert_rate, sensors, geo_alt,
                 squawk, spi, position_source, *_) = state

                if lng is None or lat is None or on_ground:
                    continue

                squawk = str(squawk or "").strip()
                callsign = (callsign or "").strip()

                if squawk not in _EMERGENCY_SQUAWKS:
                    continue

                severity = _SQUAWK_SEVERITY[squawk]
                label = _SQUAWK_LABELS[squawk]

                events.append(GeoEvent(
                    id=f"opensky_{icao24}_{squawk}_{last_contact}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"SQUAWK {squawk} — {label}" + (f" [{callsign}]" if callsign else ""),
                    body=(
                        f"Aircraft {icao24.upper()} squawking {squawk} at "
                        f"{(geo_alt or baro_alt or 0):.0f}m altitude"
                    ),
                    lat=float(lat),
                    lng=float(lng),
                    event_time=now_iso,
                    metadata={
                        "icao24": icao24,
                        "callsign": callsign,
                        "squawk": squawk,
                        "altitude_m": geo_alt or baro_alt,
                        "velocity_ms": velocity,
                        "origin_country": origin,
                    },
                ))
            except Exception:
                continue

        return events
