from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

NOAA_ALERTS_URL = "https://api.weather.gov/alerts/active"

_SEVERITY_MAP: dict[str, SeverityLevel] = {
    "Extreme": SeverityLevel.critical,
    "Severe": SeverityLevel.high,
    "Moderate": SeverityLevel.medium,
    "Minor": SeverityLevel.low,
    "Unknown": SeverityLevel.info,
}

_PRIORITY_EVENTS = {
    "Tornado Warning", "Tornado Emergency", "Flash Flood Emergency",
    "Tsunami Warning", "Extreme Wind Warning", "Hurricane Warning",
    "Typhoon Warning", "Blizzard Warning", "Ice Storm Warning",
    "Severe Thunderstorm Warning",
}


class NOAAWeatherAlertsWorker(FeedWorker):
    source_id = "noaa_weather_alerts"
    display_name = "NOAA NWS Active Alerts"
    category = FeedCategory.environment
    refresh_interval = 120

    async def fetch(self) -> list[GeoEvent]:
        headers = {"User-Agent": "Meridian/1.0 (open-source; github.com/your-org/meridian)"}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                NOAA_ALERTS_URL,
                params={"status": "actual", "limit": 500},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geometry = feature.get("geometry")

            lat, lng = self._extract_centroid(geometry, props)
            if lat is None or lng is None:
                continue

            event_name = props.get("event", "Weather Alert")
            severity_str = props.get("severity", "Unknown")
            severity = _SEVERITY_MAP.get(severity_str, SeverityLevel.info)

            if event_name in _PRIORITY_EVENTS and severity == SeverityLevel.medium:
                severity = SeverityLevel.high

            onset_str = props.get("onset") or props.get("effective")
            event_time = (
                datetime.fromisoformat(onset_str.replace("Z", "+00:00"))
                if onset_str
                else datetime.now(timezone.utc)
            )

            headline = props.get("headline") or event_name
            description = props.get("description", "")[:500] if props.get("description") else None

            events.append(
                GeoEvent(
                    id=props.get("id", ""),
                    source_id=self.source_id,
                    category=self.category,
                    subcategory=event_name.lower().replace(" ", "_"),
                    title=headline,
                    body=description,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    metadata={
                        "event": event_name,
                        "severity": severity_str,
                        "certainty": props.get("certainty"),
                        "urgency": props.get("urgency"),
                        "area_desc": props.get("areaDesc"),
                        "sender_name": props.get("senderName"),
                        "expires": props.get("expires"),
                        "instruction": (props.get("instruction") or "")[:300],
                    },
                    url=props.get("@id"),
                    event_time=event_time,
                )
            )

        return events

    def _extract_centroid(
        self, geometry: dict | None, props: dict
    ) -> tuple[float | None, float | None]:
        if geometry and geometry.get("type") == "Point":
            coords = geometry["coordinates"]
            return coords[1], coords[0]

        if geometry and geometry.get("type") == "Polygon":
            coords = geometry["coordinates"][0]
            lats = [c[1] for c in coords]
            lngs = [c[0] for c in coords]
            return sum(lats) / len(lats), sum(lngs) / len(lngs)

        geocode = props.get("geocode", {})
        same = geocode.get("SAME", [])
        if same:
            return None, None

        return None, None
