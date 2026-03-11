"""VolcanoDiscovery RSS — global volcanic activity reports."""
import hashlib
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from workers.base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_VOLCANO_COORDS: dict[str, tuple[float, float]] = {
    "etna": (37.73, 15.00), "stromboli": (38.79, 15.21), "vesuvius": (40.82, 14.43),
    "kilauea": (19.41, -155.29), "mauna loa": (19.48, -155.61), "loihi": (18.92, -155.27),
    "krakatau": (-6.10, 105.42), "merapi": (-7.54, 110.45), "pinatubo": (15.14, 120.35),
    "popocatepetl": (19.02, -98.62), "fuego": (14.47, -90.88), "tungurahua": (-1.47, -78.44),
    "nyiragongo": (-1.52, 29.25), "ol doinyo lengai": (-2.76, 35.91),
    "taal": (14.00, 120.99), "kanlaon": (10.41, 123.13), "bulusan": (12.77, 124.06),
    "sinabung": (3.17, 98.39), "semeru": (-8.11, 112.92), "ruang": (2.30, 125.37),
    "shishaldin": (54.76, -163.97), "cleveland": (52.82, -169.95),
    "sakurajima": (31.58, 130.66), "aso": (32.88, 131.10), "kirishima": (31.93, 130.86),
    "erebus": (-77.53, 167.15), "whakaari": (-37.52, 177.18),
}


class VolcanoDiscoveryWorker(FeedWorker):
    source_id = "volcano_discovery"
    display_name = "VolcanoDiscovery Activity"
    category = FeedCategory.environment
    refresh_interval = 1800
    _rss_url = "https://www.volcanodiscovery.com/erupting_volcanoes.rss"

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Meridian/1.0"}) as client:
            resp = await client.get(self._rss_url)
            resp.raise_for_status()

        root = ET.fromstring(resp.text)
        events: list[GeoEvent] = []

        for item in root.findall(".//item")[:30]:
            title_el = item.find("title")
            desc_el = item.find("description")
            link_el = item.find("link")
            pub_el = item.find("pubDate")

            title = title_el.text.strip() if title_el is not None and title_el.text else ""
            if not title:
                continue

            desc = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
            link = link_el.text.strip() if link_el is not None and link_el.text else ""

            try:
                pub_date = datetime.strptime(pub_el.text.strip(), "%a, %d %b %Y %H:%M:%S %z") if pub_el is not None and pub_el.text else datetime.now(timezone.utc)
            except Exception:
                pub_date = datetime.now(timezone.utc)

            title_lower = title.lower()
            lat, lng = 0.0, 0.0
            for name, coords in _VOLCANO_COORDS.items():
                if name in title_lower or name in desc.lower():
                    lat, lng = coords
                    break

            if lat == 0.0 and lng == 0.0:
                continue  # Skip volcanoes we can't place on map

            severity = SeverityLevel.high if any(w in title_lower for w in ["eruption", "lava", "explosion", "alert"]) else SeverityLevel.medium

            event_id = hashlib.sha256(f"volcano_{link or title}".encode()).hexdigest()[:16]

            events.append(GeoEvent(
                id=event_id,
                source_id=self.source_id,
                category=self.category,
                subcategory="volcano",
                title=title,
                body=desc[:300] if desc else None,
                severity=severity,
                lat=lat,
                lng=lng,
                event_time=pub_date,
                url=link,
                metadata={"type": "volcanic_activity"},
            ))
        return events
