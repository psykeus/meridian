"""RIPE NCC RIS — BGP routing anomaly detection."""
import logging
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

logger = logging.getLogger(__name__)

# RIPE NCC headquarters, Amsterdam
_RIPE_LAT, _RIPE_LNG = 52.3080, 4.9423

_BGP_UPDATES_URL = "https://stat.ripe.net/data/bgp-updates/data.json"
_NETWORK_INFO_URL = "https://stat.ripe.net/data/network-info/data.json"


def _prefix_count_to_severity(count: int) -> SeverityLevel:
    """Classify severity based on the number of affected prefixes."""
    if count >= 1000:
        return SeverityLevel.critical
    if count >= 500:
        return SeverityLevel.high
    if count >= 100:
        return SeverityLevel.medium
    if count >= 10:
        return SeverityLevel.low
    return SeverityLevel.info


class RIPEBGPWorker(FeedWorker):
    source_id = "ripe_bgp"
    display_name = "RIPE BGP Routing Monitor"
    category = FeedCategory.cyber
    refresh_interval = 300

    async def fetch(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        six_hours_ago = now - timedelta(hours=6)

        params = {
            "resource": "0.0.0.0/0",
            "starttime": six_hours_ago.strftime("%Y-%m-%dT%H:%M"),
            "endtime": now.strftime("%Y-%m-%dT%H:%M"),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_BGP_UPDATES_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        updates = data.get("data", {}).get("updates", [])
        if not updates:
            return []

        # Aggregate updates by type to detect anomalies
        withdrawals: dict[str, list[dict]] = {}  # target_prefix -> list of updates
        announcements: dict[str, list[dict]] = {}

        for update in updates:
            update_type = update.get("type", "")
            target = update.get("target_prefix", "")
            if not target:
                continue

            if update_type == "W":
                withdrawals.setdefault(target, []).append(update)
            elif update_type == "A":
                announcements.setdefault(target, []).append(update)

        events: list[GeoEvent] = []

        # Detect large-scale withdrawal events (potential outages/hijacks)
        total_withdrawals = sum(len(v) for v in withdrawals.values())
        total_announcements = sum(len(v) for v in announcements.values())

        if total_withdrawals > 10:
            severity = _prefix_count_to_severity(total_withdrawals)
            events.append(GeoEvent(
                id=f"ripe_bgp_withdrawals_{int(now.timestamp())}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"BGP Routing: {total_withdrawals} prefix withdrawals detected (last 6h)",
                body=(
                    f"RIPE RIS detected {total_withdrawals} BGP prefix withdrawal updates "
                    f"and {total_announcements} announcement updates across "
                    f"{len(withdrawals)} unique prefixes in the last 6 hours. "
                    f"Large withdrawal volumes may indicate route leaks, hijacks, or outages."
                ),
                lat=_RIPE_LAT,
                lng=_RIPE_LNG,
                event_time=now,
                url="https://stat.ripe.net/",
                metadata={
                    "total_withdrawals": total_withdrawals,
                    "total_announcements": total_announcements,
                    "unique_withdrawn_prefixes": len(withdrawals),
                    "unique_announced_prefixes": len(announcements),
                },
            ))

        # Detect prefixes with abnormally high churn (rapid announce/withdraw cycles)
        churn_threshold = 20
        for prefix, w_list in withdrawals.items():
            a_count = len(announcements.get(prefix, []))
            w_count = len(w_list)
            total_churn = a_count + w_count

            if total_churn < churn_threshold:
                continue

            severity = _prefix_count_to_severity(total_churn)

            # Use timestamp from the most recent update in the set
            latest_ts = None
            for u in w_list:
                ts_str = u.get("timestamp")
                if ts_str:
                    try:
                        parsed = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if latest_ts is None or parsed > latest_ts:
                            latest_ts = parsed
                    except Exception:
                        pass
            event_time = latest_ts if latest_ts else now

            events.append(GeoEvent(
                id=f"ripe_bgp_churn_{prefix.replace('/', '_')}_{int(now.timestamp())}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"BGP Route Instability: {prefix} — {total_churn} updates",
                body=(
                    f"Prefix {prefix} experienced {w_count} withdrawals and "
                    f"{a_count} announcements in 6 hours, indicating possible "
                    f"route flapping, leak, or hijack attempt."
                ),
                lat=_RIPE_LAT,
                lng=_RIPE_LNG,
                event_time=event_time,
                url=f"https://stat.ripe.net/widget/bgp-update-activity#w.resource={prefix}",
                metadata={
                    "prefix": prefix,
                    "withdrawal_count": w_count,
                    "announcement_count": a_count,
                    "total_churn": total_churn,
                },
            ))

        # Cap output to avoid flooding
        return events[:50]
