"""Airstrikes Derived — filters ACLED conflict data for explosive/remote violence events."""
import logging
from datetime import datetime, timedelta, timezone

import httpx

from core.config import get_settings
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_ACLED_URL = "https://api.acleddata.com/acled/read"

# ACLED event types that correspond to airstrikes/remote violence
_TARGET_EVENT_TYPES = {
    "Explosions/Remote violence",
}

# Sub-event types of particular interest
_AIRSTRIKE_SUBTYPES = {
    "Air/drone strike",
    "Shelling/artillery/missile attack",
    "Remote explosive/landmine/IED",
    "Suicide bomb",
}


def _fatalities_to_severity(fatalities: int, sub_event: str) -> SeverityLevel:
    """Determine severity from fatalities and sub-event type."""
    if fatalities >= 50:
        return SeverityLevel.critical
    if fatalities >= 10 or "Air/drone strike" in sub_event:
        return SeverityLevel.high
    if fatalities >= 1:
        return SeverityLevel.medium
    return SeverityLevel.low


class AirstrikesDerivedWorker(FeedWorker):
    """Derives airstrike and remote violence events from the ACLED conflict
    dataset, filtered specifically for 'Explosions/Remote violence' event types.

    This is a secondary/derived worker that re-queries ACLED with a focused
    filter on explosive events, producing events categorized under 'military'
    rather than 'geopolitical' (as the main ACLED worker does).

    Requires ACLED_API_KEY and ACLED_EMAIL credentials."""

    source_id = "airstrikes_derived"
    display_name = "Airstrikes & Remote Violence (ACLED)"
    category = FeedCategory.military
    refresh_interval = 3600  # 1 hour

    def __init__(self) -> None:
        self._settings = get_settings()

    async def fetch(self) -> list[GeoEvent]:
        if not self._settings.acled_api_key or not self._settings.acled_email:
            logger.debug("airstrikes_derived_skip: missing ACLED credentials")
            return []

        start_date = (datetime.now(timezone.utc) - timedelta(days=7)).strftime(
            "%Y-%m-%d"
        )
        params = {
            "key": self._settings.acled_api_key,
            "email": self._settings.acled_email,
            "event_date": start_date,
            "event_date_where": ">=",
            "event_type": "Explosions/Remote violence",
            "limit": 300,
            "fields": (
                "event_id_cnty|event_date|event_type|sub_event_type|actor1|actor2|"
                "country|admin1|location|latitude|longitude|fatalities|notes|source"
            ),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_ACLED_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for row in data.get("data", []):
            try:
                lat = float(row["latitude"])
                lng = float(row["longitude"])
            except (KeyError, ValueError, TypeError):
                continue

            # Skip (0,0) coords — invalid
            if lat == 0.0 and lng == 0.0:
                continue

            sub_event = row.get("sub_event_type", "")
            fatalities = int(row.get("fatalities") or 0)
            actor1 = row.get("actor1", "Unknown")
            actor2 = row.get("actor2", "")
            location = row.get("location", "")
            admin1 = row.get("admin1", "")
            country = row.get("country", "")
            notes = (row.get("notes") or "")[:500]

            # Determine the specific attack subtype
            subcategory = "remote_violence"
            if "Air/drone strike" in sub_event:
                subcategory = "airstrike"
            elif "Shelling" in sub_event or "artillery" in sub_event or "missile" in sub_event:
                subcategory = "shelling"
            elif "IED" in sub_event or "landmine" in sub_event:
                subcategory = "ied"
            elif "Suicide" in sub_event:
                subcategory = "suicide_attack"

            severity = _fatalities_to_severity(fatalities, sub_event)

            date_str = row.get("event_date", "")
            try:
                event_time = datetime.strptime(date_str, "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                event_time = datetime.now(timezone.utc)

            location_str = ", ".join(
                p for p in [location, admin1, country] if p
            )
            title = f"{sub_event}: {actor1} — {location_str}"
            if fatalities > 0:
                title = f"{sub_event} ({fatalities} killed): {actor1} — {location_str}"

            events.append(
                GeoEvent(
                    id=f"airstrike_{row.get('event_id_cnty', '')}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory=subcategory,
                    title=title[:200],
                    body=notes or None,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=None,
                    metadata={
                        "event_type": row.get("event_type", ""),
                        "sub_event_type": sub_event,
                        "actor1": actor1,
                        "actor2": actor2,
                        "country": country,
                        "admin1": admin1,
                        "location": location,
                        "fatalities": fatalities,
                        "source": row.get("source"),
                    },
                )
            )

        return events
