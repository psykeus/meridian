import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel


class NASAFIRMSWorker(FeedWorker):
    """NASA FIRMS VIIRS active fire detections (NRT, 24h, global)."""

    source_id = "nasa_firms"
    display_name = "NASA FIRMS Active Fires"
    category = FeedCategory.environment
    refresh_interval = 10800  # 3 hours

    # Public CSV endpoint requires MAP_KEY — falls back to world fire events GeoJSON
    _GEOJSON_URL = (
        "https://firms.modaps.eosdis.nasa.gov/api/country/csv/"
        "VIIRS_SNPP_NRT/World/1"
    )
    _FALLBACK_URL = (
        "https://firms.modaps.eosdis.nasa.gov/active_fire/noaa-20-viirs-c2/"
        "json/J1_VIIRS_C2_Global_24h.json"
    )

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(self._FALLBACK_URL)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

        events: List[GeoEvent] = []
        features = data.get("features") or data if isinstance(data, list) else []
        for feat in features[:200]:
            try:
                props = feat.get("properties", feat)
                geom = feat.get("geometry", {})
                if geom.get("type") != "Point":
                    continue
                lng, lat = geom["coordinates"][:2]
                brightness = float(props.get("bright_ti4") or props.get("brightness") or 300)
                frp = float(props.get("frp") or 0)

                if frp >= 100 or brightness >= 400:
                    severity = SeverityLevel.critical
                elif frp >= 30 or brightness >= 360:
                    severity = SeverityLevel.high
                elif frp >= 10:
                    severity = SeverityLevel.medium
                else:
                    severity = SeverityLevel.low

                acq_date = props.get("acq_date", "")
                acq_time = str(props.get("acq_time", "0000")).zfill(4)
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
                    event_time=event_time.isoformat(),
                    metadata={"brightness": brightness, "frp": frp,
                               "satellite": props.get("satellite", "VIIRS")},
                ))
            except Exception:
                continue

        return events
