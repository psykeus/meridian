import time
import httpx
from datetime import datetime, timezone
from typing import List, Optional
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel
from core.config import get_settings

# ── Emergency squawk classification ──────────────────────────────────────────
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

# OAuth2 Client Credentials (new auth flow replacing Basic Auth)
_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)
_STATES_URL = "https://opensky-network.org/api/states/all"

# Limit total aircraft events per fetch to keep DB manageable
_MAX_AIRCRAFT = 1000


class OpenSkyWorker(FeedWorker):
    """OpenSky Network — live ADS-B flight states for ALL airborne aircraft.

    Emits every airborne aircraft visible to ADS-B:
      - Emergency squawks (7700/7600/7500): critical/high/medium severity
      - All other airborne aircraft: info severity

    Auth priority:
      1. OAuth2 Client Credentials  (OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET)
      2. Legacy Basic Auth          (OPENSKY_USERNAME + OPENSKY_PASSWORD) — deprecated
      3. Anonymous                  (limited rate, fewer state vectors)
    """

    source_id = "opensky"
    display_name = "OpenSky Aircraft Tracking"
    category = FeedCategory.aviation
    refresh_interval = 60  # seconds — OpenSky anonymous: 10 req/min; authenticated: higher

    def __init__(self) -> None:
        super().__init__()
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0

    # ── Token management ──────────────────────────────────────────────────────

    async def _get_bearer_token(self, client: httpx.AsyncClient) -> Optional[str]:
        s = get_settings()
        if not (s.opensky_client_id and s.opensky_client_secret):
            return None
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
        if token:
            return {"headers": {"Authorization": f"Bearer {token}"}}
        s = get_settings()
        if s.opensky_username and s.opensky_password:
            return {"auth": (s.opensky_username, s.opensky_password)}
        return {}

    # ── Main fetch ────────────────────────────────────────────────────────────

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=30) as client:
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

        for state in states[:_MAX_AIRCRAFT]:
            try:
                (icao24, callsign, origin, time_pos, last_contact,
                 lng, lat, baro_alt, on_ground, velocity,
                 heading, vert_rate, sensors, geo_alt,
                 squawk, spi, position_source, *_) = state

                # Skip aircraft without a valid airborne position
                if lng is None or lat is None:
                    continue
                if on_ground:
                    continue
                if not (-90 <= float(lat) <= 90) or not (-180 <= float(lng) <= 180):
                    continue

                squawk_str = str(squawk or "").strip()
                callsign_str = (callsign or "").strip() or icao24.upper()
                altitude = float(geo_alt or baro_alt or 0)
                speed_ms = float(velocity or 0)
                speed_kt = round(speed_ms * 1.944)
                alt_ft = round(altitude * 3.28084)

                # Classify by squawk first, then default to info
                if squawk_str in _EMERGENCY_SQUAWKS:
                    severity = _SQUAWK_SEVERITY[squawk_str]
                    title = f"SQUAWK {squawk_str} — {_SQUAWK_LABELS[squawk_str]} [{callsign_str}]"
                    body = (
                        f"{callsign_str} ({icao24.upper()}) squawking {squawk_str}. "
                        f"Alt {alt_ft:,}ft · {speed_kt}kt · Origin: {origin or 'unknown'}"
                    )
                else:
                    severity = SeverityLevel.info
                    title = f"{callsign_str}"
                    body = (
                        f"Alt {alt_ft:,}ft · {speed_kt}kt"
                        + (f" · {origin}" if origin else "")
                        + (f" · Squawk {squawk_str}" if squawk_str else "")
                    )

                events.append(GeoEvent(
                    id=f"opensky_{icao24}_{last_contact or now_iso}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=title,
                    body=body,
                    lat=float(lat),
                    lng=float(lng),
                    event_time=now_iso,
                    metadata={
                        "icao24": icao24,
                        "callsign": callsign_str,
                        "origin_country": origin,
                        "baro_altitude": baro_alt,
                        "geo_altitude": geo_alt,
                        "velocity": velocity,
                        "true_track": heading,
                        "vertical_rate": vert_rate,
                        "squawk": squawk_str or None,
                        "on_ground": False,
                        "position_source": position_source,
                    },
                ))
            except Exception:
                continue

        return events
