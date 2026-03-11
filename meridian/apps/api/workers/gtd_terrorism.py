"""Global Terrorism Database — notable terrorism incidents worldwide."""
import hashlib
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_GTD_API_URL = "https://www.start.umd.edu/gtd/api/results"

# Fallback: recent notable terrorism incidents with real coordinates
# Used when the GTD API is unavailable or requires authentication
_FALLBACK_INCIDENTS = [
    {
        "title": "Mogadishu Car Bombing",
        "location": "Mogadishu, Somalia",
        "lat": 2.0469,
        "lng": 45.3182,
        "fatalities": 100,
        "date": "2022-10-29",
        "type": "Bombing/Explosion",
        "group": "Al-Shabaab",
        "summary": "Massive car bombing at a busy intersection in Mogadishu killed over 100 people.",
    },
    {
        "title": "Kabul Airport Attack",
        "location": "Kabul, Afghanistan",
        "lat": 34.5553,
        "lng": 69.2075,
        "fatalities": 183,
        "date": "2021-08-26",
        "type": "Bombing/Explosion",
        "group": "ISIS-K",
        "summary": "Suicide bombing at Hamid Karzai International Airport during evacuation operations.",
    },
    {
        "title": "Christchurch Mosque Shootings",
        "location": "Christchurch, New Zealand",
        "lat": -43.5321,
        "lng": 172.6362,
        "fatalities": 51,
        "date": "2019-03-15",
        "type": "Armed Assault",
        "group": "Lone Actor",
        "summary": "Mass shooting targeting two mosques during Friday prayers.",
    },
    {
        "title": "Sri Lanka Easter Bombings",
        "location": "Colombo, Sri Lanka",
        "lat": 6.9271,
        "lng": 79.8612,
        "fatalities": 269,
        "date": "2019-04-21",
        "type": "Bombing/Explosion",
        "group": "National Thowheeth Jama'ath",
        "summary": "Coordinated suicide bombings at churches and hotels across Sri Lanka.",
    },
    {
        "title": "Burkina Faso Church Attack",
        "location": "Ouagadougou, Burkina Faso",
        "lat": 12.3714,
        "lng": -1.5197,
        "fatalities": 24,
        "date": "2019-12-01",
        "type": "Armed Assault",
        "group": "JNIM",
        "summary": "Armed militants attacked a church congregation in northern Burkina Faso.",
    },
    {
        "title": "Halle Synagogue Attack",
        "location": "Halle, Germany",
        "lat": 51.4969,
        "lng": 11.9688,
        "fatalities": 2,
        "date": "2019-10-09",
        "type": "Armed Assault",
        "group": "Lone Actor",
        "summary": "Far-right extremist attacked a synagogue on Yom Kippur.",
    },
    {
        "title": "Palma Attack",
        "location": "Palma, Mozambique",
        "lat": -10.7754,
        "lng": 40.4722,
        "fatalities": 50,
        "date": "2021-03-24",
        "type": "Armed Assault",
        "group": "ISIS-Mozambique",
        "summary": "Multi-day militant assault on the town of Palma, Cabo Delgado province.",
    },
    {
        "title": "Istanbul Nightclub Attack",
        "location": "Istanbul, Turkey",
        "lat": 41.0437,
        "lng": 28.9333,
        "fatalities": 39,
        "date": "2017-01-01",
        "type": "Armed Assault",
        "group": "ISIL",
        "summary": "Gunman opened fire at Reina nightclub on New Year's Eve celebration.",
    },
    {
        "title": "Jolo Cathedral Bombings",
        "location": "Jolo, Philippines",
        "lat": 6.0535,
        "lng": 121.0044,
        "fatalities": 23,
        "date": "2019-01-27",
        "type": "Bombing/Explosion",
        "group": "Abu Sayyaf",
        "summary": "Twin explosions targeted the Cathedral of Our Lady of Mount Carmel.",
    },
    {
        "title": "Niger Army Base Attacks",
        "location": "Tillabéri, Niger",
        "lat": 14.2119,
        "lng": 1.4531,
        "fatalities": 89,
        "date": "2020-01-09",
        "type": "Armed Assault",
        "group": "ISGS",
        "summary": "Militants attacked a military base in western Niger near the Mali border.",
    },
]


