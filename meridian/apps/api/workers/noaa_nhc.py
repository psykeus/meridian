import httpx
import xml.etree.ElementTree as ET
import hashlib
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

_CATEGORY_SEVERITY = {
    "5": SeverityLevel.critical,
    "4": SeverityLevel.critical,
    "3": SeverityLevel.high,
    "2": SeverityLevel.high,
    "1": SeverityLevel.medium,
    "TD": SeverityLevel.low,
    "TS": SeverityLevel.medium,
}


class NOAANHCWorker(FeedWorker):
    """NOAA NHC — Atlantic and Pacific tropical storm / hurricane RSS feed."""

    source_id = "noaa_nhc"
    display_name = "NOAA National Hurricane Center"
    category = FeedCategory.environment
    refresh_interval = 1800  # 30 minutes

    _URLS = [
        "https://www.nhc.noaa.gov/index-at.xml",   # Atlantic
        "https://www.nhc.noaa.gov/index-ep.xml",   # Eastern Pacific
        "https://www.nhc.noaa.gov/index-cp.xml",   # Central Pacific
    ]

    async def fetch(self) -> List[GeoEvent]:
        events: List[GeoEvent] = []
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            for url in self._URLS:
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
                        desc = (item.findtext("description") or "").strip()
                        pub_date = item.findtext("pubDate") or ""

                        if not title or "Tropical" not in title and "Hurricane" not in title:
                            continue

                        cat = "TS"
                        for n in ["5", "4", "3", "2", "1"]:
                            if f"Category {n}" in title or f"Cat {n}" in title:
                                cat = n
                                break
                        if "Hurricane" in title and cat == "TS":
                            cat = "1"

                        try:
                            from email.utils import parsedate_to_datetime
                            event_time = parsedate_to_datetime(pub_date).astimezone(timezone.utc)
                        except Exception:
                            event_time = datetime.now(timezone.utc)

                        basin = "ATL" if "at.xml" in url else "EPAC" if "ep.xml" in url else "CPAC"
                        item_hash = hashlib.md5(title.encode()).hexdigest()[:10]
                        severity = _CATEGORY_SEVERITY.get(cat, SeverityLevel.medium)

                        events.append(GeoEvent(
                            id=f"nhc_{basin}_{item_hash}",
                            source_id=self.source_id,
                            category=self.category,
                            severity=severity,
                            title=title[:200],
                            body=desc[:300] if desc else None,
                            lat=25.0,
                            lng=-75.0 if basin == "ATL" else -130.0,
                            event_time=event_time.isoformat(),
                            url=link or None,
                            metadata={"basin": basin, "category": cat},
                        ))
                    except Exception:
                        continue

        return events
