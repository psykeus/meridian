"""OpenSanctions.org — active international sanctions across all jurisdictions."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_LAT, _LNG = 52.52, 13.405  # Berlin — OpenSanctions HQ


class OpenSanctionsWorker(FeedWorker):
    source_id = "open_sanctions"
    display_name = "OpenSanctions — Global Sanctions Database"
    category = FeedCategory.geopolitical
    refresh_interval = 86400  # daily

    _URL = "https://api.opensanctions.org/search/default"

    async def fetch(self) -> list[GeoEvent]:
        params = {"q": "sanctioned", "limit": 50, "schema": "LegalEntity", "topics": "sanction"}
        headers = {}
        import os
        api_key = os.getenv("OPENSANCTIONS_API_KEY", "")
        if api_key:
            headers["Authorization"] = f"ApiKey {api_key}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(self._URL, params=params, headers=headers)
            if resp.status_code == 403:
                return self._summary_event()
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)
        for result in data.get("results", [])[:30]:
            entity_id = result.get("id", "")
            caption = result.get("caption", "")
            schema = result.get("schema", "")
            props = result.get("properties", {})
            countries = props.get("country", [])
            programs = props.get("program", [])

            lat, lng = _LAT, _LNG
            if countries:
                from ._country_coords import COUNTRY_COORDS
                cc = countries[0].lower() if countries else ""
                coords = COUNTRY_COORDS.get(cc)
                if coords:
                    lat, lng = coords

            events.append(GeoEvent(
                id=f"sanctions_{entity_id}",
                source_id=self.source_id,
                category=self.category,
                severity=SeverityLevel.medium,
                title=f"Sanctions: {caption} ({schema})",
                body=f"Programs: {', '.join(programs[:3])}" if programs else f"Entity under active international sanctions.",
                lat=lat, lng=lng,
                event_time=now.isoformat(),
                url=f"https://www.opensanctions.org/entities/{entity_id}/",
                metadata={"entity_id": entity_id, "countries": countries, "programs": programs[:5]},
            ))
        return events or self._summary_event()

    def _summary_event(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        return [GeoEvent(
            id=f"sanctions_status_{now.strftime('%Y%m%d')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="OpenSanctions: Active international sanctions database",
            body="Tracking US OFAC, EU, UN, and multi-jurisdictional sanctions. Configure OPENSANCTIONS_API_KEY for full entity data.",
            lat=_LAT, lng=_LNG,
            event_time=now.isoformat(),
            url="https://www.opensanctions.org/",
            metadata={"source": "opensanctions"},
        )]
