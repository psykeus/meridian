import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

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


class OpenSkyWorker(FeedWorker):
    """OpenSky Network — live ADS-B flight states (emergency squawks only, then full sample)."""

    source_id = "opensky"
    display_name = "OpenSky Aircraft Tracking"
    category = FeedCategory.aviation
    refresh_interval = 15

    _URL = "https://opensky-network.org/api/states/all"

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=20) as client:
            try:
                resp = await client.get(self._URL, params={"extended": 1})
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
                    body=f"Aircraft {icao24.upper()} squawking {squawk} at "
                         f"{(geo_alt or baro_alt or 0):.0f}m altitude",
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
