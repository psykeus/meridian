"""RainViewer — global weather radar tile overlay metadata."""

import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_API_URL = "https://api.rainviewer.com/public/weather-maps.json"

# Center of continental US — default coords for radar metadata events
_DEFAULT_LAT = 39.8
_DEFAULT_LNG = -98.6


class RainViewerRadarWorker(FeedWorker):
    """Fetches global weather radar tile overlay metadata from RainViewer.

    Unlike most workers, RainViewer provides tile overlay URLs rather than
    discrete point events.  Each fetch produces a GeoEvent per active radar
    frame whose metadata contains the tile URL template the frontend can
    render as a map layer.
    """

    source_id = "rainviewer_radar"
    display_name = "RainViewer Weather Radar"
    category = FeedCategory.environment
    refresh_interval = 300  # 5 minutes

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(_API_URL)
            resp.raise_for_status()
            data = resp.json()

        events: list[GeoEvent] = []

        version = data.get("version", "")
        generated = data.get("generated", 0)
        host = data.get("host", "")

        # ── Radar frames ────────────────────────────────────────────────
        radar = data.get("radar", {})
        past_frames = radar.get("past", [])
        nowcast_frames = radar.get("nowcast", [])

        all_frames = []
        for frame in past_frames:
            all_frames.append(("past", frame))
        for frame in nowcast_frames:
            all_frames.append(("nowcast", frame))

        for frame_type, frame in all_frames:
            ts = frame.get("time", 0)
            path = frame.get("path", "")
            if not ts or not path:
                continue

            event_time = datetime.fromtimestamp(ts, tz=timezone.utc)

            # Construct tile URL template (standard {z}/{x}/{y} format)
            # RainViewer tile URL: {host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png
            tile_url = f"{host}{path}/256/{{z}}/{{x}}/{{y}}/2/1_1.png"

            title = (
                f"Weather Radar — {frame_type.title()} Frame "
                f"{event_time.strftime('%H:%M UTC')}"
            )
            body = (
                f"RainViewer {frame_type} radar frame at "
                f"{event_time.strftime('%Y-%m-%d %H:%M UTC')}. "
                f"Tile overlay available for map rendering."
            )

            events.append(
                GeoEvent(
                    id=f"rainviewer_{frame_type}_{ts}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="weather_radar",
                    title=title,
                    body=body,
                    severity=SeverityLevel.info,
                    lat=_DEFAULT_LAT,
                    lng=_DEFAULT_LNG,
                    event_time=event_time,
                    url="https://www.rainviewer.com/",
                    metadata={
                        "frame_type": frame_type,
                        "tile_url": tile_url,
                        "tile_path": path,
                        "host": host,
                        "timestamp": ts,
                        "version": version,
                        "generated": generated,
                    },
                )
            )

        # ── Satellite / infrared coverage (if present) ──────────────────
        satellite = data.get("satellite", {})
        infrared_frames = satellite.get("infrared", [])

        if infrared_frames:
            # Use the most recent infrared frame as a coverage indicator
            latest_ir = infrared_frames[-1]
            ir_ts = latest_ir.get("time", 0)
            ir_path = latest_ir.get("path", "")
            if ir_ts and ir_path:
                ir_event_time = datetime.fromtimestamp(ir_ts, tz=timezone.utc)
                ir_tile_url = f"{host}{ir_path}/256/{{z}}/{{x}}/{{y}}/0/0_0.png"

                events.append(
                    GeoEvent(
                        id=f"rainviewer_ir_{ir_ts}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="satellite_infrared",
                        title=f"Satellite IR — {ir_event_time.strftime('%H:%M UTC')}",
                        body=(
                            f"RainViewer infrared satellite imagery at "
                            f"{ir_event_time.strftime('%Y-%m-%d %H:%M UTC')}."
                        ),
                        severity=SeverityLevel.info,
                        lat=_DEFAULT_LAT,
                        lng=_DEFAULT_LNG,
                        event_time=ir_event_time,
                        url="https://www.rainviewer.com/",
                        metadata={
                            "frame_type": "infrared",
                            "tile_url": ir_tile_url,
                            "tile_path": ir_path,
                            "host": host,
                            "timestamp": ir_ts,
                            "total_ir_frames": len(infrared_frames),
                        },
                    )
                )

        return events
