"""FAA NOTAM — US airspace Notices to Air Missions (TFRs + NOTAMs)."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_BASE = "https://external-api.faa.gov/notamapi/v1/notams"


class FAANotamWorker(FeedWorker):
    source_id = "faa_notam"
    display_name = "FAA NOTAM — US Airspace Notices"
    category = FeedCategory.aviation
    refresh_interval = 1800  # 30 min

    async def fetch(self) -> list[GeoEvent]:
        params = {
            "notamType": "TFR",
            "pageSize": 50,
            "pageNum": 1,
            "sortBy": "startDate",
            "sortOrder": "Desc",
        }
        headers = {}
        import os
        client_id = os.getenv("FAA_CLIENT_ID", "")
        client_secret = os.getenv("FAA_CLIENT_SECRET", "")
        if client_id and client_secret:
            headers["client_id"] = client_id
            headers["client_secret"] = client_secret

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(_BASE, params=params, headers=headers)
            if resp.status_code in (401, 403):
                return self._placeholder()
            if not resp.is_success:
                return []
            data = resp.json()

        events: list[GeoEvent] = []
        for item in data.get("items", [])[:30]:
            props = item.get("properties", {}) or item
            notam_id = props.get("coreNOTAMData", {}).get("notam", {}).get("id", "") if "coreNOTAMData" in props else props.get("id", "")
            text = props.get("coreNOTAMData", {}).get("notam", {}).get("text", "") if "coreNOTAMData" in props else props.get("notamText", "")
            start = props.get("coreNOTAMData", {}).get("notam", {}).get("startDate", "") if "coreNOTAMData" in props else props.get("startDate", "")
            coords = item.get("geometry", {}).get("coordinates", [])

            lat, lng = 38.9, -77.0
            if coords and len(coords) == 2:
                try:
                    lng, lat = float(coords[0]), float(coords[1])
                except (TypeError, ValueError):
                    pass

            try:
                event_time = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else datetime.now(timezone.utc)
            except Exception:
                event_time = datetime.now(timezone.utc)

            events.append(GeoEvent(
                id=f"notam_{notam_id or abs(hash(text[:40]))}",
                source_id=self.source_id,
                category=self.category,
                severity=SeverityLevel.medium,
                title=f"TFR: {text[:80]}…" if len(text) > 80 else f"TFR: {text}",
                body=text[:300] if text else None,
                lat=lat, lng=lng,
                event_time=event_time.isoformat(),
                url="https://tfr.faa.gov/tfr2/list.jsp",
                metadata={"notam_id": notam_id, "type": "TFR"},
            ))
        return events

    def _placeholder(self) -> list[GeoEvent]:
        return [GeoEvent(
            id=f"notam_status_{datetime.now(timezone.utc).strftime('%Y%m%d')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="FAA NOTAM: US Airspace TFR Feed",
            body="Configure FAA_CLIENT_ID and FAA_CLIENT_SECRET for live TFR data.",
            lat=38.9, lng=-77.0,
            event_time=datetime.now(timezone.utc).isoformat(),
            url="https://tfr.faa.gov/",
            metadata={"source": "faa_notam_placeholder"},
        )]
