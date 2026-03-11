"""EMSC — European Mediterranean Seismological Centre near-real-time earthquakes."""
import httpx
from datetime import datetime, timezone
from workers.base import FeedWorker
from models.geo_event import GeoEvent


class EMSCEarthquakesWorker(FeedWorker):
    source_id = "emsc_earthquakes"
    display_name = "EMSC Earthquakes"
    category = "environment"
    refresh_interval = 300
    _api_url = "https://www.seismicportal.eu/fdsnws/event/1/query"

    async def fetch(self) -> list[GeoEvent]:
        from datetime import timedelta
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
        params = {
            "format": "json",
            "limit": 100,
            "minmag": 4.0,
            "orderby": "time",
            "starttime": since,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(self._api_url, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [])

            if len(coords) < 2:
                continue

            lng, lat = float(coords[0]), float(coords[1])
            depth = float(coords[2]) if len(coords) > 2 else 0.0
            mag = props.get("mag", 0.0)

            severity = "critical" if mag >= 7.0 else "high" if mag >= 6.0 else "medium" if mag >= 5.0 else "low"

            time_ms = props.get("time", 0)
            try:
                event_time = datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc)
            except Exception:
                event_time = datetime.now(timezone.utc)

            region = props.get("flynn_region") or props.get("region", "Unknown")

            events.append(GeoEvent(
                source_id=self.source_id,
                category=self.category,
                title=f"M{mag:.1f} Earthquake — {region}",
                body=f"Depth: {depth:.0f}km | {props.get('magtype', 'Mw')} {mag}",
                severity=severity,
                lat=lat,
                lng=lng,
                event_time=event_time,
                metadata={
                    "magnitude": mag,
                    "depth_km": depth,
                    "region": region,
                    "event_id": props.get("unid"),
                    "magtype": props.get("magtype"),
                },
            ))
        return events
