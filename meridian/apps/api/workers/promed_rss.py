"""ProMED Mail RSS — International Society for Infectious Diseases disease outbreak alerts."""
import hashlib
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from workers.base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_COUNTRY_COORDS: dict[str, tuple[float, float]] = {
    "china": (35.86, 104.19), "india": (20.59, 78.96), "indonesia": (0.78, 113.92),
    "nigeria": (9.08, 8.68), "brazil": (-14.24, -51.93), "congo": (-4.03, 21.75),
    "sudan": (12.86, 30.22), "somalia": (5.15, 46.19), "ethiopia": (9.15, 40.49),
    "ukraine": (48.38, 31.17), "iran": (32.43, 53.69), "iraq": (33.22, 43.68),
    "afghanistan": (33.94, 67.71), "pakistan": (30.38, 69.35), "myanmar": (16.87, 96.08),
    "turkey": (38.96, 35.24), "russia": (61.52, 105.32), "mexico": (23.63, -102.55),
    "egypt": (26.82, 30.80), "kenya": (-0.02, 37.91), "south africa": (-30.56, 22.94),
    "thailand": (15.87, 100.99), "vietnam": (14.06, 108.28), "philippines": (12.88, 121.77),
    "united states": (37.09, -95.71), "usa": (37.09, -95.71),
    "japan": (36.20, 138.25), "germany": (51.17, 10.45), "france": (46.23, 2.21),
    "united kingdom": (55.38, -3.44), "uk": (55.38, -3.44), "italy": (41.87, 12.57),
    "spain": (40.46, -3.75), "australia": (-25.27, 133.78), "canada": (56.13, -106.35),
    "colombia": (4.57, -74.30), "peru": (-9.19, -75.02), "argentina": (-38.42, -63.62),
    "bangladesh": (23.68, 90.36), "nepal": (28.39, 84.12), "cambodia": (12.57, 104.99),
    "jordan": (30.59, 36.24), "yemen": (15.55, 48.52), "syria": (34.80, 38.99),
    "lebanon": (33.85, 35.86), "palestine": (31.95, 35.23), "israel": (31.05, 34.85),
    "saudi arabia": (23.89, 45.08), "madagascar": (-18.77, 46.87), "mozambique": (-18.67, 35.53),
    "ghana": (7.95, -1.02), "cameroon": (7.37, 12.35), "uganda": (1.37, 32.29),
    "tanzania": (-6.37, 34.89), "zambia": (-13.13, 27.85), "zimbabwe": (-19.02, 29.15),
    "angola": (-11.20, 17.87), "mali": (17.57, -3.99), "burkina faso": (12.36, -1.53),
    "niger": (17.61, 8.08), "chad": (15.45, 18.73), "senegal": (14.50, -14.45),
}

_KEYWORDS = [
    "outbreak", "epidemic", "cluster", "cases", "deaths", "alert", "ebola", "cholera",
    "dengue", "mpox", "avian influenza", "salmonella", "e. coli", "hepatitis", "rabies",
]


class ProMEDRSSWorker(FeedWorker):
    source_id = "promed_rss"
    display_name = "ProMED Disease Alerts"
    category = FeedCategory.humanitarian
    refresh_interval = 1800
    run_on_startup = False
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

            link = link_el.text.strip() if link_el is not None and link_el.text else ""

            # Geocode from title/description
            lat, lng = 0.0, 0.0
            combined = (title + " " + desc).lower()
            for country, coords in _COUNTRY_COORDS.items():
                if country in combined:
                    lat, lng = coords
                    break

            if lat == 0.0 and lng == 0.0:
                continue  # Skip events we can't place on map

            event_id = hashlib.sha256(f"promed_{link or title}".encode()).hexdigest()[:16]

            events.append(GeoEvent(
                id=event_id,
                source_id=self.source_id,
                title=title[:300],
                body=desc[:800],
                category=FeedCategory.humanitarian,
                severity=SeverityLevel.medium,
                lat=lat,
                lng=lng,
                url=link or None,
                event_time=ts,
                metadata={"source": "ProMED"},
            ))

        return events
