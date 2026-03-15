"""PowerOutage.us — US power outage tracking by county."""
import hashlib
import logging
from datetime import datetime, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_POWER_OUTAGE_URL = "https://poweroutage.us/api/web/counties"

# Approximate state centroids for fallback geo mapping
_STATE_COORDS: dict[str, tuple[float, float]] = {
    "Alabama": (32.81, -86.79), "Alaska": (63.35, -152.00),
    "Arizona": (34.05, -111.09), "Arkansas": (34.80, -92.20),
    "California": (36.78, -119.42), "Colorado": (39.55, -105.78),
    "Connecticut": (41.60, -72.76), "Delaware": (38.91, -75.53),
    "Florida": (27.66, -81.52), "Georgia": (32.16, -82.90),
    "Hawaii": (19.90, -155.58), "Idaho": (44.07, -114.74),
    "Illinois": (40.63, -89.40), "Indiana": (40.27, -86.13),
    "Iowa": (41.88, -93.10), "Kansas": (39.01, -98.48),
    "Kentucky": (37.84, -84.27), "Louisiana": (30.98, -91.96),
    "Maine": (45.25, -69.45), "Maryland": (39.05, -76.64),
    "Massachusetts": (42.41, -71.38), "Michigan": (44.31, -85.60),
    "Minnesota": (46.73, -94.69), "Mississippi": (32.35, -89.40),
    "Missouri": (37.96, -91.83), "Montana": (46.88, -110.36),
    "Nebraska": (41.49, -99.90), "Nevada": (38.80, -116.42),
    "New Hampshire": (43.19, -71.57), "New Jersey": (40.06, -74.41),
    "New Mexico": (34.52, -105.87), "New York": (43.30, -74.22),
    "North Carolina": (35.76, -79.02), "North Dakota": (47.55, -101.00),
    "Ohio": (40.42, -82.91), "Oklahoma": (35.47, -97.52),
    "Oregon": (43.80, -120.55), "Pennsylvania": (41.20, -77.19),
    "Rhode Island": (41.58, -71.48), "South Carolina": (33.84, -81.16),
    "South Dakota": (43.97, -99.90), "Tennessee": (35.52, -86.58),
    "Texas": (31.97, -99.90), "Utah": (39.32, -111.09),
    "Vermont": (44.56, -72.58), "Virginia": (37.43, -78.66),
    "Washington": (47.75, -120.74), "West Virginia": (38.60, -80.45),
    "Wisconsin": (43.78, -88.79), "Wyoming": (43.08, -107.29),
    "District of Columbia": (38.91, -77.04),
}


def _outage_severity(customers_out: int, customers_total: int) -> SeverityLevel:
    if customers_total <= 0:
        return SeverityLevel.info
    pct = customers_out / customers_total
    if pct >= 0.5 or customers_out >= 100000:
        return SeverityLevel.critical
    if pct >= 0.2 or customers_out >= 50000:
        return SeverityLevel.high
    if pct >= 0.05 or customers_out >= 10000:
        return SeverityLevel.medium
    if customers_out >= 1000:
        return SeverityLevel.low
    return SeverityLevel.info


class PowerOutagesWorker(FeedWorker):
    """US power outage data from PowerOutage.us API."""

    source_id = "power_outages"
    display_name = "US Power Outages"
    category = FeedCategory.energy
    refresh_interval = 900
    run_on_startup = False

    async def fetch(self) -> list[GeoEvent]:
        api_key = get_credential("POWEROUTAGE_API_KEY")
        if not api_key:
            logger.warning(
                "POWEROUTAGE_API_KEY not configured — PowerOutage.us requires a commercial API key, skipping"
            )
            return []

        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            try:
                resp = await client.get(
                    _POWER_OUTAGE_URL,
                    headers={
                        "User-Agent": "Meridian/1.0 (open-source situational awareness)",
                        "Authorization": f"Bearer {api_key}",
                    },
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (401, 403):
                    logger.info("PowerOutage.us API requires auth, returning empty")
                    return []
                raise
            except Exception:
                return []

        try:
            data = resp.json()
        except Exception:
            logger.warning("PowerOutage.us returned non-JSON response")
            return []

        # Data may be a list of county objects or nested under a key
        counties = data if isinstance(data, list) else data.get("counties", data.get("data", []))
        if not isinstance(counties, list):
            return []

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)

        for county in counties:
            try:
                customers_out = int(county.get("outage_count", 0) or county.get("CustomersOut", 0) or 0)
                if customers_out < 1000:
                    continue

                county_name = county.get("county_name", "") or county.get("CountyName", "")
                state_name = county.get("state_name", "") or county.get("StateName", "")
                customers_total = int(county.get("customer_count", 0) or county.get("CustomersTracked", 0) or 0)

                # Coordinates: try county data first, fall back to state centroid
                lat = county.get("lat") or county.get("latitude")
                lng = county.get("lng") or county.get("longitude")

                if lat is not None and lng is not None:
                    lat, lng = float(lat), float(lng)
                elif state_name in _STATE_COORDS:
                    lat, lng = _STATE_COORDS[state_name]
                    # Offset slightly based on county hash to avoid stacking
                    h = int(hashlib.md5(f"{state_name}_{county_name}".encode()).hexdigest(), 16)
                    lat += ((h % 200) - 100) / 100.0
                    lng += (((h >> 32) % 200) - 100) / 100.0
                else:
                    continue

                severity = _outage_severity(customers_out, customers_total)
                pct = (customers_out / customers_total * 100) if customers_total > 0 else 0

                event_id = f"power_{hashlib.md5(f'{state_name}_{county_name}'.encode()).hexdigest()[:12]}"
                events.append(GeoEvent(
                    id=event_id,
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="power_outage",
                    title=f"Power Outage: {county_name}, {state_name} — {customers_out:,} customers",
                    body=f"{customers_out:,} of {customers_total:,} customers without power ({pct:.1f}%)",
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=now,
                    metadata={
                        "county": county_name,
                        "state": state_name,
                        "customers_out": customers_out,
                        "customers_total": customers_total,
                        "outage_pct": round(pct, 2),
                    },
                ))
            except Exception:
                continue

        return events
