"""GPS constellation — operational GPS satellite positions from CelesTrak GP data."""
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker
from workers._orbit_propagation import tle_from_gp_json, propagate_tle

logger = logging.getLogger(__name__)

_CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"


class GPSConstellationWorker(FeedWorker):
    """Tracks operational GPS satellites using CelesTrak GP data with SGP4 propagation."""

    source_id = "gps_constellation"
    display_name = "GPS Constellation"
    category = FeedCategory.space
    refresh_interval = 43200  # 12 hours
    run_on_startup = True

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                _CELESTRAK_GP_URL,
                params={"GROUP": "gps-ops", "FORMAT": "json"},
            )
            resp.raise_for_status()
            satellites = resp.json()

        if not isinstance(satellites, list):
            return []

        now = datetime.now(timezone.utc)
        events: list[GeoEvent] = []

        for sat in satellites:
            try:
                norad_id = str(sat.get("NORAD_CAT_ID", ""))
                if not norad_id:
                    continue

                object_name = sat.get("OBJECT_NAME", "UNKNOWN").strip()
                inclination = float(sat.get("INCLINATION", 0))
                mean_anomaly = float(sat.get("MEAN_ANOMALY", 0))
                raan = float(sat.get("RA_OF_ASC_NODE", 0))
                mean_motion = sat.get("MEAN_MOTION")
                eccentricity = sat.get("ECCENTRICITY")
                period_min = sat.get("PERIOD")
                epoch_str = sat.get("EPOCH")

                if epoch_str:
                    try:
                        event_time = datetime.fromisoformat(
                            epoch_str.replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        event_time = now
                else:
                    event_time = now

                # SGP4 propagation for accurate position
                try:
                    tle_line1, tle_line2 = tle_from_gp_json(sat)
                    pos = propagate_tle(tle_line1, tle_line2, now)
                except Exception:
                    pos = None
                    tle_line1, tle_line2 = "", ""

                if pos:
                    lat, lng, alt_km = pos
                else:
                    lat = max(-90.0, min(90.0, inclination))
                    lng = (raan + mean_anomaly - 180.0) % 360.0 - 180.0
                    alt_km = 20200  # typical GPS altitude

                body_parts = [
                    f"NORAD {norad_id}",
                    f"Alt: {alt_km:.0f} km",
                    f"Inclination: {inclination:.1f}\u00b0",
                    f"Period: {period_min} min" if period_min else None,
                    f"Mean Motion: {mean_motion}" if mean_motion else None,
                    f"Eccentricity: {eccentricity}" if eccentricity else None,
                ]
                body = " | ".join(p for p in body_parts if p)

                events.append(GeoEvent(
                    id=f"gps_{norad_id}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="satellite",
                    title=f"GPS: {object_name} (NORAD {norad_id})",
                    body=body,
                    severity=SeverityLevel.info,
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
                        "altitude_km": round(alt_km, 1),
                        "constellation": "gps",
                        "tle_line1": tle_line1,
                        "tle_line2": tle_line2,
                        "arg_of_pericenter": sat.get("ARG_OF_PERICENTER"),
                    },
                ))
            except Exception:
                continue

        return events
