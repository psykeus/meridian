"""Oracle IODA — Internet Outage Detection and Analysis."""
import logging
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS

logger = logging.getLogger(__name__)

_IODA_ALERTS_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts"

# IODA alert levels map to severity
_LEVEL_SEVERITY = {
    "critical": SeverityLevel.critical,
    "warning": SeverityLevel.high,
    "normal": SeverityLevel.low,
}


def _score_to_severity(score: float) -> SeverityLevel:
    """Map an outage severity score (0-100 percentage drop) to SeverityLevel."""
    if score >= 75:
        return SeverityLevel.critical
    if score >= 50:
        return SeverityLevel.high
    if score >= 25:
        return SeverityLevel.medium
    if score >= 10:
        return SeverityLevel.low
    return SeverityLevel.info


class IODAOutagesWorker(FeedWorker):
    source_id = "ioda_outages"
    display_name = "IODA Internet Outages"
    category = FeedCategory.cyber
    refresh_interval = 300

    async def fetch(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        six_hours_ago = now - timedelta(hours=6)

        from_ts = int(six_hours_ago.timestamp())
        until_ts = int(now.timestamp())
        url = f"{_IODA_ALERTS_URL}?from={from_ts}&until={until_ts}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []

        # The outages/alerts endpoint returns:
        # { "data": [ { "entity": { "code": "US", "type": "country", ... },
        #               "level": "warning", "condition": "...",
        #               "time": 1234567890, "datasource": "bgp", ... }, ... ] }
        alerts = data.get("data", [])
        if isinstance(alerts, dict):
            alerts = alerts.get("alerts", alerts.get("results", []))

        for alert in alerts:
            try:
                # Extract entity info
                entity = alert.get("entity", {})
                entity_code = (
                    entity.get("code", "")
                    or alert.get("entityCode", "")
                    or alert.get("country", "")
                )
                entity_type = entity.get("type", "").lower()

                if not entity_code:
                    continue

                # Only process country-level alerts for coordinate mapping
                if entity_type and entity_type != "country":
                    continue

                cc = entity_code.strip().lower()
                coords = COUNTRY_COORDS.get(cc)
                if not coords:
                    continue

                # Determine severity from alert level or score
                level = alert.get("level", "").lower()
                if level in _LEVEL_SEVERITY:
                    severity = _LEVEL_SEVERITY[level]
                else:
                    score = alert.get("score", alert.get("severity", 0))
                    try:
                        severity = _score_to_severity(float(score))
                    except (TypeError, ValueError):
                        severity = SeverityLevel.medium

                # Skip low-severity / normal alerts
                if severity in (SeverityLevel.low, SeverityLevel.info):
                    continue

                # Parse timestamp
                event_time = now
                ts = alert.get("time", alert.get("timestamp", alert.get("from", None)))
                if ts is not None:
                    try:
                        if isinstance(ts, (int, float)):
                            event_time = datetime.fromtimestamp(ts, tz=timezone.utc)
                        elif isinstance(ts, str):
                            event_time = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except Exception:
                        event_time = now

                datasource = alert.get("datasource", "unknown")
                condition = alert.get("condition", "")
                country_upper = cc.upper()
                lat, lng = coords

                events.append(GeoEvent(
                    id=f"ioda_{cc}_{datasource}_{int(event_time.timestamp())}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"Internet Outage Alert: {country_upper} ({datasource})",
                    body=(
                        f"IODA detected an internet connectivity alert for {country_upper} "
                        f"via {datasource}. Level: {level or 'unknown'}. "
                        f"{condition}"
                    ).strip()[:600],
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=f"https://ioda.inetintel.cc.gatech.edu/country/{country_upper}",
                    metadata={
                        "country": country_upper,
                        "level": level,
                        "datasource": datasource,
                        "condition": condition[:200] if condition else None,
                    },
                ))
            except Exception as exc:
                logger.warning(
                    "ioda_entry_parse_error",
                    extra={"error": str(exc), "entry_keys": list(alert.keys()) if isinstance(alert, dict) else None},
                )
                continue

        return events[:50]
