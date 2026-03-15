"""NRC — US Nuclear Regulatory Commission event notifications."""
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

# NRC HQ, Rockville MD — default coords when plant location is unknown
_NRC_HQ_LAT, _NRC_HQ_LNG = 39.0840, -77.1528

# Known US nuclear plant coordinates for mapping event locations.
# Source: NRC reactor list — major operating and recently decommissioned sites.
_PLANT_COORDS: dict[str, tuple[float, float]] = {
    "palo verde": (33.3881, -112.8622),
    "south texas": (28.7950, -96.0489),
    "vogtle": (33.1414, -81.7590),
    "watts bar": (35.6031, -84.7914),
    "diablo canyon": (35.2119, -120.8544),
    "braidwood": (41.2425, -88.2264),
    "byron": (42.0756, -89.2817),
    "catawba": (35.0517, -81.0700),
    "mcguire": (35.4322, -80.9486),
    "peach bottom": (39.7589, -76.2689),
    "calvert cliffs": (38.4347, -76.4419),
    "comanche peak": (32.2983, -97.7853),
    "cook": (41.9750, -86.5650),
    "cooper": (40.3617, -95.6408),
    "davis-besse": (41.5972, -83.0864),
    "dresden": (41.3897, -88.2714),
    "farley": (31.2228, -85.1081),
    "fermi": (41.9625, -83.2578),
    "grand gulf": (32.0069, -91.0478),
    "hatch": (31.9344, -82.3444),
    "hope creek": (39.4681, -75.5364),
    "indian point": (41.2697, -73.9522),
    "lasalle": (41.2439, -88.6700),
    "limerick": (40.2244, -75.5867),
    "millstone": (41.3086, -72.1686),
    "monticello": (45.3336, -93.8483),
    "nine mile point": (43.5222, -76.4100),
    "north anna": (38.0606, -77.7897),
    "oconee": (34.7936, -82.8986),
    "palisades": (42.3222, -86.3153),
    "perry": (41.8008, -81.1444),
    "pilgrim": (41.9444, -70.5789),
    "point beach": (44.2808, -87.5364),
    "prairie island": (44.6219, -92.6331),
    "quad cities": (41.7264, -90.3400),
    "river bend": (30.7572, -91.3317),
    "robinson": (34.4017, -80.1578),
    "salem": (39.4628, -75.5361),
    "san onofre": (33.3681, -117.5556),
    "seabrook": (42.8986, -70.8489),
    "sequoyah": (35.2233, -85.0878),
    "shearon harris": (35.6333, -78.9553),
    "st. lucie": (27.3486, -80.2464),
    "summer": (34.2953, -81.3164),
    "surry": (37.1656, -76.6978),
    "susquehanna": (41.0917, -76.1469),
    "three mile island": (40.1531, -76.7250),
    "turkey point": (25.4353, -80.3308),
    "vermont yankee": (42.7803, -72.5153),
    "waterford": (30.0006, -90.4722),
    "wolf creek": (38.2386, -95.6886),
    "browns ferry": (34.7042, -87.1186),
    "beaver valley": (40.6219, -80.4328),
    "brunswick": (33.9586, -78.0106),
    "callaway": (38.7614, -91.7817),
    "clinton": (40.1722, -88.8344),
    "columbia": (46.4711, -119.3336),
    "ginna": (43.2778, -77.3089),
    "harris": (35.6333, -78.9553),
}

# Keywords that indicate severity of NRC event notifications
_SEVERITY_KEYWORDS: list[tuple[str, SeverityLevel]] = [
    ("emergency", SeverityLevel.critical),
    ("unusual event", SeverityLevel.high),
    ("alert declaration", SeverityLevel.high),
    ("scram", SeverityLevel.high),
    ("shutdown", SeverityLevel.medium),
    ("reactor trip", SeverityLevel.medium),
    ("safety system", SeverityLevel.medium),
    ("leak", SeverityLevel.medium),
    ("release", SeverityLevel.medium),
    ("contamination", SeverityLevel.high),
    ("radiation", SeverityLevel.medium),
    ("fire", SeverityLevel.medium),
    ("security", SeverityLevel.medium),
    ("inspection", SeverityLevel.low),
    ("drill", SeverityLevel.info),
    ("test", SeverityLevel.info),
]


def _classify_severity(text: str) -> SeverityLevel:
    """Classify NRC event severity based on keyword analysis."""
    lower = text.lower()
    for keyword, severity in _SEVERITY_KEYWORDS:
        if keyword in lower:
            return severity
    return SeverityLevel.low


def _resolve_plant_coords(title: str, description: str) -> tuple[float, float]:
    """Attempt to match plant name in text to known coordinates."""
    combined = (title + " " + description).lower()
    for plant_name, coords in _PLANT_COORDS.items():
        if plant_name in combined:
            return coords
    return (_NRC_HQ_LAT, _NRC_HQ_LNG)


class NRCEventsWorker(FeedWorker):
    """US Nuclear Regulatory Commission event notification feed."""

    source_id = "nrc_events"
    display_name = "NRC Event Notifications"
    category = FeedCategory.nuclear
    refresh_interval = 3600  # hourly

    _RSS_URL = "https://www.nrc.gov/public-involve/rss?feed=event"

    async def fetch(self) -> list[GeoEvent]:
        try:
            async with httpx.AsyncClient(
                timeout=20,
                headers={"User-Agent": "Meridian/1.0"},
                follow_redirects=True,
            ) as client:
                resp = await client.get(self._RSS_URL)
                resp.raise_for_status()
        except Exception:
            return []

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            return []

        events: list[GeoEvent] = []
        channel = root.find("channel") or root

        for item in channel.findall("item")[:50]:
            title_el = item.find("title")
            desc_el = item.find("description")
            link_el = item.find("link")
            pub_el = item.find("pubDate")

            if title_el is None or title_el.text is None:
                continue

            title = title_el.text.strip()
            description = (desc_el.text or "").strip() if desc_el is not None else ""
            link = (link_el.text or "").strip() if link_el is not None else None

            # Parse publication date
            try:
                event_time = (
                    parsedate_to_datetime(pub_el.text).astimezone(timezone.utc)
                    if pub_el is not None and pub_el.text
                    else datetime.now(timezone.utc)
                )
            except Exception:
                event_time = datetime.now(timezone.utc)

            # Resolve location and severity
            lat, lng = _resolve_plant_coords(title, description)
            severity = _classify_severity(title + " " + description)

            item_hash = hashlib.md5(
                f"{title}_{event_time.isoformat()}".encode()
            ).hexdigest()[:12]

            # Clean description of CDATA wrappers
            clean_desc = (
                description.replace("<![CDATA[", "")
                .replace("]]>", "")
                .strip()[:600]
            )

            events.append(
                GeoEvent(
                    id=f"nrc_{item_hash}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="nrc_event_notification",
                    title=title[:300],
                    body=clean_desc or None,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=link,
                    metadata={
                        "default_coords": lat == _NRC_HQ_LAT and lng == _NRC_HQ_LNG,
                    },
                )
            )

        return events
