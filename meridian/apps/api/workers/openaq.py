"""OpenAQ — real-time air quality hazard events (PM2.5 / AQI threshold crossings)."""
import logging
import httpx
from datetime import datetime, timezone
from workers.base import FeedWorker
from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

logger = logging.getLogger(__name__)

_AQI_THRESHOLDS = [
    (300, SeverityLevel.critical),
    (200, SeverityLevel.high),
    (150, SeverityLevel.medium),
    (100, SeverityLevel.low),
]


def _severity(value: float) -> SeverityLevel:
    for threshold, sev in _AQI_THRESHOLDS:
        if value >= threshold:
            return sev
    return SeverityLevel.info


class OpenAQWorker(FeedWorker):
    source_id = "openaq"
    display_name = "OpenAQ Air Quality"
    category = FeedCategory.environment
    refresh_interval = 1800
    _api_url = "https://api.openaq.org/v2/measurements"

    async def fetch(self) -> list[GeoEvent]:
        params = {
            "parameter": "pm25",
            "limit": 100,
            "order_by": "datetime",
            "sort": "desc",
            "value_from": 100,
        }
        api_key = get_credential("OPENAQ_API_KEY")
        headers = {"X-API-Key": api_key} if api_key else {}
        try:
            async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                resp = await client.get(self._api_url, params=params)
                if resp.status_code == 403:
                    return []
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            return []

        seen: set[str] = set()
        events: list[GeoEvent] = []

        for result in data.get("results", []):
            location = result.get("location", "")
            city = result.get("city", "")
            country = result.get("country", "")
            coords = result.get("coordinates", {})
            lat = coords.get("latitude", 0.0) or 0.0
            lng = coords.get("longitude", 0.0) or 0.0
            value = result.get("value", 0.0) or 0.0

            key = f"{country}:{city}:{location}"
            if key in seen or value < 100:
                continue
            seen.add(key)

            try:
                ts_str = result.get("date", {}).get("utc", "")
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")) if ts_str else datetime.now(timezone.utc)
            except Exception:
                ts = datetime.now(timezone.utc)

            place = ", ".join(p for p in [location, city, country] if p)
            events.append(GeoEvent(
                source_id=self.source_id,
                title=f"PM2.5 hazard: {value:.0f} µg/m³ — {place}",
                body=f"PM2.5 concentration of {value:.1f} µg/m³ recorded at {place}. WHO 24h guideline is 15 µg/m³.",
                category=FeedCategory.environment,
                severity=_severity(value),
                lat=lat,
                lng=lng,
                event_time=ts,
            ))

        return events[:50]
