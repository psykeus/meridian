"""CelesTrak TLE — notable satellite orbital tracking via Two-Line Element sets."""
import hashlib
import logging
import math
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

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


def _tle_epoch_to_datetime(epoch_year: int, epoch_day: float) -> datetime:
    """Convert TLE epoch (2-digit year + fractional day) to a UTC datetime."""
    if epoch_year < 57:
        full_year = 2000 + epoch_year
    else:
        full_year = 1900 + epoch_year

    base = datetime(full_year, 1, 1, tzinfo=timezone.utc)
    # epoch_day is 1-based fractional day of year
    from datetime import timedelta

    return base + timedelta(days=epoch_day - 1)


def _inclination_to_lat(inclination: float) -> float:
    """Approximate a ground-track latitude from orbital inclination."""
    lat = min(inclination, 90.0)
    return max(-90.0, min(90.0, lat))


def _compute_approx_lng(mean_anomaly: float, raan: float) -> float:
    """Rough approximation of sub-satellite longitude from mean anomaly and RAAN."""
    lng = (raan + mean_anomaly - 180.0) % 360.0 - 180.0
    return max(-180.0, min(180.0, lng))


class CelestrakTLEWorker(FeedWorker):
    """Tracks notable satellites (ISS, Tiangong, Hubble, weather sats, etc.)
    using TLE data from CelesTrak. Parses GP (General Perturbations) data
    in JSON format to produce map events at approximate sub-satellite positions."""

    source_id = "celestrak_tle"
    display_name = "CelesTrak Satellite Tracker"
    category = FeedCategory.space
    refresh_interval = 43200  # 12 hours
    run_on_startup = False  # rate-limited public API

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

                # Approximate sub-satellite point
                lat = _inclination_to_lat(inclination)
                lng = _compute_approx_lng(mean_anomaly, raan)

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
                    f"Inclination: {inclination:.1f}deg",
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
                        },
                    )
                )
            except Exception:
                continue

        return events