def _fatalities_to_severity(fatalities: int) -> SeverityLevel:
    if fatalities >= 50:
        return SeverityLevel.critical
    if fatalities >= 10:
        return SeverityLevel.high
    if fatalities >= 1:
        return SeverityLevel.medium
    return SeverityLevel.low


class GTDTerrorismWorker(FeedWorker):
    """Fetches notable terrorism incidents from the Global Terrorism Database.
    Falls back to a curated list of recent significant incidents when the
    API is unavailable."""

    source_id = "gtd_terrorism"
    display_name = "Global Terrorism Database"
    category = FeedCategory.military
    refresh_interval = 86400  # 24 hours

    async def fetch(self) -> list[GeoEvent]:
        events: list[GeoEvent] = []

        # Try the GTD API first
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    _GTD_API_URL,
                    params={"limit": 50, "startdate": "2020-01-01"},
                )
                resp.raise_for_status()
                data = resp.json()

            for record in data if isinstance(data, list) else data.get("data", []):
                try:
                    lat = float(record.get("latitude", 0))
                    lng = float(record.get("longitude", 0))
                    if lat == 0 and lng == 0:
                        continue

                    fatalities = int(record.get("nkill") or 0)
                    event_type = record.get("attacktype1_txt", "Unknown")
                    location = record.get("city", "") or record.get("provstate", "")
                    country = record.get("country_txt", "")
                    group = record.get("gname", "Unknown")
                    summary = record.get("summary", "") or ""
                    date_str = record.get("idate", "")
                    title_str = f"Terrorism: {event_type} — {location}, {country}"

                    try:
                        event_time = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(
                            tzinfo=timezone.utc
                        )
                    except (ValueError, TypeError):
                        event_time = datetime.now(timezone.utc)

                    event_id_raw = f"gtd_{record.get('eventid', '')}"
                    if not record.get("eventid"):
                        event_id_raw = f"gtd_{hashlib.md5(title_str.encode()).hexdigest()[:12]}"

                    events.append(
                        GeoEvent(
                            id=event_id_raw,
                            source_id=self.source_id,
                            category=self.category,
                            subcategory="terrorism",
                            title=title_str[:200],
                            body=summary[:500] or None,
                            severity=_fatalities_to_severity(fatalities),
                            lat=lat,
                            lng=lng,
                            event_time=event_time,
                            url=None,
                            metadata={
                                "attack_type": event_type,
                                "group": group,
                                "fatalities": fatalities,
                                "country": country,
                                "location": location,
                                "wounded": int(record.get("nwound") or 0),
                            },
                        )
                    )
                except Exception:
                    continue

            if events:
                return events
        except Exception:
            logger.debug("gtd_api_unavailable, using fallback incidents")

        # Fallback to hardcoded notable incidents
        for inc in _FALLBACK_INCIDENTS:
            fatalities = inc["fatalities"]
            event_id = hashlib.md5(
                f"gtd_{inc['title']}_{inc['date']}".encode()
            ).hexdigest()[:16]

            try:
                event_time = datetime.strptime(inc["date"], "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                )
            except (ValueError, TypeError):
                event_time = datetime.now(timezone.utc)

            events.append(
                GeoEvent(
                    id=f"gtd_{event_id}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="terrorism",
                    title=f"Terrorism: {inc['title']} — {inc['location']}",
                    body=inc["summary"],
                    severity=_fatalities_to_severity(fatalities),
                    lat=inc["lat"],
                    lng=inc["lng"],
                    event_time=event_time,
                    url=None,
                    metadata={
                        "attack_type": inc["type"],
                        "group": inc["group"],
                        "fatalities": fatalities,
                        "location": inc["location"],
                    },
                )
            )

        return events
