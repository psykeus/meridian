"""NOAA Space Weather Prediction Center — solar flares and geomagnetic storm alerts."""
import httpx
from datetime import datetime, timezone
from workers.base import FeedWorker
from models.geo_event import GeoEvent

_CATEGORY_SEVERITY = {
    "X": "critical",
    "M": "high",
    "C": "medium",
    "B": "low",
    "A": "info",
}


class NOAASpaceWeatherWorker(FeedWorker):
    source_id = "noaa_space_weather"
    display_name = "NOAA Space Weather"
    category = "space"
    refresh_interval = 1800
    _api_url = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json"
    _alerts_url = "https://services.swpc.noaa.gov/products/alerts.json"

    async def fetch(self) -> list[GeoEvent]:
        events: list[GeoEvent] = []
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(self._alerts_url)
                resp.raise_for_status()
                alerts = resp.json()
        except Exception:
            return []

        for alert in alerts[:20]:
            message = alert.get("message", "")
            issue_time = alert.get("issue_datetime", "")
            product_id = alert.get("product_id", "")

            if not message or "CANCEL" in product_id:
                continue

            title = message.split("\n")[0].strip()[:300]
            if not title:
                continue

            class_key = ""
            for key in _CATEGORY_SEVERITY:
                if f"class {key}" in message or f"Class {key}" in message:
                    class_key = key
                    break

            severity = _CATEGORY_SEVERITY.get(class_key, "medium")

            try:
                ts = datetime.strptime(issue_time, "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
            except Exception:
                try:
                    ts = datetime.fromisoformat(issue_time.replace("Z", "+00:00"))
                except Exception:
                    ts = datetime.now(timezone.utc)

            events.append(GeoEvent(
                source_id=self.source_id,
                title=title,
                body=message[:600],
                category="space",
                severity=severity,
                lat=0.0,
                lng=0.0,
                event_time=ts,
            ))

        return events
