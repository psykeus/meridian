"""FEMA IPAWS — Integrated Public Alert and Warning System (CAP alerts)."""
import hashlib
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_ATOM_URL = "https://apps.fema.gov/FEMA-Feed/FEMA-CAP-Atom.ashx"

_CAP_SEVERITY_MAP: dict[str, SeverityLevel] = {
    "Extreme": SeverityLevel.critical,
    "Severe": SeverityLevel.high,
    "Moderate": SeverityLevel.medium,
    "Minor": SeverityLevel.low,
    "Unknown": SeverityLevel.info,
}

# Common XML namespaces in ATOM+CAP feeds
_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "cap": "urn:oasis:names:tc:emergency:cap:1.2",
    "cap11": "urn:oasis:names:tc:emergency:cap:1.1",
}


def _parse_cap_polygon(polygon_text: str) -> tuple[float, float] | None:
    """Parse a CAP polygon string (space-separated lat,lng pairs) and return centroid."""
    pairs = polygon_text.strip().split()
    if not pairs:
        return None
    lats: list[float] = []
    lngs: list[float] = []
    for pair in pairs:
        parts = pair.split(",")
        if len(parts) >= 2:
            try:
                lats.append(float(parts[0]))
                lngs.append(float(parts[1]))
            except ValueError:
                continue
    if not lats:
        return None
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def _parse_cap_circle(circle_text: str) -> tuple[float, float] | None:
    """Parse a CAP circle string ('lat,lng radius') and return center coords."""
    match = re.match(r"([\d.\-]+),([\d.\-]+)\s+", circle_text.strip())
    if match:
        try:
            return float(match.group(1)), float(match.group(2))
        except ValueError:
            return None
    return None


