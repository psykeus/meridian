"""NVD CVE database — new high/critical vulnerabilities from NIST."""
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_CYBER_LAT, _CYBER_LNG = 38.9072, -77.0369


class NVDCVEWorker(FeedWorker):
    source_id = "nvd_cve"
    display_name = "NVD — NIST CVE Database"
    category = FeedCategory.cyber
    refresh_interval = 7200  # 2 hours

    _URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"

    async def fetch(self) -> list[GeoEvent]:
        pub_start = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S.000")
        params = {
            "pubStartDate": pub_start,
            "pubEndDate": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000"),
            "cvssV3Severity": "HIGH",
            "resultsPerPage": 100,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(self._URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for item in data.get("vulnerabilities", []):
            cve = item.get("cve", {})
            cve_id = cve.get("id", "UNKNOWN")
            published = cve.get("published", "")
            descriptions = cve.get("descriptions", [])
            desc = next((d["value"] for d in descriptions if d.get("lang") == "en"), "")
            metrics = cve.get("metrics", {})
            cvss_data = (metrics.get("cvssMetricV31") or metrics.get("cvssMetricV30") or [{}])
            base_score = cvss_data[0].get("cvssData", {}).get("baseScore", 0) if cvss_data else 0

            severity = SeverityLevel.critical if base_score >= 9.0 else SeverityLevel.high

            try:
                event_time = datetime.fromisoformat(published.replace("Z", "+00:00"))
            except Exception:
                continue

            events.append(GeoEvent(
                id=f"nvd_{cve_id}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"{cve_id} — CVSS {base_score:.1f}",
                body=desc[:400] if desc else None,
                lat=_CYBER_LAT,
                lng=_CYBER_LNG,
                event_time=event_time.isoformat(),
                url=f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                metadata={"cve_id": cve_id, "base_score": base_score},
            ))
        return events
