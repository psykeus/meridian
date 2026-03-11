"""IAEA News RSS — International Atomic Energy Agency nuclear and radiological events."""
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from workers.base import FeedWorker
from models.geo_event import GeoEvent

_NUCLEAR_KEYWORDS = [
    "nuclear", "radiation", "radioactive", "reactor", "safeguards", "uranium", "plutonium",
    "INES", "incident", "emergency", "contamination", "facility", "alert",
]


class IAEANewsWorker(FeedWorker):
    source_id = "iaea_news"
    display_name = "IAEA Nuclear News"
    category = "nuclear"
    refresh_interval = 3600
    _rss_url = "https://www.iaea.org/feeds/topstories.xml"

    async def fetch(self) -> list[GeoEvent]:
        try:
            async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Meridian/1.0"}) as client:
                resp = await client.get(self._rss_url)
                resp.raise_for_status()
        except Exception:
            return []

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            return []

        events: list[GeoEvent] = []
        for item in root.findall(".//item")[:20]:
            title_el = item.find("title")
            desc_el = item.find("description")
            link_el = item.find("link")
            pub_el = item.find("pubDate")

            if title_el is None or title_el.text is None:
                continue

            title = title_el.text.strip()
            desc = (desc_el.text or "").strip() if desc_el is not None else ""
            combined = (title + " " + desc).lower()

            if not any(kw.lower() in combined for kw in _NUCLEAR_KEYWORDS):
                continue

            try:
                ts = parsedate_to_datetime(pub_el.text) if pub_el is not None and pub_el.text else datetime.now(timezone.utc)
                ts = ts.astimezone(timezone.utc).replace(tzinfo=timezone.utc)
            except Exception:
                ts = datetime.now(timezone.utc)

            events.append(GeoEvent(
                source_id=self.source_id,
                title=title[:300],
                body=desc[:600],
                category="nuclear",
                severity="medium",
                lat=0.0,
                lng=0.0,
                url=link_el.text.strip() if link_el is not None and link_el.text else None,
                event_time=ts,
            ))

        return events
