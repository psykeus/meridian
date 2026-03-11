import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel


_ALERT_COLOR_SEVERITY = {
    "Red": SeverityLevel.critical,
    "Orange": SeverityLevel.high,
    "Green": SeverityLevel.medium,
}


class GDACSWorker(FeedWorker):
    """GDACS — Global Disaster Alert and Coordination System composite feed."""

    source_id = "gdacs"
    display_name = "GDACS Global Disaster Alerts"
    category = FeedCategory.environment
    refresh_interval = 1800  # 30 minutes

    _RSS_URL = "https://www.gdacs.org/xml/rss.xml"

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(self._RSS_URL)
                resp.raise_for_status()
            except Exception:
                return []

        events: List[GeoEvent] = []
        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            return []

        ns = {
            "gdacs": "http://www.gdacs.org",
            "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#",
            "dc": "http://purl.org/dc/elements/1.1/",
        }

        channel = root.find("channel")
        if channel is None:
            return []

        for item in channel.findall("item")[:100]:
            try:
                title = (item.findtext("title") or "GDACS Event").strip()
                link = item.findtext("link") or ""
                desc = item.findtext("description") or ""
                pub_date_str = item.findtext("pubDate") or ""
                alert_color = item.findtext("gdacs:alertlevel", namespaces=ns) or "Green"
                event_type = item.findtext("gdacs:eventtype", namespaces=ns) or "unknown"
                country = item.findtext("gdacs:country", namespaces=ns) or ""

                lat_str = item.findtext("geo:lat", namespaces=ns)
                lng_str = item.findtext("geo:long", namespaces=ns)
                if not lat_str or not lng_str:
                    continue
                lat, lng = float(lat_str), float(lng_str)

                try:
                    event_time = datetime.strptime(
                        pub_date_str, "%a, %d %b %Y %H:%M:%S %Z"
                    ).replace(tzinfo=timezone.utc)
                except Exception:
                    event_time = datetime.now(timezone.utc)

                severity = _ALERT_COLOR_SEVERITY.get(alert_color, SeverityLevel.low)
                event_id = item.findtext("gdacs:eventid", namespaces=ns) or f"{lat:.4f}_{lng:.4f}"

                events.append(GeoEvent(
                    id=f"gdacs_{event_type}_{event_id}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=title,
                    body=desc[:300] if desc else None,
                    lat=lat,
                    lng=lng,
                    event_time=event_time.isoformat(),
                    url=link or None,
                    metadata={
                        "event_type": event_type,
                        "alert_color": alert_color,
                        "country": country,
                    },
                ))
            except Exception:
                continue

        return events
