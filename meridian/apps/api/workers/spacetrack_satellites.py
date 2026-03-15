"""Space-Track.org — active satellite tracking and orbital debris monitoring."""

import logging
from datetime import datetime, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker
from workers._orbit_propagation import tle_from_gp_json, propagate_tle

logger = logging.getLogger(__name__)

_LOGIN_URL = "https://www.space-track.org/ajaxauth/login"
_GP_URL = (
    "https://www.space-track.org/basicspacedata/query"
    "/class/gp/orderby/NORAD_CAT_ID%20asc/limit/50/format/json"
)


class SpaceTrackSatellitesWorker(FeedWorker):
    """Tracks active satellites and decaying orbital objects via Space-Track.org.

    Requires SPACETRACK_USERNAME and SPACETRACK_PASSWORD credentials
    (set via the Settings UI or environment variables).
    """

    source_id = "spacetrack_satellites"
    display_name = "Space-Track Satellite Monitor"
    category = FeedCategory.space
    refresh_interval = 43200  # 12 hours
    run_on_startup = False  # requires credentials

    async def fetch(self) -> list[GeoEvent]:
        username = get_credential("SPACETRACK_USERNAME")
        password = get_credential("SPACETRACK_PASSWORD")
        if not username or not password:
            logger.warning("spacetrack_skip: missing SPACETRACK_USERNAME or SPACETRACK_PASSWORD")
            return []

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            # Authenticate — Space-Track uses session cookies
            login_resp = await client.post(
                _LOGIN_URL,
                data={"identity": username, "password": password},
            )
            login_resp.raise_for_status()

            # Fetch general perturbations (GP) data
            resp = await client.get(_GP_URL)
            resp.raise_for_status()
            records = resp.json()

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)

        for rec in records:
            norad_id = rec.get("NORAD_CAT_ID", "")
            object_name = rec.get("OBJECT_NAME", "UNKNOWN")
            object_type = rec.get("OBJECT_TYPE", "")
            decay_date_str = rec.get("DECAY_DATE")
            epoch_str = rec.get("EPOCH")
            inclination = rec.get("INCLINATION")
            period = rec.get("PERIOD")
            apoapsis = rec.get("APOAPSIS")
            periapsis = rec.get("PERIAPSIS")
            rcs_size = rec.get("RCS_SIZE")
            country_code = rec.get("COUNTRY_CODE", "")
            launch_date_str = rec.get("LAUNCH_DATE")
            mean_motion = rec.get("MEAN_MOTION")

            # Determine if this object is decaying
            is_decaying = bool(decay_date_str)

            # Parse epoch as event_time
            if epoch_str:
                try:
                    event_time = datetime.fromisoformat(
                        epoch_str.replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    event_time = now
            else:
                event_time = now

            # Severity: medium for decaying objects, info for tracked
            severity = SeverityLevel.medium if is_decaying else SeverityLevel.info

            # Generate TLE and propagate position from GP JSON
            tle_line1, tle_line2 = "", ""
            lat, lng = 34.05, -118.24  # fallback: JPL/Vandenberg
            try:
                tle_line1, tle_line2 = tle_from_gp_json(rec)
                pos = propagate_tle(tle_line1, tle_line2, now)
                if pos:
                    lat, lng = pos[0], pos[1]
            except Exception:
                tle_line1, tle_line2 = "", ""

            status_label = "DECAYING" if is_decaying else "ACTIVE"
            title = f"{object_name} [{status_label}]"
            body_parts = [
                f"NORAD {norad_id}",
                f"Type: {object_type}" if object_type else None,
                f"Country: {country_code}" if country_code else None,
                f"Inclination: {inclination}°" if inclination else None,
                f"Period: {period} min" if period else None,
                f"Apoapsis: {apoapsis} km" if apoapsis else None,
                f"Periapsis: {periapsis} km" if periapsis else None,
                f"Decay date: {decay_date_str}" if decay_date_str else None,
            ]
            body = " · ".join(p for p in body_parts if p)

            events.append(
                GeoEvent(
                    id=f"spacetrack_{norad_id}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="satellite_tracking",
                    title=title,
                    body=body,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=f"https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/{norad_id}/format/json",
                    metadata={
                        "norad_cat_id": norad_id,
                        "object_name": object_name,
                        "object_type": object_type,
                        "country_code": country_code,
                        "launch_date": launch_date_str,
                        "decay_date": decay_date_str,
                        "is_decaying": is_decaying,
                        "inclination": inclination,
                        "period": period,
                        "apoapsis": apoapsis,
                        "periapsis": periapsis,
                        "mean_motion": mean_motion,
                        "rcs_size": rcs_size,
                        "epoch": epoch_str,
                        "tle_line1": tle_line1,
                        "tle_line2": tle_line2,
                    },
                )
            )

        return events
