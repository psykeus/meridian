"""Bomber/ISR Aircraft Tracker — monitors military bomber and ISR aircraft via OpenSky ADS-B."""
import logging
from datetime import datetime, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_STATES_URL = "https://opensky-network.org/api/states/all"

# Flag → approximate home base coordinates for grounded events
_FLAG_COORDS: dict[str, tuple[float, float]] = {
    "US": (38.26, -85.66),   # avg CONUS military
    "GB": (51.75, -1.58),    # RAF Brize Norton
    "NATO": (50.91, 6.96),   # Geilenkirchen
    "FR": (48.78, 2.10),     # BA 105 Évreux
}

# Known military bomber and ISR (Intelligence, Surveillance, Reconnaissance) aircraft
# ICAO24 hex codes from public aviation registries and spotters databases
_BOMBER_ISR_AIRCRAFT: dict[str, dict] = {
    # ── US Strategic Bombers ──────────────────────────────────────────
    "ae0415": {"type": "B-52H Stratofortress", "role": "Strategic Bomber", "flag": "US", "unit": "USAF AFGSC"},
    "ae0416": {"type": "B-52H Stratofortress", "role": "Strategic Bomber", "flag": "US", "unit": "USAF AFGSC"},
    "ae0417": {"type": "B-52H Stratofortress", "role": "Strategic Bomber", "flag": "US", "unit": "USAF AFGSC"},
    "ae0440": {"type": "B-1B Lancer", "role": "Strategic Bomber", "flag": "US", "unit": "USAF AFGSC"},
    "ae0441": {"type": "B-1B Lancer", "role": "Strategic Bomber", "flag": "US", "unit": "USAF AFGSC"},
    "ae0442": {"type": "B-1B Lancer", "role": "Strategic Bomber", "flag": "US", "unit": "USAF AFGSC"},
    "ae0460": {"type": "B-2A Spirit", "role": "Stealth Bomber", "flag": "US", "unit": "USAF AFGSC"},
    # ── US ISR / Surveillance ─────────────────────────────────────────
    "ae1460": {"type": "RC-135V/W Rivet Joint", "role": "SIGINT", "flag": "US", "unit": "USAF 55th Wing"},
    "ae1461": {"type": "RC-135V/W Rivet Joint", "role": "SIGINT", "flag": "US", "unit": "USAF 55th Wing"},
    "ae1462": {"type": "RC-135U Combat Sent", "role": "ELINT", "flag": "US", "unit": "USAF 55th Wing"},
    "ae1480": {"type": "E-3 Sentry (AWACS)", "role": "AEW&C", "flag": "US", "unit": "USAF 552nd ACW"},
    "ae1481": {"type": "E-3 Sentry (AWACS)", "role": "AEW&C", "flag": "US", "unit": "USAF 552nd ACW"},
    "ae5420": {"type": "E-8C JSTARS", "role": "Ground Surveillance", "flag": "US", "unit": "USAF 116th ACW"},
    "ae5421": {"type": "E-8C JSTARS", "role": "Ground Surveillance", "flag": "US", "unit": "USAF 116th ACW"},
    "ae148a": {"type": "EP-3E Aries II", "role": "SIGINT", "flag": "US", "unit": "USN VQ-1"},
    "ae6800": {"type": "RQ-4B Global Hawk", "role": "ISR UAV", "flag": "US", "unit": "USAF"},
    "ae6801": {"type": "RQ-4B Global Hawk", "role": "ISR UAV", "flag": "US", "unit": "USAF"},
    "adfd00": {"type": "P-8A Poseidon", "role": "Maritime Patrol", "flag": "US", "unit": "USN"},
    "adfd01": {"type": "P-8A Poseidon", "role": "Maritime Patrol", "flag": "US", "unit": "USN"},
    # ── UK RAF ISR ────────────────────────────────────────────────────
    "43c6c0": {"type": "RC-135W Airseeker", "role": "SIGINT", "flag": "GB", "unit": "RAF 51 Sqn"},
    "43c6c1": {"type": "RC-135W Airseeker", "role": "SIGINT", "flag": "GB", "unit": "RAF 51 Sqn"},
    "43c6d0": {"type": "E-3D Sentry", "role": "AEW&C", "flag": "GB", "unit": "RAF 8 Sqn"},
    "43c700": {"type": "P-8A Poseidon", "role": "Maritime Patrol", "flag": "GB", "unit": "RAF 120 Sqn"},
    # ── NATO AWACS ────────────────────────────────────────────────────
    "478100": {"type": "E-3A Sentry", "role": "AEW&C", "flag": "NATO", "unit": "NATO AEW&C Force"},
    "478101": {"type": "E-3A Sentry", "role": "AEW&C", "flag": "NATO", "unit": "NATO AEW&C Force"},
    # ── French Air Force ──────────────────────────────────────────────
    "3b5500": {"type": "E-3F SDCA", "role": "AEW&C", "flag": "FR", "unit": "AdlA EDCA"},
}

# Role-based severity
_ROLE_SEVERITY: dict[str, SeverityLevel] = {
    "Strategic Bomber": SeverityLevel.critical,
    "Stealth Bomber": SeverityLevel.critical,
    "SIGINT": SeverityLevel.high,
    "ELINT": SeverityLevel.high,
    "AEW&C": SeverityLevel.high,
    "Ground Surveillance": SeverityLevel.high,
    "ISR UAV": SeverityLevel.high,
    "Maritime Patrol": SeverityLevel.medium,
}


