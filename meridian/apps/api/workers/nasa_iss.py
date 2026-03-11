import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel


class NASAISSWorker(FeedWorker):
    """NASA Open Notify — ISS current position (live tracking)."""

    source_id = "nasa_iss"
    display_name = "NASA ISS Position"
    category = FeedCategory.space
    refresh_interval = 5

    _URL = "http://api.open-notify.org/iss-now.json"
    _CREW_URL = "http://api.open-notify.org/astros.json"

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(self._URL)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

            crew_count = 0
            try:
                crew_resp = await client.get(self._CREW_URL)
                crew_resp.raise_for_status()
                crew_data = crew_resp.json()
                crew_count = len([p for p in crew_data.get("people", []) if p.get("craft") == "ISS"])
            except Exception:
                pass

        pos = data.get("iss_position", {})
        lat = float(pos.get("latitude", 0))
        lng = float(pos.get("longitude", 0))
        ts = data.get("timestamp", 0)

        event_time = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else datetime.now(timezone.utc)

        return [GeoEvent(
            id=f"iss_{ts}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.info,
            title=f"ISS — Live Position ({crew_count} crew)" if crew_count else "ISS — Live Position",
            body=f"International Space Station at {lat:.4f}°, {lng:.4f}°",
            lat=lat,
            lng=lng,
            event_time=event_time.isoformat(),
            url="https://www.nasa.gov/international-space-station/",
            metadata={"crew_aboard": crew_count, "altitude_km": 408},
        )]
