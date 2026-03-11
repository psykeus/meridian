import httpx
import xml.etree.ElementTree as ET
import hashlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

_FEEDS = [
    ("Reuters World", "http://feeds.reuters.com/reuters/worldNews", 0.0, 0.0),
    ("AP Top News", "https://rsshub.app/apnews/topics/apf-topnews", 0.0, 0.0),
    ("BBC World", "http://feeds.bbci.co.uk/news/world/rss.xml", 51.5, -0.1),
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", 25.3, 51.5),
    ("DW World", "https://rss.dw.com/xml/rss-en-world", 52.5, 13.4),
]

_CRISIS_KEYWORDS = [
    ("war", SeverityLevel.critical),
    ("attack", SeverityLevel.high),
    ("killed", SeverityLevel.high),
    ("explosion", SeverityLevel.high),
    ("missile", SeverityLevel.high),
    ("earthquake", SeverityLevel.high),
    ("tsunami", SeverityLevel.critical),
    ("hurricane", SeverityLevel.high),
    ("sanction", SeverityLevel.medium),
    ("protest", SeverityLevel.medium),
    ("crisis", SeverityLevel.medium),
    ("flood", SeverityLevel.medium),
    ("fire", SeverityLevel.low),
]


def _title_severity(title: str) -> SeverityLevel:
    lower = title.lower()
    for kw, sev in _CRISIS_KEYWORDS:
        if kw in lower:
            return sev
    return SeverityLevel.info


class RSSNewsWorker(FeedWorker):
    """Wire service RSS feeds — Reuters, AP, BBC, Al Jazeera, DW."""

    source_id = "rss_news"
    display_name = "RSS Global News Feeds"
    category = FeedCategory.geopolitical
    refresh_interval = 300  # 5 minutes

    async def fetch(self) -> List[GeoEvent]:
        events: List[GeoEvent] = []
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            for feed_name, url, lat, lng in _FEEDS:
                try:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    root = ET.fromstring(resp.text)
                except Exception:
                    continue

                channel = root.find("channel") or root
                for item in channel.findall("item")[:20]:
                    try:
                        title = (item.findtext("title") or "").strip()
                        link = item.findtext("link") or ""
                        desc = item.findtext("description") or ""
                        pub_date = item.findtext("pubDate") or ""

                        if not title:
                            continue

                        try:
                            event_time = parsedate_to_datetime(pub_date).astimezone(timezone.utc)
                        except Exception:
                            event_time = datetime.now(timezone.utc)

                        item_hash = hashlib.md5(f"{feed_name}{title}".encode()).hexdigest()[:12]
                        severity = _title_severity(title)

                        clean_desc = desc.replace("<![CDATA[", "").replace("]]>", "").strip()[:300]

                        events.append(GeoEvent(
                            id=f"rss_{item_hash}",
                            source_id=self.source_id,
                            category=self.category,
                            severity=severity,
                            title=title[:200],
                            body=clean_desc or None,
                            lat=lat,
                            lng=lng,
                            event_time=event_time.isoformat(),
                            url=link or None,
                            metadata={"source": feed_name},
                        ))
                    except Exception:
                        continue

        return events
