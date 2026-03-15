"""NASA FIRMS VIIRS active fire detections (NOAA-20, NRT, 24h, global)."""
import csv
import io
import logging
from datetime import datetime, timezone
from typing import List

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from .base import FeedWorker

logger = logging.getLogger(__name__)

_FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


class NASAFIRMSWorker(FeedWorker):
    """NASA FIRMS VIIRS active fire detections (NRT, 24h, global)."""

    source_id = "nasa_firms"
    display_name = "NASA FIRMS Active Fires"
    category = FeedCategory.environment
    refresh_interval = 10800  # 3 hours

    async def fetch(self) -> List[GeoEvent]:
        map_key = get_credential("FIRMS_MAP_KEY")
        if not map_key:
            logger.warning("FIRMS_MAP_KEY not configured — skipping NASA FIRMS fetch")
            return []

        url = f"{_FIRMS_URL}/{map_key}/VIIRS_NOAA20_NRT/world/1"

        async with httpx.AsyncClient(timeout=60) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
            except Exception:
                logger.exception("Failed to fetch NASA FIRMS data")
                return []

        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)

        # Sort by FRP descending, take top 200
        try:
            rows.sort(key=lambda r: float(r.get("frp", 0) or 0), reverse=True)
        except (ValueError, TypeError):
            pass
        rows = rows[:200]

        events: List[GeoEvent] = []
        for row in rows:
            try:
                lat = float(row.get("latitude", 0))
                lng = float(row.get("longitude", 0))
                if lat == 0 and lng == 0:
                    continue

                brightness = float(row.get("brightness", 0) or row.get("bright_ti4", 0) or 300)
                frp = float(row.get("frp", 0) or 0)

                if frp >= 100 or brightness >= 400:
                    severity = SeverityLevel.critical
                elif frp >= 30 or brightness >= 360:
                    severity = SeverityLevel.high
                elif frp >= 10:
                    severity = SeverityLevel.medium
                else:
                    severity = SeverityLevel.low

                acq_date = row.get("acq_date", "")
                acq_time = str(row.get("acq_time", "0000")).zfill(4)
                try:
                    event_time = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
                except Exception:
                    event_time = datetime.now(timezone.utc)

                events.append(GeoEvent(
                    id=f"firms_{acq_date}_{acq_time}_{lat:.4f}_{lng:.4f}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"Active Fire — FRP {frp:.0f} MW",
                    body=f"Brightness: {brightness:.0f} K, FRP: {frp:.0f} MW",
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    metadata={
                        "brightness": brightness,
                        "frp": frp,
                        "satellite": row.get("satellite", "VIIRS"),
                        "confidence": row.get("confidence", ""),
                        "daynight": row.get("daynight", ""),
                    },
                ))
            except Exception:
                continue

        return events
