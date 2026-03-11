"""Cloudflare Radar — internet outages and traffic anomalies."""
import logging
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS

logger = logging.getLogger(__name__)

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

        events: list[GeoEvent] = []

        # Try the outage annotations endpoint (free, no auth)
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    f"{_CF_BASE}/annotations/outages",
                    params={"dateStart": params["dateStart"], "dateEnd": params["dateEnd"], "format": "json"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for annotation in data.get("result", {}).get("annotations", []):
                        locations = annotation.get("locations", "")
                        description = annotation.get("description", "")
                        scope = annotation.get("scope", "")
                        event_type = annotation.get("eventType", "OUTAGE")
                        start_date = annotation.get("startDate", "")

                        try:
                            event_time = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                        except Exception:
                            event_time = date_end

                        severity = SeverityLevel.high if event_type == "OUTAGE" else SeverityLevel.medium

                        # Place on map using country code from locations
                        for loc in locations.split(","):
                            loc = loc.strip().upper()
                            if not loc:
                                continue
                            coords = COUNTRY_COORDS.get(loc)
                            if not coords:
                                continue
                            lat, lng = coords

                            events.append(GeoEvent(
                                id=f"cf_outage_{loc}_{int(event_time.timestamp())}",
                                source_id=self.source_id,
                                category=self.category,
                                severity=severity,
                                title=f"Internet {event_type.lower()}: {loc} — {scope}",
                                body=description[:600] if description else f"Cloudflare Radar detected a {event_type.lower()} in {loc}.",
                                lat=lat,
                                lng=lng,
                                event_time=event_time,
                                url="https://radar.cloudflare.com/",
                                metadata={
                                    "country": loc,
                                    "scope": scope,
                                    "event_type": event_type,
                                },
                            ))
        except Exception as exc:
            logger.warning("cloudflare_radar_outages_failed", extra={"error": str(exc)})

        # Fallback: check global internet quality summary for latency spikes
        if not events:
            try:
                async with httpx.AsyncClient(timeout=20) as client:
                    resp = await client.get(f"{_CF_BASE}/internet_quality/index/summary", params=params)
                    if resp.status_code == 200:
                        data = resp.json()
                        result = data.get("result", {})
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
                                    event_time=date_end,
                                    url="https://radar.cloudflare.com/",
                                    metadata={"avg_latency_ms": round(avg, 1)},
                                ))
            except Exception as exc:
                logger.warning("cloudflare_radar_quality_failed", extra={"error": str(exc)})

        return events
