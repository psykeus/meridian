"""VIP Aircraft Tracker — monitors specific government/VIP aircraft via OpenSky ADS-B data."""
import logging
from datetime import datetime, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_STATES_URL = "https://opensky-network.org/api/states/all"

# Known VIP/government aircraft ICAO24 hex codes
# Sources: public aircraft registry databases, planespotters.net
_VIP_AIRCRAFT: dict[str, dict] = {
    # United States
    "adfdf8": {"callsign": "AF1/SAM", "type": "VC-25A (747-200B)", "operator": "USAF / Air Force One", "country": "US"},
    "adfdf9": {"callsign": "AF1/SAM", "type": "VC-25A (747-200B)", "operator": "USAF / Air Force One", "country": "US"},
    "ae01c5": {"callsign": "SAM", "type": "C-32A (757-200)", "operator": "USAF / Air Force Two", "country": "US"},
    "ae01c6": {"callsign": "SAM", "type": "C-32A (757-200)", "operator": "USAF / VIP Transport", "country": "US"},
    "ae041f": {"callsign": "EXEC1F", "type": "C-40B (737-700)", "operator": "USAF / Executive Transport", "country": "US"},
    "ae0420": {"callsign": "EXEC", "type": "C-40B (737-700)", "operator": "USAF / Executive Transport", "country": "US"},
    "ae4c1c": {"callsign": "NIGHTWATCH", "type": "E-4B (747-200)", "operator": "USAF / Doomsday Plane", "country": "US"},
    "ae4c1d": {"callsign": "NIGHTWATCH", "type": "E-4B (747-200)", "operator": "USAF / Doomsday Plane", "country": "US"},
    "ae4c1e": {"callsign": "NIGHTWATCH", "type": "E-4B (747-200)", "operator": "USAF / Doomsday Plane", "country": "US"},
    # United Kingdom
    "43c6b1": {"callsign": "KITTY", "type": "A330 Voyager", "operator": "RAF / UK Government", "country": "GB"},
    "43c6b2": {"callsign": "VESPINA", "type": "A330 Voyager", "operator": "RAF / UK Government", "country": "GB"},
    # France
    "3b7777": {"callsign": "CTM", "type": "A330-200", "operator": "French Air Force / Cotam", "country": "FR"},
    "3b7778": {"callsign": "CTM", "type": "A330-200", "operator": "French Air Force / Cotam", "country": "FR"},
    # Germany
    "3c6750": {"callsign": "GAF", "type": "A340-300", "operator": "German Air Force / Flugbereitschaft", "country": "DE"},
    "3c6751": {"callsign": "GAF", "type": "A340-300", "operator": "German Air Force / Flugbereitschaft", "country": "DE"},
    # Japan
    "840100": {"callsign": "JF001", "type": "777-300ER", "operator": "JASDF / Japanese Air Force One", "country": "JP"},
    "840101": {"callsign": "JF002", "type": "777-300ER", "operator": "JASDF / Japanese Air Force One", "country": "JP"},
    # Russia
    "155000": {"callsign": "RSD", "type": "Il-96-300PU", "operator": "Russia Presidential Flight", "country": "RU"},
    # Turkey
    "4b8400": {"callsign": "THY", "type": "A330-200", "operator": "Turkish Government", "country": "TR"},
    # Israel
    "738066": {"callsign": "ISR", "type": "767-300ER", "operator": "Israeli Air Force / VIP", "country": "IL"},
}


class VIPAircraftWorker(FeedWorker):
    """Tracks specific VIP and government aircraft using the OpenSky Network
    ADS-B data. Monitors a curated list of known VIP ICAO24 hex codes
    including Air Force One, Doomsday planes, and foreign government aircraft.

    Uses OPENSKY_USERNAME/OPENSKY_PASSWORD credentials for authenticated access."""

    source_id = "vip_aircraft"
    display_name = "VIP Aircraft Tracker"
    category = FeedCategory.aviation
    refresh_interval = 300  # 5 minutes
    run_on_startup = False  # avoid rate-limiting OpenSky

    async def fetch(self) -> list[GeoEvent]:
        # Build auth
        auth_kwargs: dict = {}
        username = get_credential("OPENSKY_USERNAME")
        password = get_credential("OPENSKY_PASSWORD")
        if username and password:
            auth_kwargs["auth"] = (username, password)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_STATES_URL, **auth_kwargs)
            resp.raise_for_status()
            data = resp.json()

        states = data.get("states") or []
        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)

        for state in states:
            try:
                (icao24, callsign, origin, _time_pos, _last_contact,
                 lng, lat, baro_alt, on_ground, velocity,
                 heading, vert_rate, _sensors, geo_alt,
                 squawk, _spi, _position_source, *_rest) = state

                icao24_lower = (icao24 or "").strip().lower()
                if icao24_lower not in _VIP_AIRCRAFT:
                    continue

                if lng is None or lat is None:
                    continue
                if not (-90 <= float(lat) <= 90) or not (-180 <= float(lng) <= 180):
                    continue

                vip_info = _VIP_AIRCRAFT[icao24_lower]
                callsign_str = (callsign or "").strip() or vip_info["callsign"]
                altitude = float(geo_alt or baro_alt or 0)
                speed_ms = float(velocity or 0)
                speed_kt = round(speed_ms * 1.944)
                alt_ft = round(altitude * 3.28084)

                # All VIP aircraft are high severity by default
                severity = SeverityLevel.high
                if "Doomsday" in vip_info["operator"] or "E-4B" in vip_info["type"]:
                    severity = SeverityLevel.critical

                status = "AIRBORNE" if not on_ground else "GROUND"
                title = f"VIP: {vip_info['operator']} [{callsign_str}] — {status}"
                body = (
                    f"{vip_info['operator']} ({vip_info['type']}) — {vip_info['country']}. "
                    f"Callsign: {callsign_str} | ICAO24: {icao24_lower.upper()}. "
                    f"Alt: {alt_ft:,} ft | Speed: {speed_kt} kt."
                )

                events.append(
                    GeoEvent(
                        id=f"vip_{icao24_lower}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="vip_aircraft",
                        title=title,
                        body=body,
                        severity=severity,
                        lat=float(lat),
                        lng=float(lng),
                        event_time=now,
                        url=f"https://opensky-network.org/aircraft-profile?icao24={icao24_lower}",
                        metadata={
                            "icao24": icao24_lower,
                            "callsign": callsign_str,
                            "aircraft_type": vip_info["type"],
                            "operator": vip_info["operator"],
                            "country": vip_info["country"],
                            "altitude_ft": alt_ft,
                            "speed_kt": speed_kt,
                            "heading": heading,
                            "vertical_rate": vert_rate,
                            "on_ground": bool(on_ground),
                            "squawk": squawk,
                        },
                    )
                )
            except Exception:
                continue

        return events
