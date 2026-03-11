"""The Space Devs Launch Library 2 — upcoming rocket launches worldwide."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel


class SpaceDevsWorker(FeedWorker):
    source_id = "space_devs"
    display_name = "Space Devs — Global Rocket Launches"
    category = FeedCategory.space
    refresh_interval = 3600

    _URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/"

    async def fetch(self) -> list[GeoEvent]:
        params = {"limit": 20, "format": "json", "ordering": "net"}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(self._URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []
        for launch in data.get("results", []):
            launch_id = launch.get("id", "")
            name = launch.get("name", "Unknown")
            net = launch.get("net", "")
            status = launch.get("status", {}).get("abbrev", "")
            pad = launch.get("pad", {})
            lat = pad.get("latitude")
            lng = pad.get("longitude")
            pad_name = pad.get("name", "")
            lsp = launch.get("launch_service_provider", {}).get("name", "")
            rocket = launch.get("rocket", {}).get("configuration", {}).get("name", "")
            mission = launch.get("mission")
            mission_desc = mission.get("description", "") if mission else ""
            url = launch.get("url", "")

            try:
                lat = float(lat)
                lng = float(lng)
            except (TypeError, ValueError):
                lat, lng = 28.5728, -80.6490

            try:
                event_time = datetime.fromisoformat(net.replace("Z", "+00:00"))
            except Exception:
                event_time = datetime.now(timezone.utc)

            severity = SeverityLevel.medium if status in ("Go", "TBD") else SeverityLevel.low

            events.append(GeoEvent(
                id=f"launch_{launch_id}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"🚀 {name}",
                body=f"{lsp} · {rocket} · Pad: {pad_name}" + (f" — {mission_desc[:150]}" if mission_desc else ""),
                lat=lat, lng=lng,
                event_time=event_time.isoformat(),
                url=url or "https://thespacedevs.com/",
                metadata={"launch_id": launch_id, "status": status, "provider": lsp, "rocket": rocket, "pad": pad_name},
            ))
        return events
