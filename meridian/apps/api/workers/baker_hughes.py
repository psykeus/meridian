"""Baker Hughes — weekly North American oil and gas rig count."""
import csv
import io
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_LAT, _LNG = 29.76, -95.37  # Houston


class BakerHughesWorker(FeedWorker):
    source_id = "baker_hughes"
    display_name = "Baker Hughes — Rig Count"
    category = FeedCategory.finance
    refresh_interval = 604800  # weekly

    _URL = "https://rigcount.bakerhughes.com/static-files/north-america-rotary-rig-count-current"

    async def fetch(self) -> list[GeoEvent]:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; Meridian/1.0)"}
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(self._URL, headers=headers)
            if not resp.is_success:
                return self._summary()

        now = datetime.now(timezone.utc)
        lines = resp.text.splitlines()
        total_us = total_canada = 0
        week_date = ""
        for line in lines[:50]:
            parts = line.split(",")
            if len(parts) >= 3 and "United States" in parts[0]:
                try:
                    total_us = int(parts[-1].strip())
                    week_date = parts[1].strip() if len(parts) > 1 else ""
                except (ValueError, IndexError):
                    pass
            if len(parts) >= 3 and "Canada" in parts[0]:
                try:
                    total_canada = int(parts[-1].strip())
                except (ValueError, IndexError):
                    pass

        if not total_us:
            return self._summary()

        return [GeoEvent(
            id=f"rig_count_{now.strftime('%Y%W')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title=f"Baker Hughes Rig Count: US {total_us} · Canada {total_canada}",
            body=f"North America rotary rig count for week of {week_date}. US: {total_us} rigs, Canada: {total_canada} rigs.",
            lat=_LAT, lng=_LNG,
            event_time=now.isoformat(),
            url="https://rigcount.bakerhughes.com/",
            metadata={"us_rigs": total_us, "canada_rigs": total_canada, "week": week_date},
        )]

    def _summary(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        return [GeoEvent(
            id=f"rig_count_summary_{now.strftime('%Y%W')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="Baker Hughes: North American Rig Count",
            body="Weekly North American oil and gas rotary rig count from Baker Hughes.",
            lat=_LAT, lng=_LNG,
            event_time=now.isoformat(),
            url="https://rigcount.bakerhughes.com/",
            metadata={"source": "baker_hughes"},
        )]
