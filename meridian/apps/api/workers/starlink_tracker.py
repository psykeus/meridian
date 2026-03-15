"""Starlink constellation — SGP4-propagated sub-satellite positions from CelesTrak GP data."""
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker
from workers._orbit_propagation import tle_from_gp_json, propagate_tle

logger = logging.getLogger(__name__)

_CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"


class StarlinkTrackerWorker(FeedWorker):
    """Tracks a representative sample of the Starlink constellation using SGP4."""

    source_id = "starlink_tracker"
    display_name = "Starlink Constellation"
    category = FeedCategory.space
    refresh_interval = 14400  # 4 hours
    run_on_startup = True

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.get(
                _CELESTRAK_GP_URL,
                params={"GROUP": "starlink", "FORMAT": "json"},
            )
            resp.raise_for_status()
            satellites = resp.json()

        if not isinstance(satellites, list):
            return []

        now = datetime.now(timezone.utc)

        # Sample: pick ~100 satellites spread across orbital planes
        planes: dict[int, list[dict]] = {}
        for sat in satellites:
            try:
                raan = float(sat.get("RA_OF_ASC_NODE", 0))
                bucket = int(raan / 10)  # 36 buckets of 10 degrees each
                planes.setdefault(bucket, []).append(sat)
            except (ValueError, TypeError):
                continue

        sampled: list[dict] = []
        per_plane = max(1, 100 // max(len(planes), 1))
        for plane_sats in planes.values():
            sampled.extend(plane_sats[:per_plane])
        sampled = sampled[:100]

        events: list[GeoEvent] = []
        for sat in sampled:
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
                    alt_km = 550  # typical Starlink altitude

                events.append(GeoEvent(
                    id=f"starlink_{norad_id}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="satellite",
                    title=f"Starlink: {object_name} (NORAD {norad_id})",
                    body=f"Alt: {alt_km:.0f} km | Inclination: {inclination:.1f}\u00b0 | Mean Motion: {mean_motion}",
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
                        "mean_motion": mean_motion,
                        "eccentricity": eccentricity,
                        "epoch": epoch_str,
                        "altitude_km": round(alt_km, 1),
                        "constellation": "starlink",
                        "tle_line1": tle_line1,
                        "tle_line2": tle_line2,
                        "arg_of_pericenter": sat.get("ARG_OF_PERICENTER"),
                    },
                ))
            except Exception:
                continue

        return events
