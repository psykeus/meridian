import httpx
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

_NAVAL_MMSI_PREFIXES = {
    "235": ("GBR", "Royal Navy"),
    "338": ("USA", "US Navy"),
    "271": ("TUR", "Turkish Navy"),
    "275": ("LVA", "Latvian Navy"),
    "316": ("CAN", "Royal Canadian Navy"),
    "367": ("USA", "USCG"),
    "431": ("JPN", "JMSDF"),
    "477": ("CHN", "PLAN"),
    "636": ("LBR", "Liberian-flagged"),
}

_SHIP_TYPE_LABEL = {
    "0": "Unknown", "1": "Reserved", "2": "WIG",
    "30": "Fishing", "31": "Towing", "32": "Towing (long)",
    "33": "Dredging", "34": "Diving", "35": "Military",
    "36": "Sailing", "37": "Pleasure",
    "40": "HSC", "50": "Pilot", "51": "SAR",
    "52": "Tug", "53": "Port Tender", "55": "Law Enforcement",
    "60": "Passenger", "70": "Cargo", "80": "Tanker",
    "90": "Other",
}


class AISHubWorker(FeedWorker):
    """AISHub — global vessel positions via free data exchange."""

    source_id = "aishub"
    display_name = "AISHub Vessel Tracking"
    category = FeedCategory.maritime
    refresh_interval = 600  # 10 minutes

    _URL = "https://data.aishub.net/ws.php"

    async def fetch(self) -> List[GeoEvent]:
        params = {
            "username": "AIS-DEVELOPMENT",
            "format": "1",
            "output": "json",
            "compress": "0",
            "latmin": "-90", "latmax": "90",
            "lonmin": "-180", "lonmax": "180",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(self._URL, params=params)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                return []

        if not isinstance(data, list) or len(data) < 2:
            return []

        vessels = data[1] if isinstance(data[1], list) else []
        events: List[GeoEvent] = []
        now_iso = datetime.now(timezone.utc).isoformat()

        for v in vessels[:500]:
            try:
                mmsi = str(v.get("MMSI", ""))
                lat = float(v.get("LATITUDE", 0))
                lng = float(v.get("LONGITUDE", 0))
                ship_name = (v.get("NAME") or "").strip()
                ship_type = str(v.get("TYPE") or "0")
                sog = float(v.get("SOG") or 0)
                cog = float(v.get("COG") or 0)
                destination = (v.get("DESTINATION") or "").strip()

                if lat == 0 and lng == 0:
                    continue
                if not mmsi:
                    continue

                type_label = _SHIP_TYPE_LABEL.get(ship_type[:2], "Vessel")
                is_military = ship_type == "35"
                severity = SeverityLevel.info if not is_military else SeverityLevel.low

                navy_info = None
                for prefix, (country, fleet) in _NAVAL_MMSI_PREFIXES.items():
                    if mmsi.startswith(prefix):
                        navy_info = f"{fleet} ({country})"
                        severity = SeverityLevel.low
                        break

                name_display = ship_name or f"MMSI {mmsi}"
                title = f"{type_label}: {name_display}" + (f" → {destination}" if destination else "")
                body = f"Speed: {sog:.1f} kn · Course: {cog:.0f}°" + (f" · {navy_info}" if navy_info else "")

                events.append(GeoEvent(
                    id=f"ais_{mmsi}_{datetime.now(timezone.utc).strftime('%Y%m%d%H')}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=title,
                    body=body,
                    lat=lat,
                    lng=lng,
                    event_time=now_iso,
                    metadata={
                        "mmsi": mmsi, "ship_type": ship_type,
                        "sog_kn": sog, "cog_deg": cog,
                        "destination": destination,
                    },
                ))
            except Exception:
                continue

        return events
