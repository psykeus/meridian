"""Naval MMSI Tracker — monitors known military vessel positions via AIS data."""
import logging
from datetime import datetime, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

# Home port approximate coordinates for naval vessels
_HOME_PORTS: dict[str, tuple[float, float]] = {
    "US": (36.95, -76.33),   # Norfolk, VA (US Navy home port)
    "GB": (50.80, -1.10),    # Portsmouth, UK
    "FR": (43.12, 5.93),     # Toulon, France
    "RU": (69.08, 33.42),    # Severomorsk, Russia
    "IN": (17.70, 83.30),    # Visakhapatnam, India
    "IT": (40.84, 14.27),    # Naples, Italy
    "JP": (35.29, 139.68),   # Yokosuka, Japan
}

# AISHub API endpoint (requires API key)
_AISHUB_URL = "https://data.aishub.net/ws.php"

# Known naval vessel MMSI numbers and their identification
# MMSI format: MIDxxxxxxx where MID = Maritime Identification Digits (country code)
_NAVAL_VESSELS: dict[str, dict] = {
    # US Navy
    "369970120": {"name": "USS Gerald R. Ford (CVN-78)", "type": "Aircraft Carrier", "flag": "US"},
    "369970100": {"name": "USS Nimitz (CVN-68)", "type": "Aircraft Carrier", "flag": "US"},
    "369970090": {"name": "USS Abraham Lincoln (CVN-72)", "type": "Aircraft Carrier", "flag": "US"},
    "369970110": {"name": "USS George H.W. Bush (CVN-77)", "type": "Aircraft Carrier", "flag": "US"},
    "369970080": {"name": "USS Theodore Roosevelt (CVN-71)", "type": "Aircraft Carrier", "flag": "US"},
    "369970060": {"name": "USS Carl Vinson (CVN-70)", "type": "Aircraft Carrier", "flag": "US"},
    "369970130": {"name": "USS Bataan (LHD-5)", "type": "Amphibious Assault Ship", "flag": "US"},
    "369970140": {"name": "USS Wasp (LHD-1)", "type": "Amphibious Assault Ship", "flag": "US"},
    # Royal Navy
    "232001000": {"name": "HMS Queen Elizabeth (R08)", "type": "Aircraft Carrier", "flag": "GB"},
    "232002000": {"name": "HMS Prince of Wales (R09)", "type": "Aircraft Carrier", "flag": "GB"},
    # French Navy
    "226000900": {"name": "FS Charles de Gaulle (R91)", "type": "Aircraft Carrier", "flag": "FR"},
    # Russian Navy
    "273310000": {"name": "Admiral Kuznetsov", "type": "Aircraft Carrier", "flag": "RU"},
    # Indian Navy
    "419000100": {"name": "INS Vikrant (R11)", "type": "Aircraft Carrier", "flag": "IN"},
    # Italian Navy
    "247000300": {"name": "ITS Cavour (C 550)", "type": "Aircraft Carrier", "flag": "IT"},
    # Japanese MSDF
    "431000100": {"name": "JS Izumo (DDH-183)", "type": "Helicopter Destroyer", "flag": "JP"},
}

# Vessel type severity — carriers and warships are more significant
_TYPE_SEVERITY: dict[str, SeverityLevel] = {
    "Aircraft Carrier": SeverityLevel.high,
    "Amphibious Assault Ship": SeverityLevel.medium,
    "Helicopter Destroyer": SeverityLevel.medium,
    "Destroyer": SeverityLevel.medium,
    "Frigate": SeverityLevel.low,
    "Submarine": SeverityLevel.high,
}


