import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

_FLOOD_CATEGORY_SEVERITY = {
    "major": SeverityLevel.critical,
    "moderate": SeverityLevel.high,
    "minor": SeverityLevel.medium,
    "action": SeverityLevel.low,
    "normal": SeverityLevel.info,
    "low": SeverityLevel.info,
    "not ranked": SeverityLevel.info,
}


class USGSWaterWorker(FeedWorker):
    """USGS Water Services — streamflow gauges at action/flood stage."""

    source_id = "usgs_water"
    display_name = "USGS Streamflow Gauges"
    category = FeedCategory.environment
    refresh_interval = 900  # 15 minutes

    _URL = "https://waterservices.usgs.gov/nwis/iv/"

    async def fetch(self) -> List[GeoEvent]:
        params = {
            "format": "json",
            "stateCd": "all",
            "parameterCd": "00065",  # gage height feet
            "siteStatus": "active",
            "siteType": "ST",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(self._URL, params=params)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

        events: List[GeoEvent] = []
        time_series = data.get("value", {}).get("timeSeries", [])

        for ts in time_series[:300]:
            try:
                site_info = ts.get("sourceInfo", {})
                site_name = site_info.get("siteName", "")
                site_code = ts.get("name", "").split(":")[1] if ":" in ts.get("name", "") else ""
                geo = site_info.get("geoLocation", {}).get("geogLocation", {})
                lat = float(geo.get("latitude", 0))
                lng = float(geo.get("longitude", 0))

                if lat == 0 and lng == 0:
                    continue

                values = ts.get("values", [{}])[0].get("value", [])
                if not values:
                    continue

                latest = values[-1]
                gage_ht = float(latest.get("value", -1))
                if gage_ht < 0:
                    continue

                qualifiers = latest.get("qualifiers", [])
                flood_cat = "normal"
                for q in qualifiers:
                    q_lower = q.lower()
                    if "major" in q_lower:
                        flood_cat = "major"
                    elif "moderate" in q_lower:
                        flood_cat = "moderate"
                    elif "minor" in q_lower:
                        flood_cat = "minor"
                    elif "action" in q_lower:
                        flood_cat = "action"

                if flood_cat in ("normal", "low", "not ranked"):
                    continue

                date_str = latest.get("dateTime", "")
                try:
                    event_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    event_time = datetime.now(timezone.utc)

                severity = _FLOOD_CATEGORY_SEVERITY[flood_cat]

                events.append(GeoEvent(
                    id=f"usgs_water_{site_code}_{flood_cat}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"{flood_cat.title()} Flood Stage — {site_name[:80]}",
                    body=f"Gage height: {gage_ht:.2f} ft | Flood category: {flood_cat}",
                    lat=lat,
                    lng=lng,
                    event_time=event_time.isoformat(),
                    url=f"https://waterdata.usgs.gov/monitoring-location/{site_code}/",
                    metadata={
                        "site_code": site_code, "gage_height_ft": gage_ht,
                        "flood_category": flood_cat,
                    },
                ))
            except Exception:
                continue

        return events
