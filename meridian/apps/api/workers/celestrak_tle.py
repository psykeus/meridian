"""CelesTrak TLE — notable satellite orbital tracking via Two-Line Element sets."""
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker
from workers._orbit_propagation import tle_from_gp_json, propagate_tle

logger = logging.getLogger(__name__)

_CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"

# Notable satellites to track (NORAD catalog IDs and names)
_NOTABLE_SATELLITES = {
    "25544": "ISS (ZARYA)",
    "48274": "CSS (TIANHE)",
    "20580": "HUBBLE",
    "43013": "NOAA-20 (JPSS-1)",
    "27424": "TERRA",
    "25994": "AQUA",
    "28654": "NOAA-18",
    "33591": "NOAA-19",
    "39084": "LANDSAT 8",
    "49260": "LANDSAT 9",
    "29155": "GOES-13",
    "36411": "SDO",
    "43226": "GOES-17",
    "41866": "GOES-16",
    "54216": "STARLINK-5001",
    "44713": "STARLINK-1007",
}


class CelestrakTLEWorker(FeedWorker):
    """Tracks notable satellites (ISS, Tiangong, Hubble, weather sats, etc.)
    using TLE data from CelesTrak. Uses SGP4 propagation for accurate
    sub-satellite positions."""

    source_id = "celestrak_tle"
    display_name = "CelesTrak Satellite Tracker"
    category = FeedCategory.space
    refresh_interval = 43200  # 12 hours
    run_on_startup = True

    async def fetch(self) -> list[GeoEvent]:
        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)

        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch active satellites GP data in JSON format
            try:
                resp = await client.get(
                    _CELESTRAK_GP_URL,
                    params={"GROUP": "stations", "FORMAT": "json"},
                )
                resp.raise_for_status()
                stations = resp.json()
            except Exception:
                stations = []

            # Also fetch a broader set by NORAD ID for notable satellites
            for norad_id, expected_name in _NOTABLE_SATELLITES.items():
                try:
                    resp = await client.get(
                        _CELESTRAK_GP_URL,
                        params={"CATNR": norad_id, "FORMAT": "json"},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if isinstance(data, list):
                            stations.extend(data)
                except Exception:
                    continue

        # Deduplicate by NORAD_CAT_ID
        seen_ids: set[str] = set()
        for sat in stations:
            try:
                norad_id = str(sat.get("NORAD_CAT_ID", ""))
                if not norad_id or norad_id in seen_ids:
                    continue
                seen_ids.add(norad_id)

                object_name = sat.get("OBJECT_NAME", "UNKNOWN").strip()
                inclination = float(sat.get("INCLINATION", 0))
                mean_anomaly = float(sat.get("MEAN_ANOMALY", 0))
                raan = float(sat.get("RA_OF_ASC_NODE", 0))
                period_min = sat.get("PERIOD")
                epoch_str = sat.get("EPOCH")
                mean_motion = sat.get("MEAN_MOTION")
                eccentricity = sat.get("ECCENTRICITY")

                # Parse epoch for event_time
                if epoch_str:
                    try:
                        event_time = datetime.fromisoformat(
                            epoch_str.replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        event_time = now
                else:
                    event_time = now

                # Generate TLE lines from GP JSON for SGP4 propagation
                try:
                    tle_line1, tle_line2 = tle_from_gp_json(sat)
                    pos = propagate_tle(tle_line1, tle_line2, now)
                except Exception:
                    pos = None
                    tle_line1, tle_line2 = "", ""

                if pos:
                    lat, lng, alt_km = pos
                else:
                    # Fallback: crude approximation
                    lat = max(-90.0, min(90.0, inclination))
                    lng = (raan + mean_anomaly - 180.0) % 360.0 - 180.0
                    alt_km = 0

                # Severity: ISS and crewed stations are medium; rest are info
                is_notable = norad_id in _NOTABLE_SATELLITES
                if norad_id in ("25544", "48274"):
                    severity = SeverityLevel.medium  # crewed station
                elif is_notable:
                    severity = SeverityLevel.low
                else:
                    severity = SeverityLevel.info

                body_parts = [
                    f"NORAD {norad_id}",
                    f"Inclination: {inclination:.1f}\u00b0",
                    f"Alt: {alt_km:.0f} km" if alt_km > 0 else None,
                    f"Period: {period_min} min" if period_min else None,
                    f"Mean Motion: {mean_motion}" if mean_motion else None,
                    f"Eccentricity: {eccentricity}" if eccentricity else None,
                ]
                body = " | ".join(p for p in body_parts if p)

                events.append(
                    GeoEvent(
                        id=f"celestrak_{norad_id}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="satellite",
                        title=f"SAT: {object_name} (NORAD {norad_id})",
                        body=body,
                        severity=severity,
                        lat=lat,
                        lng=lng,
                        event_time=event_time,
                        url=f"https://celestrak.org/NORAD/elements/gp.php?CATNR={norad_id}&FORMAT=JSON",
                        metadata={
                            "norad_cat_id": norad_id,
                            "object_name": object_name,
                            "inclination": inclination,
                            "mean_anomaly": mean_anomaly,
                            "raan": raan,
                            "period_min": period_min,
                            "mean_motion": mean_motion,
                            "eccentricity": eccentricity,
                            "epoch": epoch_str,
                            "altitude_km": round(alt_km, 1) if alt_km > 0 else None,
                            "tle_line1": tle_line1,
                            "tle_line2": tle_line2,
                            "arg_of_pericenter": sat.get("ARG_OF_PERICENTER"),
                        },
                    )
                )
            except Exception:
                continue

        return events
