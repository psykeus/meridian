"""USCG Homeport — US Coast Guard maritime incidents and safety broadcasts."""
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_RSS_URL = "https://homeport.uscg.mil/rss/news.xml"


class USCGMaritimeWorker(FeedWorker):
    source_id = "uscg_maritime"
    display_name = "USCG — Maritime Incidents & Broadcasts"
    category = FeedCategory.maritime
    refresh_interval = 3600

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(_RSS_URL)
            if not resp.is_success:
                return []

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            return []

        events: list[GeoEvent] = []
        for item in root.findall(".//item")[:20]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            desc = (item.findtext("description") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()

            try:
                from email.utils import parsedate_to_datetime
                event_time = parsedate_to_datetime(pub_date)
            except Exception:
                event_time = datetime.now(timezone.utc)

            severity = SeverityLevel.high if any(w in title.lower() for w in ["mayday", "distress", "missing", "sinking", "collision"]) else SeverityLevel.medium

            events.append(GeoEvent(
                id=f"uscg_{abs(hash(title + pub_date))}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"USCG: {title[:120]}",
                body=desc[:300] if desc else None,
                lat=29.76, lng=-90.07,
                event_time=event_time.isoformat(),
                url=link or "https://homeport.uscg.mil/",
                metadata={"source": "uscg_homeport"},
            ))
        return events
