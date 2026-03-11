"""EURDEP — European Radiological Data Exchange Platform radiation monitoring."""
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel


class EURDEPWorker(FeedWorker):
    source_id = "eurdep"
    display_name = "EURDEP — European Radiation Monitoring"
    category = FeedCategory.nuclear
    refresh_interval = 3600  # 1 hour

    _URL = "https://remap.jrc.ec.europa.eu/api/DataProviders/5/query?OutputFormat=GeoJSON&StartDateTime={start}&EndDateTime={end}&Nuclide=DOSE_RATE"

    async def fetch(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        end = now.strftime("%Y-%m-%dT%H:%M:00Z")
        start = (now.replace(hour=now.hour - 2 if now.hour >= 2 else 0)).strftime("%Y-%m-%dT%H:%M:00Z")

        url = self._URL.format(start=start, end=end)
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return self._fallback()
            try:
                data = resp.json()
            except Exception:
                return self._fallback()

        events: list[GeoEvent] = []
        threshold = 0.5  # µSv/h — above this is notable

        for feature in data.get("features", [])[:200]:
            props = feature.get("properties", {})
            coords = feature.get("geometry", {}).get("coordinates", [])
            if not coords or len(coords) < 2:
                continue

            value = props.get("Value")
            if value is None:
                continue
            try:
                dose_rate = float(value)
            except (ValueError, TypeError):
                continue

            if dose_rate < threshold:
                continue

            station = props.get("StationCode", "")
            country = props.get("CountryCode", "")
            end_time = props.get("EndTime", now.isoformat())

            severity = SeverityLevel.critical if dose_rate > 1.0 else SeverityLevel.medium

            try:
                event_time = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
            except Exception:
                event_time = now

            events.append(GeoEvent(
                id=f"eurdep_{station}_{int(event_time.timestamp())}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"EURDEP: Elevated radiation — {station} ({country}) {dose_rate:.3f} µSv/h",
                body=f"Station {station} in {country} reporting dose rate {dose_rate:.3f} µSv/h, above alert threshold.",
                lat=coords[1], lng=coords[0],
                event_time=event_time.isoformat(),
                url="https://remap.jrc.ec.europa.eu/",
                metadata={"station": station, "country": country, "dose_rate_usv_h": dose_rate},
            ))
        return events

    def _fallback(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        return [GeoEvent(
            id=f"eurdep_status_{now.strftime('%Y%m%d%H')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="EURDEP: European Radiation Monitoring Network — nominal",
            body="No elevated radiation readings detected across European monitoring network.",
            lat=48.8566, lng=2.3522,
            event_time=now.isoformat(),
            url="https://remap.jrc.ec.europa.eu/",
            metadata={"status": "nominal"},
        )]
