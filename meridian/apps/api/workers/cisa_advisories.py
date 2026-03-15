"""CISA ICS-CERT — Cybersecurity and Infrastructure Security Agency advisories RSS."""

import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import List

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

_RSS_URL = "https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml"

# CISA HQ coordinates (Arlington, VA)
_CISA_LAT = 38.8977
_CISA_LNG = -77.0365

# Keywords in advisory titles that signal higher severity
_CRITICAL_KEYWORDS = ["critical", "remote code execution", "rce", "actively exploited"]
_HIGH_KEYWORDS = ["high", "important", "severe", "overflow", "injection", "authentication bypass"]
_MEDIUM_KEYWORDS = ["medium", "moderate", "denial of service", "dos"]
_LOW_KEYWORDS = ["low", "informational", "update"]


def _title_to_severity(title: str) -> SeverityLevel:
    """Map advisory title keywords to a severity level."""
    lower = title.lower()
    for kw in _CRITICAL_KEYWORDS:
        if kw in lower:
            return SeverityLevel.critical
    for kw in _HIGH_KEYWORDS:
        if kw in lower:
            return SeverityLevel.high
    for kw in _MEDIUM_KEYWORDS:
        if kw in lower:
            return SeverityLevel.medium
    for kw in _LOW_KEYWORDS:
        if kw in lower:
            return SeverityLevel.low
    # Default: ICS/SCADA advisories are generally high severity
    return SeverityLevel.high


class CISAAdvisoriesWorker(FeedWorker):
    """CISA ICS-CERT cybersecurity advisories for industrial control systems."""

    source_id = "cisa_advisories"
    display_name = "CISA Cybersecurity Advisories"
    category = FeedCategory.cyber
    refresh_interval = 1800  # 30 minutes

    async def fetch(self) -> List[GeoEvent]:
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
            # Some RSS feeds put items directly under root
            channel = root

        events: List[GeoEvent] = []

        for item in channel.findall("item")[:100]:
            try:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                description = (item.findtext("description") or "").strip()
                pub_date = (item.findtext("pubDate") or "").strip()
                guid = (item.findtext("guid") or "").strip()

                if not title:
                    continue

                # Parse publication date
                event_time = self._parse_pub_date(pub_date)

                # Determine severity from title keywords
                severity = _title_to_severity(title)

                # Extract advisory ID from title if present (e.g., "ICSA-25-001-01")
                advisory_id = self._extract_advisory_id(title, guid)

                # Clean description (strip CDATA wrappers and HTML)
                clean_desc = (
                    description
                    .replace("<![CDATA[", "")
                    .replace("]]>", "")
                    .strip()
                )
                # Strip simple HTML tags
                clean_desc = re.sub(r"<[^>]+>", "", clean_desc).strip()[:500]

                item_hash = hashlib.md5(
                    (guid or f"{title}{pub_date}").encode()
                ).hexdigest()[:12]

                # Determine subcategory from title
                subcategory = self._classify_subcategory(title)

                events.append(
                    GeoEvent(
                        id=f"cisa_{item_hash}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory=subcategory,
                        title=title[:200],
                        body=clean_desc or None,
                        severity=severity,
                        lat=_CISA_LAT,
                        lng=_CISA_LNG,
                        event_time=event_time,
                        url=link or None,
                        metadata={
                            "advisory_id": advisory_id,
                            "guid": guid,
                        },
                    )
                )
            except Exception:
                continue

        return events

    @staticmethod
    def _parse_pub_date(pub_date: str) -> datetime:
        """Parse RSS pubDate (RFC 2822 format) to a datetime object."""
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

    @staticmethod
    def _extract_advisory_id(title: str, guid: str) -> str | None:
        """Extract CISA advisory ID (e.g., ICSA-25-001-01) from title or GUID."""
        # CISA ICS advisories follow pattern ICSA-YY-NNN-NN or ICSMA-YY-NNN-NN
        pattern = r"(ICS[AM]?A?-\d{2}-\d{3}-\d{2})"
        match = re.search(pattern, title)
        if match:
            return match.group(1)
        match = re.search(pattern, guid)
        if match:
            return match.group(1)
        return None

    @staticmethod
    def _classify_subcategory(title: str) -> str:
        """Classify advisory into a subcategory based on title."""
        lower = title.lower()
        if "ics" in lower or "scada" in lower or "plc" in lower or "hmi" in lower:
            return "ics_advisory"
        if "medical" in lower or "icsma" in lower:
            return "medical_device_advisory"
        if "update" in lower:
            return "advisory_update"
        return "cybersecurity_advisory"