class BomberISRWorker(FeedWorker):
    """Tracks military bomber and ISR (Intelligence, Surveillance,
    Reconnaissance) aircraft using the OpenSky Network ADS-B data.
    Monitors known ICAO24 hex codes for B-52s, B-1Bs, RC-135s,
    E-3 AWACS, Global Hawks, and allied equivalents.

    Uses OPENSKY_USERNAME/OPENSKY_PASSWORD credentials for authenticated access."""

    source_id = "bomber_isr"
    display_name = "Bomber & ISR Aircraft Tracker"
    category = FeedCategory.military
    refresh_interval = 300  # 5 minutes
    run_on_startup = False  # avoid rate-limiting OpenSky

    def _get_coords(self, flag: str) -> tuple[float, float]:
        """Return (lat, lng) for a flag/country code."""
        if flag in _FLAG_COORDS:
            return _FLAG_COORDS[flag]
        if flag in COUNTRY_COORDS:
            return COUNTRY_COORDS[flag]
        return (38.26, -85.66)  # default CONUS

    async def fetch(self) -> list[GeoEvent]:
        # Build auth
        auth_kwargs: dict = {}
        username = get_credential("OPENSKY_USERNAME")
        password = get_credential("OPENSKY_PASSWORD")
        if username and password:
            auth_kwargs["auth"] = (username, password)

        states: list = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(_STATES_URL, **auth_kwargs)
                resp.raise_for_status()
                data = resp.json()
            states = data.get("states") or []
        except Exception as exc:
            logger.warning("Bomber/ISR: OpenSky API error: %s — generating grounded-only events", exc)

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)
        seen_icao24s: set[str] = set()

        for state in states:
            try:
                (icao24, callsign, origin, _time_pos, _last_contact,
                 lng, lat, baro_alt, on_ground, velocity,
                 heading, vert_rate, _sensors, geo_alt,
                 squawk, _spi, _position_source, *_rest) = state

                icao24_lower = (icao24 or "").strip().lower()
                if icao24_lower not in _BOMBER_ISR_AIRCRAFT:
                    continue

                seen_icao24s.add(icao24_lower)

                if lng is None or lat is None:
                    continue
                if not (-90 <= float(lat) <= 90) or not (-180 <= float(lng) <= 180):
                    continue

                aircraft = _BOMBER_ISR_AIRCRAFT[icao24_lower]
                callsign_str = (callsign or "").strip() or "UNKNOWN"
                altitude = float(geo_alt or baro_alt or 0)
                speed_ms = float(velocity or 0)
                speed_kt = round(speed_ms * 1.944)
                alt_ft = round(altitude * 3.28084)

                role = aircraft["role"]
                severity = _ROLE_SEVERITY.get(role, SeverityLevel.medium)
                status = "AIRBORNE" if not on_ground else "ON GROUND"

                title = (
                    f"MIL: {aircraft['type']} [{callsign_str}] — "
                    f"{role} — {status} ({aircraft['flag']})"
                )
                body = (
                    f"{aircraft['type']} ({aircraft['unit']}) — {role}. "
                    f"Callsign: {callsign_str} | ICAO24: {icao24_lower.upper()}. "
                    f"Alt: {alt_ft:,} ft | Speed: {speed_kt} kt | "
                    f"Origin: {origin or 'unknown'}."
                )

                events.append(
                    GeoEvent(
                        id=f"bisr_{icao24_lower}_{int(now.timestamp())}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="bomber_isr",
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
                            "aircraft_type": aircraft["type"],
                            "role": role,
                            "unit": aircraft["unit"],
                            "flag": aircraft["flag"],
                            "altitude_ft": alt_ft,
                            "speed_kt": speed_kt,
                            "heading": heading,
                            "vertical_rate": vert_rate,
                            "origin_country": origin,
                            "squawk": squawk,
                            "on_ground": bool(on_ground),
                            "status": status.lower().replace(" ", "_"),
                        },
                    )
                )
            except Exception:
                continue

        # Generate "NOT BROADCASTING" events grouped by unit for unseen aircraft
        grounded_units: dict[str, list[str]] = {}
        for icao24, info in _BOMBER_ISR_AIRCRAFT.items():
            if icao24 not in seen_icao24s:
                key = f"{info['unit']}|{info['type']}"
                grounded_units.setdefault(key, []).append(icao24)

        for unit_key, icao_list in grounded_units.items():
            first_icao = icao_list[0]
            aircraft = _BOMBER_ISR_AIRCRAFT[first_icao]
            flag = aircraft["flag"]
            lat, lng = self._get_coords(flag)
            count = len(icao_list)
            count_str = f" x{count}" if count > 1 else ""

            title = (
                f"MIL: {aircraft['type']}{count_str} — "
                f"{aircraft['role']} — NOT BROADCASTING ({flag})"
            )
            body = (
                f"{aircraft['type']} ({aircraft['unit']}) — {aircraft['role']}. "
                f"{count} aircraft not broadcasting ADS-B. "
                f"Likely grounded, in maintenance, or operating transponder-off."
            )

            events.append(
                GeoEvent(
                    id=f"bisr_grounded_{first_icao}_{int(now.timestamp())}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="bomber_isr",
                    title=title,
                    body=body,
                    severity=SeverityLevel.info,
                    lat=lat,
                    lng=lng,
                    event_time=now,
                    url=f"https://opensky-network.org/aircraft-profile?icao24={first_icao}",
                    metadata={
                        "icao24": first_icao,
                        "aircraft_type": aircraft["type"],
                        "role": aircraft["role"],
                        "unit": aircraft["unit"],
                        "flag": flag,
                        "on_ground": True,
                        "status": "not_broadcasting",
                        "aircraft_count": count,
                    },
                )
            )

        return events
