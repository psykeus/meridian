"""Emergency Squawk Monitor — filters OpenSky data for aircraft broadcasting emergency transponder codes."""
import logging
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from core.credential_store import get_credential

logger = logging.getLogger(__name__)

_STATES_URL = "https://opensky-network.org/api/states/all"

# Emergency squawk codes and their classifications
_SQUAWK_SEVERITY = {
    "7500": SeverityLevel.critical,   # Hijack / unlawful interference
    "7600": SeverityLevel.medium,     # Radio failure (NORDO)
    "7700": SeverityLevel.high,       # General emergency
}
_SQUAWK_LABELS = {
    "7500": "Hijack / Unlawful Interference",
    "7600": "Radio Failure (NORDO)",
    "7700": "General Emergency",
}


class EmergencySquawksWorker(FeedWorker):
    """Monitors OpenSky ADS-B data for aircraft broadcasting emergency
    transponder codes (7500 hijack, 7600 radio failure, 7700 emergency).

    This is a focused, safety-critical subset of the full OpenSky feed.
    """

    source_id = "emergency_squawks"
    display_name = "Emergency Squawk Monitor"
    category = FeedCategory.aviation
    refresh_interval = 60  # 1 minute — critical safety monitoring
    run_on_startup = False  # avoid rate-limiting OpenSky on every API restart

    async def fetch(self) -> list[GeoEvent]:
        # Build auth — reuse same credential keys as the main OpenSky worker
        auth_kwargs: dict = {}
        username = get_credential("OPENSKY_USERNAME")
        password = get_credential("OPENSKY_PASSWORD")
        if username and password:
            auth_kwargs["auth"] = (username, password)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_STATES_URL, **auth_kwargs)
            resp.raise_for_status()
            data = resp.json()

        states = data.get("states") or []
        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)

        for state in states:
            try:
                (icao24, callsign, origin, _time_pos, _last_contact,
                 lng, lat, baro_alt, on_ground, velocity,
                 heading, vert_rate, _sensors, geo_alt,
                 squawk, _spi, _position_source, *_rest) = state

                if lng is None or lat is None:
                    continue
                if on_ground:
                    continue

                squawk_str = str(squawk or "").strip()
                if squawk_str not in _SQUAWK_SEVERITY:
                    continue

                # Validate coordinates
                if not (-90 <= float(lat) <= 90) or not (-180 <= float(lng) <= 180):
                    continue

                callsign_str = (callsign or "").strip() or icao24.upper()
                altitude = float(geo_alt or baro_alt or 0)
                speed_ms = float(velocity or 0)
                speed_kt = round(speed_ms * 1.944)
                alt_ft = round(altitude * 3.28084)

                severity = _SQUAWK_SEVERITY[squawk_str]
                label = _SQUAWK_LABELS[squawk_str]

                title = f"SQUAWK {squawk_str} — {label} [{callsign_str}]"
                body = (
                    f"{callsign_str} ({icao24.upper()}) squawking {squawk_str} ({label}). "
                    f"Alt {alt_ft:,} ft · {speed_kt} kt · Origin: {origin or 'unknown'}"
                )

                events.append(GeoEvent(
                    id=f"esq_{icao24}_{squawk_str}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=title,
                    body=body,
                    lat=float(lat),
                    lng=float(lng),
                    event_time=now,
                    url=f"https://opensky-network.org/aircraft-profile?icao24={icao24}",
                    metadata={
                        "squawk": squawk_str,
                        "squawk_meaning": label,
                        "callsign": callsign_str,
                        "icao24": icao24,
                        "velocity_ms": velocity,
                        "velocity_kt": speed_kt,
                        "altitude_m": altitude,
                        "altitude_ft": alt_ft,
                        "heading": heading,
                        "vertical_rate": vert_rate,
                        "origin_country": origin,
                        "on_ground": False,
                    },
                ))
            except Exception:
                continue

        return events
