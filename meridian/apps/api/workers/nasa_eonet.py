"""NASA EONET — Earth Observatory Natural Event Tracker."""
import httpx
from datetime import datetime, timezone
from workers.base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_CATEGORY_MAP = {
    "Wildfires": (FeedCategory.environment, SeverityLevel.high),
    "Severe Storms": (FeedCategory.environment, SeverityLevel.high),
    "Volcanoes": (FeedCategory.environment, SeverityLevel.high),
    "Sea and Lake Ice": (FeedCategory.environment, SeverityLevel.low),
    "Earthquakes": (FeedCategory.environment, SeverityLevel.medium),
    "Floods": (FeedCategory.environment, SeverityLevel.high),
    "Landslides": (FeedCategory.environment, SeverityLevel.medium),
    "Snow": (FeedCategory.environment, SeverityLevel.low),
    "Drought": (FeedCategory.environment, SeverityLevel.medium),
    "Dust and Haze": (FeedCategory.environment, SeverityLevel.low),
    "Manmade": (FeedCategory.humanitarian, SeverityLevel.medium),
    "Water Color": (FeedCategory.environment, SeverityLevel.info),
}


class NASAEONETWorker(FeedWorker):
    source_id = "nasa_eonet"
    display_name = "NASA EONET Natural Events"
    category = FeedCategory.environment
    refresh_interval = 600
    _api_url = "https://eonet.gsfc.nasa.gov/api/v3/events"

    async def fetch(self) -> list[GeoEvent]:
        params = {"limit": 100, "status": "open", "days": 7}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(self._api_url, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for item in data.get("events", []):
            categories = item.get("categories", [])
            cat_name = categories[0].get("title", "Wildfires") if categories else "Wildfires"
            category, severity = _CATEGORY_MAP.get(cat_name, (FeedCategory.environment, SeverityLevel.medium))

            geometries = item.get("geometry", [])
            if not geometries:
                continue
            last_geom = geometries[-1]
            coords = last_geom.get("coordinates", [])
            if not coords or len(coords) < 2:
                continue

            if isinstance(coords[0], list):
                lng, lat = coords[0]
            else:
                lng, lat = coords[0], coords[1]

            date_str = last_geom.get("date", "")
            try:
                event_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            except Exception:
                event_time = datetime.now(timezone.utc)

            events.append(GeoEvent(
                source_id=self.source_id,
                category=category,
                title=item.get("title", "Natural event"),
                body=f"{cat_name} — EONET ID {item.get('id', '')}",
                severity=severity,
                lat=float(lat),
                lng=float(lng),
                event_time=event_time,
                url=item.get("link"),
                metadata={
                    "eonet_id": item.get("id"),
                    "category": cat_name,
                    "status": item.get("status"),
                    "sources": [s.get("id") for s in item.get("sources", [])],
                },
            ))
        return events
