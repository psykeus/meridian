from datetime import datetime, timedelta, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

ACLED_URL = "https://api.acleddata.com/acled/read"

_EVENT_TYPE_SEVERITY: dict[str, SeverityLevel] = {
    "Battles": SeverityLevel.high,
    "Explosions/Remote violence": SeverityLevel.high,
    "Violence against civilians": SeverityLevel.high,
    "Protests": SeverityLevel.low,
    "Riots": SeverityLevel.medium,
    "Strategic developments": SeverityLevel.low,
}


class ACLEDConflictWorker(FeedWorker):
    source_id = "acled_conflicts"
    display_name = "ACLED Armed Conflict Events"
    category = FeedCategory.geopolitical
    refresh_interval = 3600

    async def fetch(self) -> list[GeoEvent]:
        acled_key = get_credential("ACLED_API_KEY")
        acled_email = get_credential("ACLED_EMAIL")
        if not acled_key or not acled_email:
            return []

        start_date = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")
        params = {
            "key": acled_key,
            "email": acled_email,
            "event_date": start_date,
            "event_date_where": ">=",
            "limit": 500,
            "fields": "event_id_cnty|event_date|event_type|sub_event_type|actor1|actor2|country|location|latitude|longitude|fatalities|notes|source|timestamp",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(ACLED_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for row in data.get("data", []):
            try:
                lat = float(row["latitude"])
                lng = float(row["longitude"])
            except (KeyError, ValueError, TypeError):
                continue

            event_type = row.get("event_type", "Unknown")
            sub_event = row.get("sub_event_type", "")
            fatalities = int(row.get("fatalities") or 0)
            actor1 = row.get("actor1", "Unknown actor")
            location = row.get("location", "")
            country = row.get("country", "")

            severity = _EVENT_TYPE_SEVERITY.get(event_type, SeverityLevel.info)
            if fatalities >= 50:
                severity = SeverityLevel.critical
            elif fatalities >= 10:
                severity = SeverityLevel.high

            date_str = row.get("event_date", "")
            try:
                event_time = datetime.strptime(date_str, "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                event_time = datetime.now(timezone.utc)

            title = f"{event_type} — {location}, {country}"
            if actor1 and actor1 != "Unknown actor":
                title = f"{event_type}: {actor1} — {location}, {country}"

            events.append(
                GeoEvent(
                    id=f"acled_{row.get('event_id_cnty', '')}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory=sub_event.lower().replace("/", "_").replace(" ", "_"),
                    title=title,
                    body=(row.get("notes") or "")[:500],
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    metadata={
                        "event_type": event_type,
                        "sub_event_type": sub_event,
                        "actor1": actor1,
                        "actor2": row.get("actor2"),
                        "country": country,
                        "location": location,
                        "fatalities": fatalities,
                        "source": row.get("source"),
                    },
                    url=None,
                    event_time=event_time,
                )
            )

        return events
