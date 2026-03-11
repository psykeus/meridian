import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

_TYPE_SEVERITY = {
    "Fire": SeverityLevel.high,
    "Flood": SeverityLevel.high,
    "Hurricane": SeverityLevel.critical,
    "Tornado": SeverityLevel.high,
    "Earthquake": SeverityLevel.high,
    "Tsunami": SeverityLevel.critical,
    "Severe Storm": SeverityLevel.medium,
    "Winter Storm": SeverityLevel.medium,
    "Drought": SeverityLevel.low,
}

_STATE_COORDS = {
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
    "AK": (61.4, -152.3), "HI": (20.3, -156.3),
}


class FEMAWorker(FeedWorker):
    """FEMA OpenFEMA — disaster declarations from the last 90 days."""

    source_id = "fema"
    display_name = "FEMA Disaster Declarations"
    category = FeedCategory.humanitarian
    refresh_interval = 86400  # daily

    _URL = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"

    async def fetch(self) -> List[GeoEvent]:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")

        params = {
            "$filter": f"declarationDate ge '{cutoff}'",
            "$orderby": "declarationDate desc",
            "$top": 100,
            "$format": "json",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(self._URL, params=params)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

        events: List[GeoEvent] = []
        for d in data.get("DisasterDeclarationsSummaries", []):
            try:
                disaster_num = d.get("disasterNumber", "")
                incident_type = d.get("incidentType", "")
                state = d.get("stateCode", "")
                title_str = d.get("declarationTitle", incident_type)
                date_str = d.get("declarationDate", "")

                lat, lng = _STATE_COORDS.get(state, (38.9, -77.0))
                severity = _TYPE_SEVERITY.get(incident_type, SeverityLevel.low)

                try:
                    event_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    event_time = datetime.now(timezone.utc)

                events.append(GeoEvent(
                    id=f"fema_{disaster_num}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"FEMA DR-{disaster_num}: {title_str} ({state})",
                    body=None,
                    lat=lat,
                    lng=lng,
                    event_time=event_time.isoformat(),
                    url=f"https://www.fema.gov/disaster/{disaster_num}",
                    metadata={"disaster_number": disaster_num, "incident_type": incident_type,
                               "state": state},
                ))
            except Exception:
                continue

        return events
