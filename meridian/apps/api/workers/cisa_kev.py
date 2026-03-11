import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

_CYBER_LAT, _CYBER_LNG = 38.9072, -77.0369  # Washington DC — symbolic for US federal cyber


class CISAKEVWorker(FeedWorker):
    """CISA Known Exploited Vulnerabilities catalog — new entries."""

    source_id = "cisa_kev"
    display_name = "CISA Known Exploited Vulnerabilities"
    category = FeedCategory.cyber
    refresh_interval = 7200  # 2 hours

    _URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(self._URL)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

        vulns = data.get("vulnerabilities", [])
        cutoff_days = 30
        cutoff = datetime.now(timezone.utc).timestamp() - cutoff_days * 86400

        events: List[GeoEvent] = []
        for v in vulns[:200]:
            try:
                date_added_str = v.get("dateAdded", "")
                due_date_str = v.get("dueDate", "")
                try:
                    added_dt = datetime.strptime(date_added_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except Exception:
                    continue

                if added_dt.timestamp() < cutoff:
                    continue

                cve_id = v.get("cveID", "UNKNOWN")
                vendor = v.get("vendorProject", "")
                product = v.get("product", "")
                vuln_name = v.get("vulnerabilityName", "")
                description = v.get("shortDescription", "")
                ransomware = v.get("knownRansomwareCampaignUse", "Unknown")

                severity = SeverityLevel.critical if ransomware == "Known" else SeverityLevel.high

                events.append(GeoEvent(
                    id=f"cisa_kev_{cve_id}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"{cve_id} — {vuln_name or f'{vendor} {product}'}",
                    body=description[:300] if description else None,
                    lat=_CYBER_LAT,
                    lng=_CYBER_LNG,
                    event_time=added_dt.isoformat(),
                    url=f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                    metadata={
                        "cve_id": cve_id,
                        "vendor": vendor,
                        "product": product,
                        "due_date": due_date_str,
                        "ransomware_use": ransomware,
                    },
                ))
            except Exception:
                continue

        return events
