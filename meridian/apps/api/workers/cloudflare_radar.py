"""Cloudflare Radar — internet outages and traffic anomalies."""
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_CF_BASE = "https://api.cloudflare.com/client/v4/radar"


class CloudflareRadarWorker(FeedWorker):
    source_id = "cloudflare_radar"
    display_name = "Cloudflare Radar — Internet Outages"
    category = FeedCategory.cyber
    refresh_interval = 300  # 5 minutes

    async def fetch(self) -> list[GeoEvent]:
        date_end = datetime.now(timezone.utc)
        date_start = date_end - timedelta(hours=6)
        params = {
            "dateStart": date_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "dateEnd": date_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{_CF_BASE}/internet_quality/index/summary", params=params)
            if resp.status_code != 200:
                return []
            data = resp.json()

        events: list[GeoEvent] = []
        result = data.get("result", {})
        meta = data.get("result_info", {})

        for series in result.get("serie_0", {}).get("timestamps", [])[:5]:
            pass

        outage_resp_data = data.get("result", {})
        if not outage_resp_data:
            return []

        dn = result.get("serie_0", {}).get("p50", [])
        if dn:
            avg = sum(dn) / len(dn)
            if avg > 100:
                events.append(GeoEvent(
                    id=f"cf_radar_{int(date_end.timestamp())}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=SeverityLevel.medium,
                    title=f"Cloudflare Radar: Global internet latency elevated ({avg:.0f}ms avg)",
                    body="Cloudflare Radar is detecting elevated global internet latency, which may indicate widespread network disruption.",
                    lat=37.3861, lng=-122.0839,
                    event_time=date_end.isoformat(),
                    url="https://radar.cloudflare.com/",
                    metadata={"avg_latency_ms": round(avg, 1)},
                ))
        return events
