"""PTWC/NTWC — Pacific and National Tsunami Warning Center alerts via NOAA ATOM/CAP feeds."""

import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import List

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

_ATOM_URL = "https://www.tsunami.gov/events/xml/PAAQAtom.xml"

# CAP XML namespaces
_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "cap": "urn:oasis:names:tc:emergency:cap:1.2",
    "georss": "http://www.georss.org/georss",
}

# Severity mapping based on tsunami alert type
_ALERT_SEVERITY = {
    "warning": SeverityLevel.critical,
    "watch": SeverityLevel.high,
    "advisory": SeverityLevel.medium,
    "information": SeverityLevel.low,
}

# Default coastal region coordinates when CAP entry lacks precise coords.
# Keyed by region keyword found in the title/summary.
_REGION_COORDS = {
    "pacific": (0.0, -170.0),
    "hawaii": (19.8968, -155.5828),
    "alaska": (61.2181, -149.9003),
    "west coast": (37.7749, -122.4194),
    "east coast": (38.9072, -77.0369),
    "caribbean": (18.2208, -66.5901),
    "japan": (35.6762, 139.6503),
    "chile": (-33.4489, -70.6693),
    "indonesia": (-6.2088, 106.8456),
    "new zealand": (-41.2865, 174.7762),
    "samoa": (-13.7590, -172.1046),
    "tonga": (-21.1789, -175.1982),
    "philippines": (14.5995, 120.9842),
    "india": (28.6139, 77.2090),
}

# Fallback coordinates (center of Pacific Ocean)
_DEFAULT_LAT = 0.0
_DEFAULT_LNG = -170.0


def _classify_severity(title: str, summary: str) -> SeverityLevel:
    """Determine severity from alert type keywords in title or summary."""
    combined = f"{title} {summary}".lower()
    for keyword, severity in _ALERT_SEVERITY.items():
        if keyword in combined:
            return severity
    return SeverityLevel.low


def _extract_coords_from_text(text: str) -> tuple[float | None, float | None]:
    """Try to extract lat/lng from georss:point or similar text patterns."""
    # georss:point format is "lat lng"
    parts = text.strip().split()
    if len(parts) == 2:
        try:
            return float(parts[0]), float(parts[1])
        except ValueError:
            pass
    return None, None


def _region_coords(title: str, summary: str) -> tuple[float, float]:
    """Infer approximate coordinates from region keywords in text."""
    combined = f"{title} {summary}".lower()
    for region, coords in _REGION_COORDS.items():
        if region in combined:
            return coords
    return _DEFAULT_LAT, _DEFAULT_LNG


