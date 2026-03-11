from datetime import datetime, timedelta, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"


def _magnitude_to_severity(mag: float) -> SeverityLevel:
    if mag >= 7.0:
        return SeverityLevel.critical
    if mag >= 6.0:
        return SeverityLevel.high
    if mag >= 5.0:
        return SeverityLevel.medium
    if mag >= 4.0:
        return SeverityLevel.low
    return SeverityLevel.info


class USGSEarthquakesWorker(FeedWorker):
    source_id = "usgs_earthquakes"
    display_name = "USGS Earthquake Catalog"
    category = FeedCategory.environment
    refresh_interval = 60

    def __init__(self, min_magnitude: float = 2.5) -> None:
        self.min_magnitude = min_magnitude

    async def fetch(self) -> list[GeoEvent]:
        start_time = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime(
            "%Y-%m-%dT%H:%M:%S"
        )
        params = {
            "format": "geojson",
            "starttime": start_time,
            "minmagnitude": self.min_magnitude,
            "orderby": "time",
            "limit": 200,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(USGS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            coords = feature.get("geometry", {}).get("coordinates", [None, None, None])
            if coords[0] is None or coords[1] is None:
                continue

            mag = props.get("mag") or 0.0
            place = props.get("place") or "Unknown location"
            ts_ms = props.get("time")
            event_time = (
                datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
                if ts_ms
                else datetime.now(timezone.utc)
            )

            events.append(
                GeoEvent(
                    id=feature.get("id", ""),
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="earthquake",
                    title=f"M{mag:.1f} — {place}",
                    body=props.get("detail"),
                    severity=_magnitude_to_severity(mag),
                    lat=coords[1],
                    lng=coords[0],
                    metadata={
                        "magnitude": mag,
                        "depth_km": coords[2],
                        "place": place,
                        "alert": props.get("alert"),
                        "tsunami": props.get("tsunami", 0),
                        "felt": props.get("felt"),
                        "sig": props.get("sig"),
                        "type": props.get("type"),
                        "status": props.get("status"),
                    },
                    url=props.get("url"),
                    event_time=event_time,
                )
            )

        return events
