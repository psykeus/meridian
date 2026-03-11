"""Oracle IODA — Internet Outage Detection and Analysis."""
import logging
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS

logger = logging.getLogger(__name__)

_IODA_SIGNALS_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country"


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

        params = {
            "from": int(six_hours_ago.timestamp()),
            "until": int(now.timestamp()),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_IODA_SIGNALS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []

        # The IODA v2 API returns signal data keyed by country
        # Response shape: { "data": [ { "entityCode": "US", ... "signals": [...] }, ... ] }
        entries = data.get("data", [])
        if isinstance(entries, dict):
            entries = entries.get("countries", entries.get("results", []))

        for entry in entries:
            try:
                entity_code = (
                    entry.get("entityCode", "")
                    or entry.get("entity", {}).get("code", "")
                    or entry.get("country", "")
                )
                if not entity_code:
                    continue

                cc = entity_code.strip().lower()
                coords = COUNTRY_COORDS.get(cc)
                if not coords:
                    continue

                # Extract outage signals — look for significant drops
                # IODA provides multiple datasource signals (BGP, active probing, darknet)
                signals = entry.get("signals", entry.get("dataseries", []))
                if not signals:
                    # Some response formats nest values differently
                    overall_score = entry.get("score", entry.get("severity", 0))
                    if not overall_score:
                        continue
                    severity_score = float(overall_score)
                else:
                    # Compute average drop across signal sources
                    drops = []
                    for signal in signals:
                        value = signal.get("value", signal.get("score", None))
                        if value is not None:
                            try:
                                drops.append(float(value))
                            except (TypeError, ValueError):
                                pass
                    if not drops:
                        continue
                    severity_score = sum(drops) / len(drops)

                # Only report meaningful outages
                if severity_score < 10:
                    continue

                severity = _score_to_severity(severity_score)

                # Try to parse a timestamp from the entry
                event_time = now
                ts = entry.get("time", entry.get("timestamp", entry.get("from", None)))
                if ts is not None:
                    try:
                        if isinstance(ts, (int, float)):
                            event_time = datetime.fromtimestamp(ts, tz=timezone.utc)
                        elif isinstance(ts, str):
                            event_time = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except Exception:
                        event_time = now

                country_upper = cc.upper()
                lat, lng = coords

                events.append(GeoEvent(
                    id=f"ioda_{cc}_{int(now.timestamp())}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"Internet Outage: {country_upper} — {severity_score:.0f}% signal drop",
                    body=(
                        f"IODA detected a {severity_score:.0f}% drop in internet connectivity "
                        f"signals for {country_upper}. This may indicate a significant "
                        f"internet outage caused by infrastructure failure, cable cuts, "
                        f"or government-imposed shutdowns."
                    ),
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=f"https://ioda.inetintel.cc.gatech.edu/country/{country_upper}",
                    metadata={
                        "country": country_upper,
                        "severity_score": round(severity_score, 1),
                        "signal_sources": len(signals) if isinstance(signals, list) else 0,
                    },
                ))
            except Exception as exc:
                logger.warning(
                    "ioda_entry_parse_error",
                    extra={"error": str(exc), "entry_keys": list(entry.keys()) if isinstance(entry, dict) else None},
                )
                continue

        return events[:50]
