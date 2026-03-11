"""OONI — Open Observatory of Network Interference, internet censorship data."""
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from ._country_coords import COUNTRY_COORDS


class OONIWorker(FeedWorker):
    source_id = "ooni"
    display_name = "OONI — Internet Censorship Monitor"
    category = FeedCategory.cyber
    refresh_interval = 86400  # daily

    _URL = "https://api.ooni.io/api/v1/aggregation"

    async def fetch(self) -> list[GeoEvent]:
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        params = {
            "since": since,
            "axis_x": "probe_cc",
            "test_name": "web_connectivity",
            "anomaly_count_threshold": 10,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(self._URL, params=params)
            if not resp.is_success:
                return []
            data = resp.json()

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)
        for row in (data.get("result") or [])[:30]:
            cc = (row.get("probe_cc") or "").lower()
            anomaly_count = row.get("anomaly_count", 0)
            measurement_count = row.get("measurement_count", 0)
            if not cc or anomaly_count < 20:
                continue

            coords = COUNTRY_COORDS.get(cc)
            if not coords:
                continue

            ratio = anomaly_count / max(measurement_count, 1)
            severity = SeverityLevel.high if ratio > 0.3 else SeverityLevel.medium

            events.append(GeoEvent(
                id=f"ooni_{cc}_{now.strftime('%Y%m%d')}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"Internet Censorship: {cc.upper()} — {anomaly_count} anomalies ({ratio*100:.0f}% of tests)",
                body=f"{cc.upper()}: {anomaly_count} censorship anomalies detected out of {measurement_count} OONI measurements in the last 7 days.",
                lat=coords[0], lng=coords[1],
                event_time=now.isoformat(),
                url=f"https://explorer.ooni.org/country/{cc.upper()}",
                metadata={"country": cc.upper(), "anomaly_count": anomaly_count, "measurement_count": measurement_count, "anomaly_ratio": round(ratio, 3)},
            ))
        return events
