"""UNHCR — UN Refugee Agency displacement data and population statistics."""
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_SITUATIONS_URL = "https://data.unhcr.org/api/situations"


def _population_to_severity(population: int) -> SeverityLevel:
    if population >= 1_000_000:
        return SeverityLevel.critical
    if population >= 500_000:
        return SeverityLevel.high
    if population >= 100_000:
        return SeverityLevel.medium
    if population >= 10_000:
        return SeverityLevel.low
    return SeverityLevel.info


class UNHCRDisplacementWorker(FeedWorker):
    source_id = "unhcr_displacement"
    display_name = "UNHCR Displacement Data"
    category = FeedCategory.humanitarian
    refresh_interval = 86400  # daily

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(_SITUATIONS_URL)
                if resp.status_code in (401, 403, 404):
                    logger.warning("unhcr_api_failed", extra={"status": resp.status_code})
                    return []
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                logger.warning("unhcr_fetch_failed", extra={"error": str(exc)})
                return []

        events: list[GeoEvent] = []
        items = data if isinstance(data, list) else data.get("data", data.get("items", []))

        for item in items[:100]:
            try:
                situation_id = item.get("id") or item.get("situation_id", "")
                name = item.get("name") or item.get("title", "Unknown situation")
                description = item.get("description") or item.get("summary", "")
                population = int(item.get("population", 0) or item.get("persons_of_concern", 0) or 0)

                # Try to extract country from item
                country_code = (
                    item.get("country_code", "")
                    or item.get("iso3", "")
                    or item.get("country", {}).get("iso", "")
                    if isinstance(item.get("country"), dict)
                    else item.get("country_code", "")
                )
                country_code = country_code.lower()[:2] if country_code else ""

                # Geocode using country coords
                lat, lng = COUNTRY_COORDS.get(country_code, (0.0, 0.0))

                # If no country code match, try geo fields directly
                if lat == 0.0 and lng == 0.0:
                    lat = float(item.get("lat", 0.0) or item.get("latitude", 0.0) or 0.0)
                    lng = float(item.get("lon", 0.0) or item.get("lng", 0.0) or item.get("longitude", 0.0) or 0.0)

                # Skip if we have no usable coordinates
                if lat == 0.0 and lng == 0.0:
                    # Try matching country name against COUNTRY_COORDS keys as fallback
                    name_lower = name.lower()
                    for code, coords in COUNTRY_COORDS.items():
                        if code in name_lower:
                            lat, lng = coords
                            break

                # Parse date
                date_str = item.get("updated_at") or item.get("date") or item.get("created_at", "")
                try:
                    event_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    event_time = datetime.now(timezone.utc)

                severity = _population_to_severity(population)

                body_parts = []
                if description:
                    body_parts.append(description[:300])
                if population > 0:
                    body_parts.append(f"Persons of concern: {population:,}")

                events.append(GeoEvent(
                    id=f"unhcr_{situation_id}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="displacement",
                    title=f"UNHCR: {name}",
                    body=" | ".join(body_parts) if body_parts else None,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=f"https://data.unhcr.org/en/situations/{situation_id}" if situation_id else None,
                    metadata={
                        "situation_id": str(situation_id),
                        "population": population,
                        "country_code": country_code,
                    },
                ))
            except Exception:
                continue

        return events
