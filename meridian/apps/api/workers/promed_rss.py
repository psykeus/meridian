"""ProMED Mail RSS — International Society for Infectious Diseases disease outbreak alerts."""
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from workers.base import FeedWorker
from models.geo_event import GeoEvent

_KEYWORDS = [
    "outbreak", "epidemic", "cluster", "cases", "deaths", "alert", "ebola", "cholera",
    "dengue", "mpox", "avian influenza", "salmonella", "e. coli", "hepatitis", "rabies",
]


class ProMEDRSSWorker(FeedWorker):
    source_id = "promed_rss"
    display_name = "ProMED Disease Alerts"
    category = "humanitarian"
    refresh_interval = 1800
    _rss_url = "https://promedmail.org/feed/"

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
        for item in root.findall(".//item")[:30]:
            title_el = item.find("title")
            desc_el = item.find("description")
            link_el = item.find("link")
            pub_el = item.find("pubDate")

            if title_el is None or title_el.text is None:
                continue

            title = title_el.text.strip()
            if not any(kw in title.lower() for kw in _KEYWORDS):
                continue

            desc = (desc_el.text or "").strip() if desc_el is not None else ""

            try:
                ts = parsedate_to_datetime(pub_el.text) if pub_el is not None and pub_el.text else datetime.now(timezone.utc)
                ts = ts.astimezone(timezone.utc).replace(tzinfo=timezone.utc)
            except Exception:
                ts = datetime.now(timezone.utc)

            events.append(GeoEvent(
                source_id=self.source_id,
                title=title[:300],
                body=desc[:800],
                category="humanitarian",
                severity="medium",
                lat=0.0,
                lng=0.0,
                url=link_el.text.strip() if link_el is not None and link_el.text else None,
                event_time=ts,
            ))

        return events
