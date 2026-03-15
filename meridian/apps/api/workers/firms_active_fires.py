"""NASA FIRMS — Active fire detections from VIIRS satellite sensor."""
import csv
import io
import logging
from datetime import datetime, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def _brightness_severity(bright_ti4: float) -> SeverityLevel:
    if bright_ti4 >= 400:
        return SeverityLevel.critical
    if bright_ti4 >= 360:
        return SeverityLevel.high
    if bright_ti4 >= 330:
        return SeverityLevel.medium
    if bright_ti4 >= 300:
        return SeverityLevel.low
    return SeverityLevel.info


class FIRMSActiveFiresWorker(FeedWorker):
    """NASA FIRMS VIIRS active fire detections (global, last 24h)."""

    source_id = "firms_active_fires"
    display_name = "NASA FIRMS Active Fires"
    category = FeedCategory.environment
    refresh_interval = 3600

    async def fetch(self) -> list[GeoEvent]:
        map_key = get_credential("FIRMS_MAP_KEY")
        if not map_key:
            logger.warning("FIRMS_MAP_KEY not configured — skipping FIRMS active fires fetch")
            return []
        url = f"{_FIRMS_URL}/{map_key}/VIIRS_SNPP_NRT/world/1"

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)

        # Filter to nominal or high confidence
        filtered = [
            r for r in rows
            if r.get("confidence", "").lower() in ("nominal", "high", "n", "h")
        ]

        # Sort by brightness descending, take top 500
        try:
            filtered.sort(key=lambda r: float(r.get("bright_ti4", 0) or 0), reverse=True)
        except (ValueError, TypeError):
            pass
        filtered = filtered[:500]

        events: list[GeoEvent] = []
        for row in filtered:
            try:
                lat = float(row.get("latitude", 0))
                lng = float(row.get("longitude", 0))
                if lat == 0 and lng == 0:
                    continue

                bright_ti4 = float(row.get("bright_ti4", 0) or 0)
                frp = row.get("frp", "")
                acq_date = row.get("acq_date", "")
                acq_time = row.get("acq_time", "")

                # Parse acquisition datetime
                try:
                    event_time = datetime.strptime(
                        f"{acq_date} {acq_time}", "%Y-%m-%d %H%M"
                    ).replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    event_time = datetime.now(timezone.utc)

                scan = row.get("scan", "")
                track = row.get("track", "")
                confidence = row.get("confidence", "")

                event_id = f"firms_{lat:.4f}_{lng:.4f}_{acq_date}_{acq_time}"

                events.append(GeoEvent(
                    id=event_id,
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="active_fire",
                    title=f"Active Fire ({lat:.2f}, {lng:.2f}) — Brightness {bright_ti4:.0f}K",
                    body=f"VIIRS detection: brightness {bright_ti4:.0f}K, FRP {frp}, confidence {confidence}",
                    severity=_brightness_severity(bright_ti4),
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    metadata={
                        "bright_ti4": bright_ti4,
                        "frp": frp,
                        "confidence": confidence,
                        "scan": scan,
                        "track": track,
                        "satellite": row.get("satellite", ""),
                        "instrument": row.get("instrument", ""),
                        "daynight": row.get("daynight", ""),
                    },
                ))
            except Exception:
                continue

        return events
