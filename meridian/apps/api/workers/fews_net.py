"""FEWS NET — Famine Early Warning System food security alerts."""
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS

_RSS_URL = "https://fews.net/fews-data/333"


class FEWSNETWorker(FeedWorker):
    source_id = "fews_net"
    display_name = "FEWS NET — Famine Early Warning"
    category = FeedCategory.humanitarian
    refresh_interval = 86400  # daily

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(_RSS_URL, follow_redirects=True)
            if not resp.is_success:
                return []
            content = resp.text

        try:
            root = ET.fromstring(content)
        except ET.ParseError:
            return []

        ns = {"atom": "http://www.w3.org/2005/Atom"}
        items = root.findall(".//item") or root.findall(".//atom:entry", ns)
        events: list[GeoEvent] = []

        for item in items[:20]:
            title_el = item.find("title") or item.find("atom:title", ns)
            link_el = item.find("link") or item.find("atom:link", ns)
            desc_el = item.find("description") or item.find("atom:summary", ns)
            date_el = item.find("pubDate") or item.find("atom:updated", ns)

            title = title_el.text or "" if title_el is not None else ""
            link = link_el.text or (link_el.get("href", "") if link_el is not None else "") or ""
            desc = desc_el.text or "" if desc_el is not None else ""
            date_str = date_el.text or "" if date_el is not None else ""

            try:
                from email.utils import parsedate_to_datetime
                event_time = parsedate_to_datetime(date_str)
            except Exception:
                event_time = datetime.now(timezone.utc)

            # Deterministic ID using hashlib (hash() varies across Python runs)
            event_id = hashlib.md5(f"fews_{title}_{date_str}".encode()).hexdigest()[:12]

            # Geocode from title text using country coords
            lat, lng = 0.0, 20.0  # default: central Africa
            title_lower = title.lower()
            for code, coords in COUNTRY_COORDS.items():
                if code.lower() in title_lower:
                    lat, lng = coords
                    break

            events.append(GeoEvent(
                id=f"fews_{event_id}",
                source_id=self.source_id,
                category=self.category,
                severity=SeverityLevel.high,
                title=f"FEWS NET: {title[:120]}",
                body=desc[:300] if desc else None,
                lat=lat, lng=lng,
                event_time=event_time,
                url=link or "https://fews.net/",
                metadata={"source": "fews_net"},
            ))
        return events
