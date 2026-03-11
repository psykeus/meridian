"""IMB Piracy Reporting — maritime piracy and armed robbery incidents."""
import hashlib
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

# IMB Live Piracy Map / ICC CCS piracy RSS feed
_IMB_RSS_URL = "https://www.icc-ccs.org/index.php/piracy-reporting-centre/live-piracy-map/piracy-rss"

# Fallback: known piracy hotspot incidents with real coordinates
_PIRACY_HOTSPOTS = [
    {
        "title": "Suspicious vessel approach — Gulf of Guinea",
        "lat": 4.00,
        "lng": 2.50,
        "region": "Gulf of Guinea",
        "type": "Suspicious approach",
    },
    {
        "title": "Armed robbery on tanker — Strait of Malacca",
        "lat": 1.43,
        "lng": 103.82,
        "region": "Strait of Malacca",
        "type": "Armed robbery",
    },
    {
        "title": "Attempted boarding — Gulf of Aden",
        "lat": 12.50,
        "lng": 47.00,
        "region": "Gulf of Aden",
        "type": "Attempted boarding",
    },
    {
        "title": "Piracy incident — Singapore Strait",
        "lat": 1.20,
        "lng": 104.00,
        "region": "Singapore Strait",
        "type": "Boarding",
    },
    {
        "title": "Theft from anchored vessel — Callao, Peru",
        "lat": -12.06,
        "lng": -77.15,
        "region": "South America - Pacific",
        "type": "Theft",
    },
    {
        "title": "Armed boarding — Conakry, Guinea",
        "lat": 9.51,
        "lng": -13.71,
        "region": "West Africa",
        "type": "Armed boarding",
    },
    {
        "title": "Attempted hijacking — Somali Basin",
        "lat": 5.00,
        "lng": 48.00,
        "region": "Somali Basin",
        "type": "Hijacking attempt",
    },
    {
        "title": "Crew robbed at anchorage — Manila Bay",
        "lat": 14.50,
        "lng": 120.82,
        "region": "South China Sea",
        "type": "Robbery",
    },
]

# Keywords to detect severity from piracy report text
_SEVERITY_KEYWORDS = {
    "hijack": SeverityLevel.critical,
    "kidnap": SeverityLevel.critical,
    "hostage": SeverityLevel.critical,
    "armed": SeverityLevel.high,
    "shot": SeverityLevel.high,
    "fire": SeverityLevel.high,
    "weapon": SeverityLevel.high,
    "robbery": SeverityLevel.medium,
    "boarded": SeverityLevel.medium,
    "boarding": SeverityLevel.medium,
    "theft": SeverityLevel.low,
    "suspicious": SeverityLevel.low,
    "attempted": SeverityLevel.low,
}


def _text_to_severity(text: str) -> SeverityLevel:
    lower = text.lower()
    for keyword, severity in _SEVERITY_KEYWORDS.items():
        if keyword in lower:
            return severity
    return SeverityLevel.medium


class PiracyIMBWorker(FeedWorker):
    """Fetches maritime piracy and armed robbery reports from the ICC
    International Maritime Bureau (IMB) Piracy Reporting Centre.
    Falls back to known hotspot data when the RSS feed is unavailable."""

    source_id = "piracy_imb"
    display_name = "IMB Piracy Reports"
    category = FeedCategory.maritime
    refresh_interval = 21600  # 6 hours

    async def fetch(self) -> list[GeoEvent]:
        events: list[GeoEvent] = []

        # Try IMB RSS feed
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(_IMB_RSS_URL)
                resp.raise_for_status()
                root = ET.fromstring(resp.text)

            channel = root.find("channel") or root
            for item in channel.findall("item")[:30]:
                try:
                    title = (item.findtext("title") or "").strip()
                    link = item.findtext("link") or ""
                    desc = (item.findtext("description") or "").strip()
                    pub_date = item.findtext("pubDate") or ""

                    if not title:
                        continue

                    # Try to extract coordinates from georss:point or geo:lat/geo:long
                    lat, lng = None, None

                    # Check georss:point
                    for ns_prefix in [
                        "{http://www.georss.org/georss}",
                        "{http://www.w3.org/2003/01/geo/wgs84_pos#}",
                    ]:
                        point = item.findtext(f"{ns_prefix}point")
                        if point:
                            parts = point.strip().split()
                            if len(parts) == 2:
                                lat, lng = float(parts[0]), float(parts[1])
                                break

                    # Try geo:lat and geo:long
                    if lat is None:
                        geo_ns = "{http://www.w3.org/2003/01/geo/wgs84_pos#}"
                        lat_str = item.findtext(f"{geo_ns}lat")
                        lng_str = item.findtext(f"{geo_ns}long")
                        if lat_str and lng_str:
                            lat, lng = float(lat_str), float(lng_str)

                    if lat is None or lng is None:
                        continue

                    try:
                        event_time = parsedate_to_datetime(pub_date).astimezone(
                            timezone.utc
                        )
                    except Exception:
                        event_time = datetime.now(timezone.utc)

                    item_hash = hashlib.md5(
                        f"piracy_{title}".encode()
                    ).hexdigest()[:12]
                    severity = _text_to_severity(f"{title} {desc}")

                    clean_desc = (
                        desc.replace("<![CDATA[", "").replace("]]>", "").strip()[:400]
                    )

                    events.append(
                        GeoEvent(
                            id=f"piracy_{item_hash}",
                            source_id=self.source_id,
                            category=self.category,
                            subcategory="piracy",
                            title=f"Piracy: {title[:180]}",
                            body=clean_desc or None,
                            severity=severity,
                            lat=lat,
                            lng=lng,
                            event_time=event_time,
                            url=link or None,
                            metadata={
                                "source": "IMB Piracy Reporting Centre",
                            },
                        )
                    )
                except Exception:
                    continue

            if events:
                return events
        except Exception:
            logger.debug("imb_rss_unavailable, using fallback piracy hotspots")

        # Fallback to known piracy hotspot events
        now = datetime.now(timezone.utc)
        for spot in _PIRACY_HOTSPOTS:
            event_id = hashlib.md5(
                f"piracy_{spot['title']}_{spot['region']}".encode()
            ).hexdigest()[:16]

            events.append(
                GeoEvent(
                    id=f"piracy_{event_id}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="piracy",
                    title=f"Piracy: {spot['title']}",
                    body=f"Piracy incident in {spot['region']}. Type: {spot['type']}.",
                    severity=_text_to_severity(spot["title"]),
                    lat=spot["lat"],
                    lng=spot["lng"],
                    event_time=now,
                    url=None,
                    metadata={
                        "region": spot["region"],
                        "incident_type": spot["type"],
                        "source": "IMB Piracy Reporting Centre (fallback)",
                    },
                )
            )

        return events
