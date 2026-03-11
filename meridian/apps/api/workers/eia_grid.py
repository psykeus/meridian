"""EIA Grid Monitor — US electric grid status and generation mix."""
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_GRID_LAT, _GRID_LNG = 38.9072, -77.0369


class EIAGridWorker(FeedWorker):
    source_id = "eia_grid"
    display_name = "EIA Grid Monitor — US Power Grid"
    category = FeedCategory.energy
    refresh_interval = 3600  # 1 hour

    _BASE = "https://api.eia.gov/v2"

    async def fetch(self) -> list[GeoEvent]:
        import os
        api_key = os.getenv("EIA_API_KEY", "")
        if not api_key:
            return await self._fetch_public()
        return await self._fetch_with_key(api_key)

    async def _fetch_public(self) -> list[GeoEvent]:
        url = "https://www.eia.gov/electricity/gridmonitor/knownissues/xls/Grid_Monitor_Status.xlsx"
        now = datetime.now(timezone.utc)
        return [GeoEvent(
            id=f"eia_grid_{now.strftime('%Y%m%d%H')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="EIA Grid Monitor: US Power Grid Status",
            body="Live US electric grid generation data from EIA. Configure EIA_API_KEY for detailed generation mix.",
            lat=_GRID_LAT, lng=_GRID_LNG,
            event_time=now.isoformat(),
            url="https://www.eia.gov/electricity/gridmonitor/",
            metadata={"source": "eia_public"},
        )]

    async def _fetch_with_key(self, api_key: str) -> list[GeoEvent]:
        params = {
            "api_key": api_key,
            "frequency": "hourly",
            "data[0]": "value",
            "facets[type][]": "D",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 10,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{self._BASE}/electricity/rto/region-data/data/", params=params)
            if resp.status_code != 200:
                return []
            data = resp.json()

        events: list[GeoEvent] = []
        seen_periods: set[str] = set()
        for row in data.get("response", {}).get("data", [])[:20]:
            period = row.get("period", "")
            respondent = row.get("respondent", "")
            type_name = row.get("type-name", "")
            value = row.get("value")
            if period in seen_periods:
                continue
            seen_periods.add(period)
            try:
                event_time = datetime.fromisoformat(period.replace("T", " ")).replace(tzinfo=timezone.utc)
            except Exception:
                event_time = datetime.now(timezone.utc)
            events.append(GeoEvent(
                id=f"eia_{respondent}_{period}",
                source_id=self.source_id,
                category=self.category,
                severity=SeverityLevel.low,
                title=f"EIA Grid: {respondent} — {type_name}",
                body=f"Demand: {value} MWh" if value else None,
                lat=_GRID_LAT, lng=_GRID_LNG,
                event_time=event_time.isoformat(),
                url="https://www.eia.gov/electricity/gridmonitor/",
                metadata={"respondent": respondent, "type": type_name, "value": value, "period": period},
            ))
        return events
