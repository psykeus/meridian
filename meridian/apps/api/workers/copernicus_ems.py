"""Copernicus EMS — Emergency Management Service activation feed."""
import hashlib
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_RSS_URL = "https://emergency.copernicus.eu/mapping/list-of-components/EMSR/feed"

# Keywords for severity classification
_HIGH_KEYWORDS = ["flood", "earthquake", "tsunami", "wildfire", "cyclone", "hurricane", "typhoon", "explosion"]
_MEDIUM_KEYWORDS = ["storm", "landslide", "volcanic", "drought", "fire", "wind"]


def _classify_severity(title: str, description: str) -> SeverityLevel:
    """Classify activation severity from title/description keywords."""
    text = f"{title} {description}".lower()
    for kw in _HIGH_KEYWORDS:
        if kw in text:
            return SeverityLevel.high
    for kw in _MEDIUM_KEYWORDS:
        if kw in text:
            return SeverityLevel.medium
    return SeverityLevel.medium


def _extract_coords_from_text(text: str) -> tuple[float, float] | None:
    """Try to extract lat/lng from description text."""
    # Look for patterns like "Lat: 45.12, Lon: 12.34" or similar
    patterns = [
        r"[Ll]at[:\s]+(-?\d+\.?\d*)[,\s]+[Ll]on[g]?[:\s]+(-?\d+\.?\d*)",
        r"(-?\d+\.\d+)[°,\s]+[NS][,\s]+(-?\d+\.\d+)[°,\s]+[EW]",
        r"coordinates?[:\s]+(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                lat = float(match.group(1))
                lng = float(match.group(2))
                if -90 <= lat <= 90 and -180 <= lng <= 180:
                    return lat, lng
            except ValueError:
                continue
    return None


# Approximate coords for common Copernicus EMS activation regions
_REGION_COORDS: dict[str, tuple[float, float]] = {
    "italy": (41.87, 12.57), "greece": (39.07, 21.82), "spain": (40.46, -3.75),
    "france": (46.23, 2.21), "germany": (51.17, 10.45), "turkey": (38.96, 35.24),
    "portugal": (39.40, -8.22), "romania": (45.94, 24.97), "croatia": (45.10, 15.20),
    "slovenia": (46.15, 14.99), "austria": (47.52, 14.55), "poland": (51.92, 19.15),
    "czech": (49.82, 15.47), "bulgaria": (42.73, 25.49), "ukraine": (48.38, 31.17),
    "libya": (26.34, 17.23), "sudan": (12.86, 30.22), "mozambique": (-18.67, 35.53),
    "pakistan": (30.38, 69.35), "india": (20.59, 78.96), "bangladesh": (23.68, 90.36),
    "brazil": (-14.24, -51.93), "chile": (-35.68, -71.54), "philippines": (12.88, 121.77),
    "indonesia": (-0.79, 113.92), "japan": (36.20, 138.25), "australia": (-25.27, 133.78),
}


def _guess_coords_from_text(text: str) -> tuple[float, float]:
    """Guess coordinates from place/country names in text."""
    lower = text.lower()
    for region, coords in _REGION_COORDS.items():
        if region in lower:
            return coords
    # Default: Brussels (Copernicus HQ)
    return 50.85, 4.35


class CopernicusEMSWorker(FeedWorker):
    """Copernicus Emergency Management Service activations via RSS feed."""

    source_id = "copernicus_ems"
    display_name = "Copernicus Emergency Management"
    category = FeedCategory.environment
    refresh_interval = 21600  # 6 hours

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            try:
                resp = await client.get(
                    _RSS_URL,
                    headers={"User-Agent": "Meridian/1.0 (open-source situational awareness)"},
                )
                resp.raise_for_status()
            except Exception:
                return []

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            return []

        channel = root.find("channel")
        if channel is None:
            channel = root

        events: list[GeoEvent] = []

        for item in channel.findall("item")[:100]:
            try:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                description = (item.findtext("description") or "").strip()
                pub_date = (item.findtext("pubDate") or "").strip()
                guid = (item.findtext("guid") or "").strip()

                if not title:
                    continue

                # Clean description
                clean_desc = re.sub(r"<[^>]+>", "", description).strip()[:500]

                # Parse publication date
                event_time = self._parse_pub_date(pub_date)

                # Extract or guess coordinates
                coords = _extract_coords_from_text(f"{title} {description}")
                if coords:
                    lat, lng = coords
                else:
                    lat, lng = _guess_coords_from_text(f"{title} {description}")

                severity = _classify_severity(title, description)

                # Extract activation code (e.g., EMSR123)
                activation_code = ""
                code_match = re.search(r"(EMSR\d+)", title + " " + guid)
                if code_match:
                    activation_code = code_match.group(1)

                item_hash = hashlib.md5(
                    (guid or f"{title}{pub_date}").encode()
                ).hexdigest()[:12]

                events.append(GeoEvent(
                    id=f"copems_{item_hash}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="emergency_activation",
                    title=f"Copernicus EMS: {title[:180]}",
                    body=clean_desc or None,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=link or None,
                    metadata={
                        "activation_code": activation_code,
                        "guid": guid,
                    },
                ))
            except Exception:
                continue

        return events

    @staticmethod
    def _parse_pub_date(pub_date: str) -> datetime:
        if not pub_date:
            return datetime.now(timezone.utc)
        try:
            return parsedate_to_datetime(pub_date).astimezone(timezone.utc)
        except Exception:
            pass
        try:
            return datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
        except ValueError:
            pass
        return datetime.now(timezone.utc)
