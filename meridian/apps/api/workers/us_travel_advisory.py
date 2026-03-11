"""US State Department travel advisories."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from ._country_coords import COUNTRY_COORDS

_LEVEL_SEVERITY = {1: SeverityLevel.low, 2: SeverityLevel.low, 3: SeverityLevel.medium, 4: SeverityLevel.high}


class USTravelAdvisoryWorker(FeedWorker):
    source_id = "us_travel_advisory"
    display_name = "US State Dept — Travel Advisories"
    category = FeedCategory.geopolitical
    refresh_interval = 21600  # 6 hours

    _URL = "https://travel.state.gov/content/dam/travelsite/json/TravelAdvisory.json"

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(self._URL)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        advisories = data.get("data", {})
        for country_code, info in advisories.items():
            level = info.get("level", 0)
            if level < 3:
                continue
            name = info.get("name", country_code)
            message = info.get("message", "")
            date = info.get("date", "")
            url = info.get("url", "")

            coords = COUNTRY_COORDS.get(country_code.lower())
            lat, lng = coords if coords else (0.0, 0.0)
            if lat == 0.0 and lng == 0.0:
                continue

            try:
                event_time = datetime.fromisoformat(date.replace("Z", "+00:00")) if date else datetime.now(timezone.utc)
            except Exception:
                event_time = datetime.now(timezone.utc)

            events.append(GeoEvent(
                id=f"travel_adv_{country_code}",
                source_id=self.source_id,
                category=self.category,
                severity=_LEVEL_SEVERITY.get(level, SeverityLevel.medium),
                title=f"Travel Advisory Level {level}: {name}",
                body=message[:300] if message else f"US State Department Level {level} travel advisory for {name}.",
                lat=lat, lng=lng,
                event_time=event_time.isoformat(),
                url=url or "https://travel.state.gov/",
                metadata={"country_code": country_code, "level": level, "country": name},
            ))
        return events
