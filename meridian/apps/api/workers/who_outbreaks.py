"""WHO Disease Outbreak News — RSS feed parser."""
import hashlib
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from workers.base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_COUNTRY_COORDS: dict[str, tuple[float, float]] = {
    "china": (35.86, 104.19), "india": (20.59, 78.96), "indonesia": (0.78, 113.92),
    "nigeria": (9.08, 8.68), "brazil": (14.24, 51.93), "democratic republic of the congo": (-4.03, 21.75),
    "sudan": (12.86, 30.22), "somalia": (5.15, 46.19), "ethiopia": (9.15, 40.49),
    "ukraine": (48.38, 31.17), "iran": (32.43, 53.69), "iraq": (33.22, 43.68),
    "afghanistan": (33.94, 67.71), "pakistan": (30.38, 69.35), "myanmar": (16.87, 96.08),
    "cambodia": (12.57, 104.99), "jordan": (30.59, 36.24), "turkey": (38.96, 35.24),
}


class WHOOutbreaksWorker(FeedWorker):
    source_id = "who_outbreaks"
    display_name = "WHO Outbreak News"
    category = FeedCategory.humanitarian
    refresh_interval = 1800
    _rss_url = "https://www.who.int/rss-feeds/news-english.xml"

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Meridian/1.0"}) as client:
            resp = await client.get(self._rss_url)
            resp.raise_for_status()

        root = ET.fromstring(resp.text)
        ns = {"dc": "http://purl.org/dc/elements/1.1/"}
        events: list[GeoEvent] = []

        for item in root.findall(".//item")[:30]:
            title_el = item.find("title")
            desc_el = item.find("description")
            link_el = item.find("link")
            pub_el = item.find("pubDate")

            title = title_el.text.strip() if title_el is not None and title_el.text else ""
            if not title:
                continue

            keywords = ["outbreak", "disease", "virus", "epidemic", "infection", "surveillance", "alert", "health emergency"]
            if not any(kw in title.lower() for kw in keywords):
                continue

            desc = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
            link = link_el.text.strip() if link_el is not None and link_el.text else ""

            try:
                pub_date = datetime.strptime(pub_el.text.strip(), "%a, %d %b %Y %H:%M:%S %z") if pub_el is not None and pub_el.text else datetime.now(timezone.utc)
            except Exception:
                pub_date = datetime.now(timezone.utc)

            lat, lng = 0.0, 0.0
            combined = (title + " " + desc).lower()
            for country, coords in _COUNTRY_COORDS.items():
                if country in combined:
                    lat, lng = coords
                    break

            if lat == 0.0 and lng == 0.0:
                continue  # Skip events we can't place on map

            event_id = hashlib.sha256(f"who_{link or title}".encode()).hexdigest()[:16]

            events.append(GeoEvent(
                id=event_id,
                source_id=self.source_id,
                category=self.category,
                title=title,
                body=desc[:300] if desc else None,
                severity=SeverityLevel.high,
                lat=lat,
                lng=lng,
                event_time=pub_date,
                url=link,
                metadata={"source": "WHO", "type": "outbreak_news"},
            ))
        return events