class TsunamiWarningsWorker(FeedWorker):
    """Tsunami Warning Centers — PTWC/NTWC ATOM/CAP feed from tsunami.gov."""

    source_id = "tsunami_warnings"
    display_name = "Tsunami Warning Centers"
    category = FeedCategory.environment
    refresh_interval = 120  # 2 minutes — critical safety feed

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            try:
                resp = await client.get(_ATOM_URL)
                resp.raise_for_status()
            except Exception:
                return []

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            return []

        events: List[GeoEvent] = []

        # ATOM feed: entries are <entry> elements (possibly with namespace)
        entries = root.findall("atom:entry", _NS)
        if not entries:
            # Try without namespace prefix (some feeds omit the default ns)
            entries = root.findall("{http://www.w3.org/2005/Atom}entry")
        if not entries:
            entries = root.findall("entry")

        for entry in entries[:50]:
            try:
                # Extract standard ATOM fields
                title = self._find_text(entry, "title") or "Tsunami Alert"
                summary = self._find_text(entry, "summary") or ""
                entry_id = self._find_text(entry, "id") or ""
                updated = self._find_text(entry, "updated") or ""
                link = ""

                # Get link href attribute
                link_el = (
                    entry.find("atom:link", _NS)
                    or entry.find("{http://www.w3.org/2005/Atom}link")
                    or entry.find("link")
                )
                if link_el is not None:
                    link = link_el.get("href", "")

                # Parse event time
                event_time = self._parse_time(updated)

                # Extract coordinates from georss:point if available
                lat, lng = None, None
                georss_point = (
                    entry.findtext("georss:point", namespaces=_NS)
                    or entry.findtext("{http://www.georss.org/georss}point")
                )
                if georss_point:
                    lat, lng = _extract_coords_from_text(georss_point)

                # Try CAP area/circle or polygon
                if lat is None or lng is None:
                    lat, lng = self._extract_cap_coords(entry)

                # Fall back to region-based coords
                if lat is None or lng is None:
                    lat, lng = _region_coords(title, summary)

                severity = _classify_severity(title, summary)
                subcategory = self._classify_subcategory(title, summary)

                item_hash = hashlib.md5(
                    (entry_id or f"{title}{updated}").encode()
                ).hexdigest()[:12]

                events.append(
                    GeoEvent(
                        id=f"tsunami_{item_hash}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory=subcategory,
                        title=title[:200],
                        body=summary[:500] if summary else None,
                        severity=severity,
                        lat=lat,
                        lng=lng,
                        event_time=event_time,
                        url=link or None,
                        metadata={
                            "alert_type": subcategory,
                            "entry_id": entry_id,
                        },
                    )
                )
            except Exception:
                continue

        return events

    def _find_text(self, element: ET.Element, tag: str) -> str | None:
        """Find text in element trying multiple namespace variants."""
        text = element.findtext(f"atom:{tag}", namespaces=_NS)
        if text:
            return text.strip()
        text = element.findtext(f"{{http://www.w3.org/2005/Atom}}{tag}")
        if text:
            return text.strip()
        text = element.findtext(tag)
        if text:
            return text.strip()
        return None

    def _extract_cap_coords(self, entry: ET.Element) -> tuple[float | None, float | None]:
        """Extract coordinates from embedded CAP area elements."""
        # Look for cap:area/cap:circle or cap:area/cap:polygon
        for area in (
            list(entry.iter(f"{{{_NS['cap']}}}area"))
            + list(entry.iter("area"))
        ):
            # CAP circle format: "lat,lng radius"
            circle = area.findtext(f"{{{_NS['cap']}}}circle") or area.findtext("circle")
            if circle:
                center = circle.split()[0] if " " in circle else circle
                parts = center.split(",")
                if len(parts) == 2:
                    try:
                        return float(parts[0]), float(parts[1])
                    except ValueError:
                        pass

            # CAP polygon: space-separated "lat,lng" pairs — use centroid
            polygon = area.findtext(f"{{{_NS['cap']}}}polygon") or area.findtext("polygon")
            if polygon:
                try:
                    points = polygon.strip().split()
                    lats, lngs = [], []
                    for pt in points:
                        la, lo = pt.split(",")
                        lats.append(float(la))
                        lngs.append(float(lo))
                    if lats and lngs:
                        return sum(lats) / len(lats), sum(lngs) / len(lngs)
                except (ValueError, IndexError):
                    pass

        return None, None

    @staticmethod
    def _parse_time(time_str: str) -> datetime:
        """Parse ISO 8601 / ATOM updated timestamps."""
        if not time_str:
            return datetime.now(timezone.utc)
        try:
            return datetime.fromisoformat(time_str.replace("Z", "+00:00"))
        except ValueError:
            pass
        try:
            return datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S%z")
        except ValueError:
            pass
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(time_str).astimezone(timezone.utc)
        except Exception:
            return datetime.now(timezone.utc)

    @staticmethod
    def _classify_subcategory(title: str, summary: str) -> str:
        """Classify the alert into a subcategory."""
        combined = f"{title} {summary}".lower()
        if "warning" in combined:
            return "tsunami_warning"
        if "watch" in combined:
            return "tsunami_watch"
        if "advisory" in combined:
            return "tsunami_advisory"
        if "information" in combined or "bulletin" in combined:
            return "tsunami_information"
        return "tsunami_alert"
