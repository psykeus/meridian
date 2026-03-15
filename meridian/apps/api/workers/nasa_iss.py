import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel
from workers._orbit_propagation import propagate_tle


class NASAISSWorker(FeedWorker):
    """NASA Open Notify — ISS current position (live tracking).
    Uses Open Notify for crew data, CelesTrak TLE for SGP4 propagation."""

    source_id = "nasa_iss"
    display_name = "NASA ISS Position"
    category = FeedCategory.space
    refresh_interval = 30  # 30s — avoids flooding events while staying near-real-time

    _URL = "http://api.open-notify.org/iss-now.json"
    _CREW_URL = "http://api.open-notify.org/astros.json"
    _TLE_URL = "https://celestrak.org/NORAD/elements/gp.php"

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(self._URL)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

            crew_count = 0
            try:
                crew_resp = await client.get(self._CREW_URL)
                crew_resp.raise_for_status()
                crew_data = crew_resp.json()
                crew_count = len([p for p in crew_data.get("people", []) if p.get("craft") == "ISS"])
            except Exception:
                pass

            # Fetch TLE for ISS (NORAD 25544) for client-side propagation
            tle_line1, tle_line2 = "", ""
            iss_alt_km = 408
            try:
                tle_resp = await client.get(
                    self._TLE_URL,
                    params={"CATNR": "25544", "FORMAT": "tle"},
                )
                if tle_resp.status_code == 200:
                    lines = tle_resp.text.strip().split("\n")
                    if len(lines) >= 3:
                        tle_line1 = lines[1].strip()
                        tle_line2 = lines[2].strip()
                    elif len(lines) == 2:
                        tle_line1 = lines[0].strip()
                        tle_line2 = lines[1].strip()
            except Exception:
                pass

        pos = data.get("iss_position", {})
        lat = float(pos.get("latitude", 0))
        lng = float(pos.get("longitude", 0))
        ts = data.get("timestamp", 0)

        event_time = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else datetime.now(timezone.utc)

        # If we have TLE, try SGP4 for altitude
        if tle_line1 and tle_line2:
            sgp4_pos = propagate_tle(tle_line1, tle_line2, event_time)
            if sgp4_pos:
                iss_alt_km = sgp4_pos[2]

        return [GeoEvent(
            id="iss_position",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.info,
            title=f"ISS \u2014 Live Position ({crew_count} crew)" if crew_count else "ISS \u2014 Live Position",
            body=f"International Space Station at {lat:.4f}\u00b0, {lng:.4f}\u00b0 | Alt: {iss_alt_km:.0f} km",
            lat=lat,
            lng=lng,
            event_time=event_time,
            url="https://www.nasa.gov/international-space-station/",
            metadata={
                "crew_aboard": crew_count,
                "altitude_km": round(iss_alt_km, 1),
                "norad_cat_id": "25544",
                "live_feed": "https://eol.jsc.nasa.gov/ESRS/HDEV/",
                "tracker": "https://spotthestation.nasa.gov/tracking_map.cfm",
                "tle_line1": tle_line1,
                "tle_line2": tle_line2,
            },
        )]