class FEMAIPAWSWorker(FeedWorker):
    source_id = "fema_ipaws"
    display_name = "FEMA IPAWS Public Alerts"
    category = FeedCategory.humanitarian
    refresh_interval = 120  # 2 minutes — critical safety alerts

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(_ATOM_URL, follow_redirects=True)
                if resp.status_code in (401, 403, 404):
                    logger.warning("fema_ipaws_feed_unavailable", extra={"status": resp.status_code})
                    return []
                resp.raise_for_status()
                content = resp.text
            except Exception as exc:
                logger.warning("fema_ipaws_fetch_failed", extra={"error": str(exc)})
                return []

        try:
            root = ET.fromstring(content)
        except ET.ParseError:
            logger.warning("fema_ipaws_parse_failed")
            return []

        events: list[GeoEvent] = []

        # Handle both ATOM <entry> and RSS <item> elements
        entries = (
            root.findall("atom:entry", _NS)
            or root.findall("{http://www.w3.org/2005/Atom}entry")
            or root.findall(".//item")
        )

        for entry in entries[:200]:
            try:
                event = self._parse_entry(entry)
                if event is not None:
                    events.append(event)
            except Exception:
                continue

        return events

    def _parse_entry(self, entry: ET.Element) -> GeoEvent | None:
        """Parse a single ATOM entry with embedded CAP alert into a GeoEvent."""
        # Extract basic ATOM fields
        title = self._find_text(entry, [
            "atom:title", "{http://www.w3.org/2005/Atom}title", "title",
        ]) or "FEMA Alert"

        link_el = (
            entry.find("atom:link", _NS)
            or entry.find("{http://www.w3.org/2005/Atom}link")
            or entry.find("link")
        )
        link = ""
        if link_el is not None:
            link = link_el.get("href", "") or (link_el.text or "")

        entry_id = self._find_text(entry, [
            "atom:id", "{http://www.w3.org/2005/Atom}id", "guid",
        ]) or ""

        updated = self._find_text(entry, [
            "atom:updated", "{http://www.w3.org/2005/Atom}updated",
            "atom:published", "{http://www.w3.org/2005/Atom}published",
            "pubDate",
        ]) or ""

        # Look for embedded CAP alert content
        cap_alert = self._find_cap_alert(entry)

        severity = SeverityLevel.info
        description = ""
        urgency = ""
        certainty = ""
        event_type = ""
        area_desc = ""
        lat: float | None = None
        lng: float | None = None

        if cap_alert is not None:
            # Extract CAP info block
            info = self._find_cap_info(cap_alert)
            if info is not None:
                severity_str = self._find_cap_text(info, "severity") or "Unknown"
                severity = _CAP_SEVERITY_MAP.get(severity_str, SeverityLevel.info)
                description = self._find_cap_text(info, "description") or ""
                urgency = self._find_cap_text(info, "urgency") or ""
                certainty = self._find_cap_text(info, "certainty") or ""
                event_type = self._find_cap_text(info, "event") or ""

                # Extract coordinates from CAP area
                for area_tag in ["cap:area", "cap11:area",
                                 "{urn:oasis:names:tc:emergency:cap:1.2}area",
                                 "{urn:oasis:names:tc:emergency:cap:1.1}area"]:
                    area = info.find(area_tag, _NS) if ":" in area_tag and not area_tag.startswith("{") else info.find(area_tag)
                    if area is not None:
                        area_desc = self._find_cap_text(area, "areaDesc") or area_desc
                        coords = self._extract_area_coords(area)
                        if coords:
                            lat, lng = coords
                            break
        else:
            # No embedded CAP — try to extract from summary/description
            summary = self._find_text(entry, [
                "atom:summary", "{http://www.w3.org/2005/Atom}summary",
                "atom:content", "{http://www.w3.org/2005/Atom}content",
                "description",
            ]) or ""
            description = summary

        # If still no coordinates, skip this entry
        if lat is None or lng is None:
            return None

        # Parse event time
        try:
            event_time = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        except Exception:
            try:
                from email.utils import parsedate_to_datetime
                event_time = parsedate_to_datetime(updated)
            except Exception:
                event_time = datetime.now(timezone.utc)

        # Deterministic ID
        if entry_id:
            event_id = hashlib.md5(entry_id.encode()).hexdigest()[:16]
        else:
            event_id = hashlib.md5(f"{title}_{updated}".encode()).hexdigest()[:16]

        return GeoEvent(
            id=f"ipaws_{event_id}",
            source_id=self.source_id,
            category=self.category,
            subcategory=event_type.lower().replace(" ", "_") if event_type else "alert",
            title=title[:200],
            body=description[:500] if description else None,
            severity=severity,
            lat=lat,
            lng=lng,
            event_time=event_time,
            url=link or None,
            metadata={
                "event_type": event_type,
                "urgency": urgency,
                "certainty": certainty,
                "area_desc": area_desc,
                "cap_id": entry_id,
            },
        )

    def _find_text(self, el: ET.Element, tags: list[str]) -> str | None:
        """Try multiple tag names and return the first match text."""
        for tag in tags:
            if ":" in tag and not tag.startswith("{"):
                child = el.find(tag, _NS)
            else:
                child = el.find(tag)
            if child is not None and child.text:
                return child.text.strip()
        return None

    def _find_cap_alert(self, entry: ET.Element) -> ET.Element | None:
        """Find embedded CAP <alert> element inside the ATOM entry."""
        for tag in [
            "cap:alert", "cap11:alert",
            "{urn:oasis:names:tc:emergency:cap:1.2}alert",
            "{urn:oasis:names:tc:emergency:cap:1.1}alert",
        ]:
            if ":" in tag and not tag.startswith("{"):
                alert = entry.find(tag, _NS)
            else:
                alert = entry.find(tag)
            if alert is not None:
                return alert
        # Sometimes the entry content itself is a CAP alert
        content = entry.find("{http://www.w3.org/2005/Atom}content")
        if content is not None:
            for child in content:
                tag_local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                if tag_local == "alert":
                    return child
        return None

    def _find_cap_info(self, alert: ET.Element) -> ET.Element | None:
        """Find the <info> element inside a CAP alert."""
        for tag in [
            "cap:info", "cap11:info",
            "{urn:oasis:names:tc:emergency:cap:1.2}info",
            "{urn:oasis:names:tc:emergency:cap:1.1}info",
            "info",
        ]:
            if ":" in tag and not tag.startswith("{"):
                info = alert.find(tag, _NS)
            else:
                info = alert.find(tag)
            if info is not None:
                return info
        return None

    def _find_cap_text(self, parent: ET.Element, local_name: str) -> str | None:
        """Find a CAP child element by local name across multiple namespace variants."""
        for ns_uri in [
            "urn:oasis:names:tc:emergency:cap:1.2",
            "urn:oasis:names:tc:emergency:cap:1.1",
            "",
        ]:
            tag = f"{{{ns_uri}}}{local_name}" if ns_uri else local_name
            child = parent.find(tag)
            if child is not None and child.text:
                return child.text.strip()
        return None

    def _extract_area_coords(self, area: ET.Element) -> tuple[float, float] | None:
        """Extract coordinates from a CAP <area> element (polygon or circle)."""
        # Try polygon first
        polygon_text = self._find_cap_text(area, "polygon")
        if polygon_text:
            result = _parse_cap_polygon(polygon_text)
            if result:
                return result

        # Try circle
        circle_text = self._find_cap_text(area, "circle")
        if circle_text:
            result = _parse_cap_circle(circle_text)
            if result:
                return result

        # Try geocode as last resort — not directly mappable without lookup
        return None