class NavalMMSIWorker(FeedWorker):
    """Tracks known military and naval vessel positions using AIS data
    from AISHub. Maintains a list of notable MMSI numbers for major
    warships and reports their last known positions.

    Requires AISHUB_API_KEY credential."""

    source_id = "naval_mmsi"
    display_name = "Naval Vessel MMSI Tracker"
    category = FeedCategory.maritime
    refresh_interval = 1800  # 30 minutes
    run_on_startup = False  # requires credentials, rate-limited

    def _get_home_port(self, flag: str) -> tuple[float, float]:
        if flag in _HOME_PORTS:
            return _HOME_PORTS[flag]
        if flag in COUNTRY_COORDS:
            return COUNTRY_COORDS[flag]
        return (36.95, -76.33)  # default Norfolk

    async def fetch(self) -> list[GeoEvent]:
        api_key = get_credential("AISHUB_API_KEY")

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)
        seen_mmsis: set[str] = set()

        if api_key:
            async with httpx.AsyncClient(timeout=30) as client:
                for mmsi, vessel_info in _NAVAL_VESSELS.items():
                    try:
                        resp = await client.get(
                            _AISHUB_URL,
                            params={
                                "username": api_key,
                                "format": "1",
                                "output": "json",
                                "compress": "0",
                                "mmsi": mmsi,
                            },
                        )
                        if resp.status_code != 200:
                            continue

                        data = resp.json()
                        records = data if isinstance(data, list) else data.get("data", [])
                        if not records:
                            continue

                        pos = records[0] if records else None
                        if pos is None:
                            continue

                        lat = pos.get("LATITUDE") or pos.get("lat")
                        lng = pos.get("LONGITUDE") or pos.get("lng") or pos.get("lon")
                        if lat is None or lng is None:
                            continue

                        lat = float(lat)
                        lng = float(lng)

                        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                            continue
                        if lat == 0.0 and lng == 0.0:
                            continue

                        seen_mmsis.add(mmsi)

                        speed = pos.get("SPEED") or pos.get("speed") or 0
                        heading = pos.get("HEADING") or pos.get("heading")
                        course = pos.get("COURSE") or pos.get("course")
                        timestamp = pos.get("TIME") or pos.get("timestamp")

                        if timestamp:
                            try:
                                event_time = datetime.fromisoformat(
                                    str(timestamp).replace("Z", "+00:00")
                                )
                            except (ValueError, TypeError):
                                event_time = now
                        else:
                            event_time = now

                        vessel_name = vessel_info["name"]
                        vessel_type = vessel_info["type"]
                        flag = vessel_info["flag"]
                        severity = _TYPE_SEVERITY.get(vessel_type, SeverityLevel.low)

                        speed_kt = float(speed) / 10.0 if speed else 0

                        status = "UNDERWAY" if speed_kt > 0.5 else "AT ANCHOR / IN PORT"
                        title = f"Naval: {vessel_name} — {status} [{flag}]"
                        body = (
                            f"{vessel_name} ({vessel_type}) — {flag} Navy. "
                            f"Position: {lat:.3f}, {lng:.3f}. "
                            f"Speed: {speed_kt:.1f} kt."
                        )

                        events.append(
                            GeoEvent(
                                id=f"naval_{mmsi}",
                                source_id=self.source_id,
                                category=self.category,
                                subcategory="naval_vessel",
                                title=title,
                                body=body,
                                severity=severity,
                                lat=lat,
                                lng=lng,
                                event_time=event_time,
                                url=f"https://www.marinetraffic.com/en/ais/details/ships/mmsi:{mmsi}",
                                metadata={
                                    "mmsi": mmsi,
                                    "vessel_name": vessel_name,
                                    "vessel_type": vessel_type,
                                    "flag": flag,
                                    "speed_kt": speed_kt,
                                    "heading": heading,
                                    "course": course,
                                    "status": "underway" if speed_kt > 0.5 else "anchored",
                                },
                            )
                        )
                    except Exception:
                        continue
        else:
            logger.debug("naval_mmsi: no AISHUB_API_KEY — generating home-port events only")

        # Generate "AIS DARK" events for vessels not seen
        for mmsi, vessel_info in _NAVAL_VESSELS.items():
            if mmsi in seen_mmsis:
                continue

            vessel_name = vessel_info["name"]
            vessel_type = vessel_info["type"]
            flag = vessel_info["flag"]
            lat, lng = self._get_home_port(flag)

            title = f"Naval: {vessel_name} — AIS DARK [{flag}]"
            body = (
                f"{vessel_name} ({vessel_type}) — {flag} Navy. "
                f"No AIS signal detected. Vessel may be in port, operating under EMCON "
                f"(emissions control), or AIS transponder disabled. "
                f"Shown at approximate home port."
            )

            events.append(
                GeoEvent(
                    id=f"naval_{mmsi}_dark",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="naval_vessel",
                    title=title,
                    body=body,
                    severity=SeverityLevel.info,
                    lat=lat,
                    lng=lng,
                    event_time=now,
                    url=f"https://www.marinetraffic.com/en/ais/details/ships/mmsi:{mmsi}",
                    metadata={
                        "mmsi": mmsi,
                        "vessel_name": vessel_name,
                        "vessel_type": vessel_type,
                        "flag": flag,
                        "status": "ais_dark",
                        "on_ground": True,
                    },
                )
            )

        return events
