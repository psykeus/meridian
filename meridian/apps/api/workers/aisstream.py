"""AISStream.io WebSocket worker — real-time AIS vessel tracking via buffered WebSocket."""
import asyncio
import collections
import hashlib
import json
import logging
from datetime import datetime, timezone

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from core.credential_store import get_credential
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

# AIS ship type codes → human-readable categories
_SHIP_TYPE_MAP = {
    range(20, 30): "Wing in Ground",
    range(30, 36): "Fishing",
    range(36, 40): "Towing/Dredging",
    range(40, 50): "High-Speed Craft",
    range(50, 55): "Special Craft",
    range(60, 70): "Passenger",
    range(70, 80): "Cargo",
    range(80, 90): "Tanker",
    range(90, 100): "Other",
}


def _ship_type_label(code: int) -> str:
    for r, label in _SHIP_TYPE_MAP.items():
        if code in r:
            return label
    return f"Type {code}" if code else "Unknown"


class AISStreamWorker(FeedWorker):
    """Real-time AIS vessel positions from AISStream.io WebSocket API.

    Uses a buffered approach: a background asyncio task connects to the
    WebSocket and fills a deque buffer. The periodic fetch() drains the
    buffer, deduplicates by MMSI, and returns GeoEvents.

    Subscribes to PositionReport, StandardClassBPositionReport, and
    ShipStaticData message types for comprehensive vessel tracking.
    """

    source_id = "aisstream"
    display_name = "AISStream Live Vessels"
    category = FeedCategory.maritime
    refresh_interval = 10  # drain buffer every 10s
    run_on_startup = False

    def __init__(self) -> None:
        self._buffer: collections.deque = collections.deque(maxlen=5000)
        self._ws_task: asyncio.Task | None = None
        self._backoff = 2
        # Static data cache: MMSI → {imo, callsign, ship_type, destination, dimensions}
        self._static_cache: dict[str, dict] = {}

    async def _ws_loop(self) -> None:
        """Background WebSocket listener with exponential backoff reconnect."""
        try:
            import websockets
        except ImportError:
            logger.error("websockets package not installed — AISStream disabled")
            return

        while True:
            api_key = get_credential("AISSTREAM_API_KEY")
            if not api_key:
                logger.warning("AISSTREAM_API_KEY not configured — sleeping 60s")
                await asyncio.sleep(60)
                continue

            try:
                async with websockets.connect(
                    "wss://stream.aisstream.io/v0/stream",
                    ping_interval=30,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    subscribe_msg = json.dumps({
                        "APIKey": api_key,
                        "BoundingBoxes": [[[-90, -180], [90, 180]]],
                        "FilterMessageTypes": [
                            "PositionReport",
                            "StandardClassBPositionReport",
                            "ShipStaticData",
                        ],
                    })
                    await ws.send(subscribe_msg)
                    logger.info("aisstream_connected")
                    self._backoff = 2  # reset on successful connect

                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            msg_type = msg.get("MessageType", "")
                            meta = msg.get("MetaData", {})
                            message = msg.get("Message", {})

                            mmsi = str(meta.get("MMSI", ""))
                            if not mmsi:
                                continue

                            # Handle ShipStaticData — cache static info
                            if msg_type == "ShipStaticData":
                                static = message.get("ShipStaticData", {})
                                if static:
                                    self._static_cache[mmsi] = {
                                        "imo": static.get("ImoNumber", 0),
                                        "callsign": (static.get("CallSign") or "").strip(),
                                        "ship_type": static.get("Type", 0),
                                        "destination": (static.get("Destination") or "").strip(),
                                        "dimension_a": static.get("Dimension", {}).get("A", 0),
                                        "dimension_b": static.get("Dimension", {}).get("B", 0),
                                        "dimension_c": static.get("Dimension", {}).get("C", 0),
                                        "dimension_d": static.get("Dimension", {}).get("D", 0),
                                        "draught": static.get("MaximumStaticDraught", 0),
                                    }
                                continue

                            # Handle PositionReport and StandardClassBPositionReport
                            position = (
                                message.get("PositionReport")
                                or message.get("StandardClassBPositionReport")
                            )
                            if not position:
                                continue

                            lat = position.get("Latitude")
                            lng = position.get("Longitude")
                            if lat is None or lng is None:
                                continue
                            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                                continue

                            self._buffer.append({
                                "mmsi": mmsi,
                                "name": (meta.get("ShipName") or "").strip(),
                                "lat": lat,
                                "lng": lng,
                                "sog": position.get("Sog", 0),
                                "cog": position.get("Cog", 0),
                                "heading": position.get("TrueHeading", 0),
                                "nav_status": position.get("NavigationalStatus", 0),
                                "time": meta.get("time_utc", datetime.now(timezone.utc).isoformat()),
                            })
                        except Exception:
                            continue

            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.warning(f"aisstream_ws_error: {exc}, reconnecting in {self._backoff}s")
                await asyncio.sleep(self._backoff)
                self._backoff = min(self._backoff * 2, 60)

    async def fetch(self) -> list[GeoEvent]:
        # Lazily start the WebSocket background task
        if self._ws_task is None or self._ws_task.done():
            self._ws_task = asyncio.create_task(self._ws_loop())

        # Drain buffer and deduplicate by MMSI (keep latest)
        latest: dict[str, dict] = {}
        while self._buffer:
            entry = self._buffer.popleft()
            latest[entry["mmsi"]] = entry

        if not latest:
            return []

        now = datetime.now(timezone.utc)
        hour_hash = now.strftime("%Y%m%d%H")
        events: list[GeoEvent] = []

        nav_status_map = {
            0: "Under way using engine",
            1: "At anchor",
            2: "Not under command",
            3: "Restricted manoeuvrability",
            4: "Constrained by draught",
            5: "Moored",
            6: "Aground",
            7: "Engaged in fishing",
            8: "Under way sailing",
            9: "Reserved (HSC)",
            10: "Reserved (WIG)",
            14: "AIS-SART active",
        }

        for mmsi, data in list(latest.items())[:500]:
            try:
                event_time = datetime.fromisoformat(
                    data["time"].replace("Z", "+00:00")
                ) if isinstance(data["time"], str) else now
            except Exception:
                event_time = now

            nav_str = nav_status_map.get(data["nav_status"], str(data["nav_status"]))
            eid = f"aisstream_{mmsi}_{hashlib.md5(f'{mmsi}{hour_hash}'.encode()).hexdigest()[:8]}"
            ship_name = data["name"] or f"MMSI {mmsi}"

            # Merge in static data if available
            static = self._static_cache.get(mmsi, {})
            ship_type_code = static.get("ship_type", 0)
            ship_type_label = _ship_type_label(ship_type_code) if ship_type_code else ""
            imo = static.get("imo", 0)
            callsign = static.get("callsign", "")
            destination = static.get("destination", "")
            length = static.get("dimension_a", 0) + static.get("dimension_b", 0)
            beam = static.get("dimension_c", 0) + static.get("dimension_d", 0)

            body_parts = [f"SOG: {data['sog']:.1f} kn, COG: {data['cog']:.0f}\u00b0"]
            if ship_type_label:
                body_parts.append(f"Type: {ship_type_label}")
            if destination:
                body_parts.append(f"Dest: {destination}")

            metadata: dict = {
                "mmsi": mmsi,
                "ship_name": ship_name,
                "sog_kn": round(data["sog"], 1),
                "cog_deg": round(data["cog"], 0),
                "heading": data["heading"],
                "nav_status": nav_str,
            }
            if imo:
                metadata["imo"] = imo
            if callsign:
                metadata["callsign"] = callsign
            if ship_type_label:
                metadata["ship_type"] = ship_type_label
            if destination:
                metadata["destination"] = destination
            if length > 0:
                metadata["length_m"] = length
            if beam > 0:
                metadata["beam_m"] = beam

            events.append(GeoEvent(
                id=eid,
                source_id=self.source_id,
                category=FeedCategory.maritime,
                severity=SeverityLevel.info,
                title=f"{ship_name} ({mmsi})",
                body=" | ".join(body_parts),
                lat=data["lat"],
                lng=data["lng"],
                event_time=event_time,
                metadata=metadata,
            ))

        # Cap static cache to prevent unbounded growth
        if len(self._static_cache) > 10000:
            to_keep = set(latest.keys())
            self._static_cache = {k: v for k, v in self._static_cache.items() if k in to_keep}

        return events
