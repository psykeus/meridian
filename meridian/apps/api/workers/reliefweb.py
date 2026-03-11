"""ReliefWeb API worker — UN OCHA humanitarian situation reports and disaster events."""
import httpx
from datetime import datetime, timezone
from workers.base import FeedWorker
from models.geo_event import GeoEvent


class ReliefWebWorker(FeedWorker):
    source_id = "reliefweb"
    display_name = "ReliefWeb Disasters"
    category = "humanitarian"
    refresh_interval = 900
    _api_url = "https://api.reliefweb.int/v1/disasters"

    async def fetch(self) -> list[GeoEvent]:
        params = {
            "appname": "meridian-platform",
            "limit": 50,
            "fields[include][]": ["name", "status", "country", "type", "date", "primary_country", "glide"],
            "sort[]": "date:desc",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(self._api_url, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for item in data.get("data", []):
            fields = item.get("fields", {})
            primary = fields.get("primary_country", {})
            country_name = primary.get("name", "Unknown")
            lat = primary.get("location", {}).get("lat", 0.0) if primary else 0.0
            lng = primary.get("location", {}).get("lon", 0.0) if primary else 0.0

            if not lat and not lng:
                lat, lng = 0.0, 0.0

            status = fields.get("status", "alert")
            severity = "high" if status == "alert" else "medium" if status == "ongoing" else "low"

            event_time_str = fields.get("date", {}).get("created", "")
            try:
                event_time = datetime.fromisoformat(event_time_str.replace("Z", "+00:00"))
            except Exception:
                event_time = datetime.now(timezone.utc)

            dtype = ""
            if isinstance(fields.get("type"), list) and fields["type"]:
                dtype = fields["type"][0].get("name", "")

            events.append(GeoEvent(
                source_id=self.source_id,
                category=self.category,
                title=fields.get("name", "Humanitarian event"),
                body=f"{dtype} — {country_name} ({status})",
                severity=severity,
                lat=lat,
                lng=lng,
                event_time=event_time,
                metadata={
                    "disaster_id": item.get("id"),
                    "status": status,
                    "country": country_name,
                    "disaster_type": dtype,
                    "glide": fields.get("glide"),
                },
            ))
        return events
