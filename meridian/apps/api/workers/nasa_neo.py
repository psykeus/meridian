"""NASA CNEOS — Near-Earth Objects close approach data."""
from datetime import datetime, timedelta, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_LAT, _LNG = 34.2, -118.2  # JPL Pasadena


class NASANEOWorker(FeedWorker):
    source_id = "nasa_neo"
    display_name = "NASA CNEOS — Near-Earth Objects"
    category = FeedCategory.space
    refresh_interval = 86400  # daily

    _URL = "https://ssd-api.jpl.nasa.gov/cad.api"

    async def fetch(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        date_min = now.strftime("%Y-%m-%d")
        date_max = (now + timedelta(days=30)).strftime("%Y-%m-%d")

        params = {
            "date-min": date_min,
            "date-max": date_max,
            "dist-max": "0.05",
            "sort": "dist",
            "limit": 50,
            "fullname": True,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(self._URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        fields = data.get("fields", [])
        idx = {f: i for i, f in enumerate(fields)}
        events: list[GeoEvent] = []

        for row in data.get("data", [])[:30]:
            try:
                des = row[idx["des"]]
                cd = row[idx["cd"]]
                dist = float(row[idx["dist"]])
                v_rel = row[idx.get("v_rel", idx.get("v_inf", 0))]
                fullname = row[idx.get("fullname", 0)] if "fullname" in idx else des

                severity = SeverityLevel.high if dist < 0.005 else SeverityLevel.medium if dist < 0.02 else SeverityLevel.low
                try:
                    event_time = datetime.strptime(cd.strip(), "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
                except Exception:
                    event_time = now

                dist_ld = dist * 389.17  # lunar distances

                events.append(GeoEvent(
                    id=f"neo_{des.replace(' ', '_')}_{cd[:10].replace(' ', '')}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=f"NEO Close Approach: {fullname or des} — {dist_ld:.1f} LD",
                    body=f"Object {des} will pass at {dist:.5f} AU ({dist_ld:.1f} lunar distances) on {cd}.",
                    lat=_LAT, lng=_LNG,
                    event_time=event_time.isoformat(),
                    url=f"https://cneos.jpl.nasa.gov/ca/",
                    metadata={"designation": des, "dist_au": dist, "dist_ld": round(dist_ld, 2), "close_approach": cd},
                ))
            except Exception:
                continue

        return events
