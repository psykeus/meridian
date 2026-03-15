"""OSV.dev — Open Source Vulnerability database feed."""
import hashlib
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_OSV_QUERY_URL = "https://api.osv.dev/v1/query"

# Rotate through ecosystems across fetches
_ECOSYSTEMS = ["PyPI", "npm", "Go", "crates.io", "Maven", "NuGet", "RubyGems", "Packagist"]


def _hash_to_coords(text: str) -> tuple[float, float]:
    """Deterministic global spread of coordinates from a string hash."""
    h = int(hashlib.sha256(text.encode()).hexdigest(), 16)
    lat = ((h % 18000) / 100.0) - 90.0
    lng = (((h >> 64) % 36000) / 100.0) - 180.0
    return lat, lng


def _cvss_to_severity(score: float | None) -> SeverityLevel:
    if score is None:
        return SeverityLevel.medium
    if score >= 9.0:
        return SeverityLevel.critical
    if score >= 7.0:
        return SeverityLevel.high
    if score >= 4.0:
        return SeverityLevel.medium
    if score >= 0.1:
        return SeverityLevel.low
    return SeverityLevel.info


def _extract_severity(vuln: dict) -> SeverityLevel:
    """Extract severity from OSV vulnerability data."""
    # Check database_specific severity
    severity_list = vuln.get("severity") or []
    for s in severity_list:
        score_str = s.get("score", "")
        # CVSS vector string — extract base score if present
        if "CVSS" in score_str.upper():
            # Try parsing the score from the vector
            parts = score_str.split("/")
            for part in parts:
                try:
                    val = float(part)
                    if 0 <= val <= 10:
                        return _cvss_to_severity(val)
                except ValueError:
                    continue

    # Check database_specific for severity string
    db_spec = vuln.get("database_specific") or {}
    sev_str = str(db_spec.get("severity", "")).upper()
    if sev_str == "CRITICAL":
        return SeverityLevel.critical
    if sev_str == "HIGH":
        return SeverityLevel.high
    if sev_str == "MODERATE" or sev_str == "MEDIUM":
        return SeverityLevel.medium
    if sev_str == "LOW":
        return SeverityLevel.low

    return SeverityLevel.medium


class OSVVulnerabilitiesWorker(FeedWorker):
    """OSV.dev open source vulnerability feed, rotating across ecosystems."""

    source_id = "osv_vulnerabilities"
    display_name = "OSV.dev Vulnerabilities"
    category = FeedCategory.cyber
    refresh_interval = 3600

    def __init__(self) -> None:
        self._ecosystem_index = 0

    async def fetch(self) -> list[GeoEvent]:
        ecosystem = _ECOSYSTEMS[self._ecosystem_index % len(_ECOSYSTEMS)]
        self._ecosystem_index += 1

        payload = {"package": {"ecosystem": ecosystem}}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(_OSV_QUERY_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()

        vulns = data.get("vulns") or []
        events: list[GeoEvent] = []

        for vuln in vulns[:200]:
            try:
                vuln_id = vuln.get("id", "")
                if not vuln_id:
                    continue

                summary = vuln.get("summary", "")
                details = (vuln.get("details") or "")[:500]

                # Parse modified/published time
                modified = vuln.get("modified") or vuln.get("published")
                if modified:
                    try:
                        event_time = datetime.fromisoformat(
                            modified.replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        event_time = datetime.now(timezone.utc)
                else:
                    event_time = datetime.now(timezone.utc)

                severity = _extract_severity(vuln)
                lat, lng = _hash_to_coords(vuln_id)

                # Affected packages
                affected = vuln.get("affected") or []
                pkg_names = []
                for aff in affected[:5]:
                    pkg = aff.get("package", {})
                    name = pkg.get("name", "")
                    if name:
                        pkg_names.append(name)

                title = f"[{ecosystem}] {vuln_id}"
                if summary:
                    title += f": {summary[:120]}"

                aliases = vuln.get("aliases") or []

                events.append(GeoEvent(
                    id=f"osv_{hashlib.md5(vuln_id.encode()).hexdigest()[:12]}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="vulnerability",
                    title=title[:250],
                    body=details or summary or None,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=f"https://osv.dev/vulnerability/{vuln_id}",
                    metadata={
                        "vuln_id": vuln_id,
                        "ecosystem": ecosystem,
                        "aliases": aliases[:10],
                        "affected_packages": pkg_names,
                    },
                ))
            except Exception:
                continue

        return events
