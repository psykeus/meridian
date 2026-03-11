"""ENTSO-E Transparency Platform — EU energy balance and generation mix."""
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_EU_LAT, _EU_LNG = 50.8503, 4.3517  # Brussels


class ENTSOEWorker(FeedWorker):
    source_id = "entso_e"
    display_name = "ENTSO-E — EU Energy Balance"
    category = FeedCategory.energy
    refresh_interval = 3600  # 1 hour

    async def fetch(self) -> list[GeoEvent]:
        import os
        api_key = os.getenv("ENTSO_E_API_KEY", "")
        if not api_key:
            return await self._fetch_summary()
        return await self._fetch_with_key(api_key)

    async def _fetch_summary(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        return [GeoEvent(
            id=f"entso_e_{now.strftime('%Y%m%d%H')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="ENTSO-E: EU Energy Transparency Platform",
            body="EU electricity generation and cross-border flows. Configure ENTSO_E_API_KEY for live generation mix data.",
            lat=_EU_LAT, lng=_EU_LNG,
            event_time=now.isoformat(),
            url="https://transparency.entsoe.eu/",
            metadata={"source": "entso_e_public"},
        )]

    async def _fetch_with_key(self, api_key: str) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        period_start = (now - timedelta(hours=2)).strftime("%Y%m%d%H%M")
        period_end = now.strftime("%Y%m%d%H%M")

        params = {
            "securityToken": api_key,
            "documentType": "A75",
            "processType": "A16",
            "in_Domain": "10Y1001A1001A83F",
            "periodStart": period_start,
            "periodEnd": period_end,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get("https://web-api.tp.entsoe.eu/api", params=params)
            if resp.status_code != 200:
                return await self._fetch_summary()

        return [GeoEvent(
            id=f"entso_e_{period_start}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="ENTSO-E: EU Actual Generation by Source",
            body=f"EU energy generation data for period {period_start}–{period_end}.",
            lat=_EU_LAT, lng=_EU_LNG,
            event_time=now.isoformat(),
            url="https://transparency.entsoe.eu/",
            metadata={"period_start": period_start, "period_end": period_end, "domain": "EU"},
        )]
