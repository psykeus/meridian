"""FEMA — National Shelter System open shelter locations."""
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_DISASTER_SUMMARIES_URL = "https://www.fema.gov/api/open/v2/FemaWebDisasterSummaries"

# State centroid coordinates for fallback geocoding
_STATE_COORDS: dict[str, tuple[float, float]] = {
    "FL": (27.8, -81.8), "TX": (31.0, -100.0), "CA": (36.7, -119.4),
    "NY": (43.0, -75.5), "AL": (32.8, -86.8), "MS": (32.7, -89.7),
    "LA": (31.2, -92.1), "GA": (32.9, -83.4), "NC": (35.8, -79.0),
    "SC": (33.8, -81.2), "VA": (37.4, -79.4), "KY": (37.7, -84.9),
    "TN": (35.9, -86.4), "AR": (34.8, -92.2), "OK": (35.5, -96.9),
    "KS": (38.5, -98.4), "NE": (41.1, -98.3), "SD": (44.3, -100.3),
    "ND": (47.4, -100.5), "MN": (46.4, -93.1), "WI": (44.3, -89.8),
    "MI": (43.3, -84.5), "OH": (40.4, -82.7), "IN": (40.3, -86.1),
    "IL": (40.3, -89.0), "MO": (38.5, -92.3), "IA": (42.0, -93.2),
    "WV": (38.4, -80.5), "PA": (40.6, -77.2), "NJ": (40.1, -74.7),
    "CT": (41.6, -72.7), "MA": (42.3, -71.8), "RI": (41.6, -71.5),
    "NH": (43.4, -71.6), "VT": (44.0, -72.7), "ME": (44.7, -69.4),
    "MD": (39.0, -76.7), "DE": (38.9, -75.5), "CO": (38.8, -105.5),
    "UT": (39.4, -111.1), "NV": (39.3, -116.8), "ID": (44.3, -114.5),
    "MT": (46.9, -110.5), "WY": (43.1, -107.6), "AZ": (34.3, -111.1),
    "NM": (34.5, -106.2), "WA": (47.4, -120.6), "OR": (43.9, -120.6),
    "AK": (61.4, -152.3), "HI": (20.3, -156.3), "DC": (38.9, -77.0),
    "PR": (18.2, -66.6), "VI": (18.3, -64.9), "GU": (13.4, 144.8),
    "AS": (-14.3, -170.7), "MP": (15.1, 145.7),
}


def _shelter_severity(total_occupancy: int, capacity: int) -> SeverityLevel:
    """Determine severity based on shelter occupancy relative to capacity."""
    if capacity <= 0:
        return SeverityLevel.info
    occupancy_ratio = total_occupancy / capacity
    if occupancy_ratio >= 0.9:
        return SeverityLevel.high
    if occupancy_ratio >= 0.7:
        return SeverityLevel.medium
    return SeverityLevel.info


class FEMASheltersWorker(FeedWorker):
    source_id = "fema_shelters"
    display_name = "FEMA Open Shelters"
    category = FeedCategory.humanitarian
    refresh_interval = 3600  # hourly

    _URL = _DISASTER_SUMMARIES_URL

    async def fetch(self) -> list[GeoEvent]:
        params = {
            "$top": 50,
            "$orderby": "lastRefresh desc",
            "$format": "json",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(self._URL, params=params)
                if resp.status_code in (401, 403, 404):
                    logger.warning("fema_shelters_api_unavailable", extra={"status": resp.status_code})
                    return []
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                logger.warning("fema_shelters_fetch_failed", extra={"error": str(exc)})
                return []

        events: list[GeoEvent] = []
        summaries = data.get("FemaWebDisasterSummaries", [])

        for item in summaries:
            try:
                disaster_number = item.get("disasterNumber", "")
                state = item.get("state", "")
                title_str = item.get("title") or item.get("declarationTitle", "")
                incident_type = item.get("incidentType", "")
                total_number_ia_approved = int(item.get("totalNumberIaApproved", 0) or 0)
                total_amount_ia_approved = float(item.get("totalAmountIhpApproved", 0) or 0)
                total_amount_ha_approved = float(item.get("totalAmountHaApproved", 0) or 0)
                total_amount_ona_approved = float(item.get("totalAmountOnaApproved", 0) or 0)
                open_shelters = int(item.get("openShelters", 0) or 0)
                shelter_occupancy = int(item.get("totalShelterOccupancy", 0) or item.get("shelterOccupancy", 0) or 0)

                # Skip entries with no shelter activity and no significant aid
                if open_shelters == 0 and total_number_ia_approved == 0 and total_amount_ia_approved == 0:
                    continue

                # Geocode using state
                lat, lng = _STATE_COORDS.get(state, (38.9, -77.0))

                # Try to get coordinates from item if available
                item_lat = item.get("latitude") or item.get("lat")
                item_lng = item.get("longitude") or item.get("lng") or item.get("lon")
                if item_lat and item_lng:
                    try:
                        lat = float(item_lat)
                        lng = float(item_lng)
                    except (ValueError, TypeError):
                        pass

                # Parse date
                date_str = item.get("lastRefresh") or item.get("declarationDate", "")
                try:
                    event_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    event_time = datetime.now(timezone.utc)

                # Determine severity based on shelter capacity usage
                if open_shelters > 0 and shelter_occupancy > 0:
                    # Estimate capacity — assume average shelter holds ~200 people
                    estimated_capacity = open_shelters * 200
                    severity = _shelter_severity(shelter_occupancy, estimated_capacity)
                elif open_shelters > 0:
                    severity = SeverityLevel.info
                else:
                    severity = SeverityLevel.low

                # Build descriptive body
                body_parts = []
                if open_shelters > 0:
                    body_parts.append(f"Open shelters: {open_shelters}")
                if shelter_occupancy > 0:
                    body_parts.append(f"Shelter occupancy: {shelter_occupancy:,}")
                if total_number_ia_approved > 0:
                    body_parts.append(f"IA applications approved: {total_number_ia_approved:,}")
                if total_amount_ia_approved > 0:
                    body_parts.append(f"IHP approved: ${total_amount_ia_approved:,.0f}")
                if total_amount_ha_approved > 0:
                    body_parts.append(f"Housing assistance: ${total_amount_ha_approved:,.0f}")
                if total_amount_ona_approved > 0:
                    body_parts.append(f"Other needs: ${total_amount_ona_approved:,.0f}")

                display_title = title_str or f"FEMA DR-{disaster_number}"
                if state:
                    display_title = f"{display_title} ({state})"
                if open_shelters > 0:
                    display_title = f"Shelters Open — {display_title}"

                events.append(GeoEvent(
                    id=f"fema_shelter_{disaster_number}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="shelter",
                    title=display_title[:200],
                    body=" | ".join(body_parts) if body_parts else None,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=f"https://www.fema.gov/disaster/{disaster_number}",
                    metadata={
                        "disaster_number": str(disaster_number),
                        "state": state,
                        "incident_type": incident_type,
                        "open_shelters": open_shelters,
                        "shelter_occupancy": shelter_occupancy,
                        "total_ia_approved": total_number_ia_approved,
                        "total_ihp_approved": total_amount_ia_approved,
                    },
                ))
            except Exception:
                continue

        return events
