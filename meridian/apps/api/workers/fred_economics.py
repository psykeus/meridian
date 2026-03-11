"""FRED (St. Louis Fed) — US macroeconomic indicators."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_LAT, _LNG = 38.6273, -90.1979  # St. Louis

SERIES = [
    ("FEDFUNDS", "Fed Funds Rate"),
    ("T10Y2Y", "10Y-2Y Treasury Yield Spread"),
    ("UNRATE", "US Unemployment Rate"),
    ("CPIAUCSL", "US CPI (Inflation)"),
    ("GDP", "US GDP"),
]


class FREDWorker(FeedWorker):
    source_id = "fred"
    display_name = "FRED — US Macroeconomic Indicators"
    category = FeedCategory.finance
    refresh_interval = 86400  # daily

    _BASE = "https://api.stlouisfed.org/fred/series/observations"

    async def fetch(self) -> list[GeoEvent]:
        import os
        api_key = os.getenv("FRED_API_KEY", "")
        if not api_key:
            return []

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)

        async with httpx.AsyncClient(timeout=20) as client:
            for series_id, label in SERIES:
                try:
                    params = {
                        "series_id": series_id,
                        "api_key": api_key,
                        "file_type": "json",
                        "limit": 1,
                        "sort_order": "desc",
                    }
                    resp = await client.get(self._BASE, params=params)
                    if not resp.is_success:
                        continue
                    data = resp.json()
                    obs = data.get("observations", [])
                    if not obs:
                        continue
                    latest = obs[0]
                    value = latest.get("value", ".")
                    date = latest.get("date", "")
                    if value == ".":
                        continue

                    try:
                        event_time = datetime.fromisoformat(date) if date else now
                        event_time = event_time.replace(tzinfo=timezone.utc)
                    except Exception:
                        event_time = now

                    events.append(GeoEvent(
                        id=f"fred_{series_id}_{date}",
                        source_id=self.source_id,
                        category=self.category,
                        severity=SeverityLevel.low,
                        title=f"FRED: {label} — {value}",
                        body=f"{label}: {value} (as of {date})",
                        lat=_LAT, lng=_LNG,
                        event_time=event_time.isoformat(),
                        url=f"https://fred.stlouisfed.org/series/{series_id}",
                        metadata={"series_id": series_id, "value": value, "date": date},
                    ))
                except Exception:
                    continue

        return events
