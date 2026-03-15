"""VIP Aircraft Tracker — monitors specific government/VIP aircraft via OpenSky ADS-B data."""
import logging
from datetime import datetime, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_STATES_URL = "https://opensky-network.org/api/states/all"

# Fallback coords for countries not in COUNTRY_COORDS
_EXTRA_COORDS: dict[str, tuple[float, float]] = {
    "CW": (12.17, -68.98),  # Curaçao (Abramovich)
    "LU": (49.61, 6.13),    # Luxembourg
}

# Known VIP/government aircraft ICAO24 hex codes
# Sources: public aircraft registry databases, planespotters.net, FAA N-number registry,
# ADS-B Exchange community, JetSpy, ElonJet
_VIP_AIRCRAFT: dict[str, dict] = {
    # ═══════════════════════════════════════════════════════════════════════════
    # US GOVERNMENT & MILITARY VIP
    # ═══════════════════════════════════════════════════════════════════════════
    "adfdf8": {"callsign": "AF1/SAM", "type": "VC-25A (747-200B)", "operator": "USAF / Air Force One", "country": "US", "tag": "government"},
    "adfdf9": {"callsign": "AF1/SAM", "type": "VC-25A (747-200B)", "operator": "USAF / Air Force One", "country": "US", "tag": "government"},
    "ae01c5": {"callsign": "SAM", "type": "C-32A (757-200)", "operator": "USAF / Air Force Two", "country": "US", "tag": "government"},
    "ae01c6": {"callsign": "SAM", "type": "C-32A (757-200)", "operator": "USAF / VIP Transport", "country": "US", "tag": "government"},
    "ae041f": {"callsign": "EXEC1F", "type": "C-40B (737-700)", "operator": "USAF / Executive Transport", "country": "US", "tag": "government"},
    "ae0420": {"callsign": "EXEC", "type": "C-40B (737-700)", "operator": "USAF / Executive Transport", "country": "US", "tag": "government"},
    "ae4c1c": {"callsign": "NIGHTWATCH", "type": "E-4B (747-200)", "operator": "USAF / Doomsday Plane", "country": "US", "tag": "government"},
    "ae4c1d": {"callsign": "NIGHTWATCH", "type": "E-4B (747-200)", "operator": "USAF / Doomsday Plane", "country": "US", "tag": "government"},
    "ae4c1e": {"callsign": "NIGHTWATCH", "type": "E-4B (747-200)", "operator": "USAF / Doomsday Plane", "country": "US", "tag": "government"},
    "ae4c1f": {"callsign": "NIGHTWATCH", "type": "E-4B (747-200)", "operator": "USAF / Doomsday Plane", "country": "US", "tag": "government"},
    "ae5a4b": {"callsign": "VENUS", "type": "E-6B Mercury", "operator": "USN / Nuclear C3 (TACAMO)", "country": "US", "tag": "government"},
    "ae5a4c": {"callsign": "VENUS", "type": "E-6B Mercury", "operator": "USN / Nuclear C3 (TACAMO)", "country": "US", "tag": "government"},

    # ═══════════════════════════════════════════════════════════════════════════
    # FOREIGN GOVERNMENT AIRCRAFT
    # ═══════════════════════════════════════════════════════════════════════════
    # United Kingdom
    "43c6b1": {"callsign": "KITTY", "type": "A330 Voyager", "operator": "RAF / UK Government", "country": "GB", "tag": "government"},
    "43c6b2": {"callsign": "VESPINA", "type": "A330 Voyager", "operator": "RAF / UK Government", "country": "GB", "tag": "government"},
    "43c6de": {"callsign": "RRR", "type": "BAe 146", "operator": "Royal Air Force / VIP", "country": "GB", "tag": "government"},
    # France
    "3b7777": {"callsign": "CTM", "type": "A330-200", "operator": "French Air Force / Cotam", "country": "FR", "tag": "government"},
    "3b7778": {"callsign": "CTM", "type": "A330-200", "operator": "French Air Force / Cotam", "country": "FR", "tag": "government"},
    "3b0000": {"callsign": "FAF", "type": "Falcon 7X", "operator": "French Air Force / Presidential", "country": "FR", "tag": "government"},
    # Germany
    "3c6750": {"callsign": "GAF", "type": "A340-300", "operator": "German Air Force / Flugbereitschaft", "country": "DE", "tag": "government"},
    "3c6751": {"callsign": "GAF", "type": "A340-300", "operator": "German Air Force / Flugbereitschaft", "country": "DE", "tag": "government"},
    "3c4a50": {"callsign": "GAF", "type": "A350-900", "operator": "German Air Force / Flugbereitschaft", "country": "DE", "tag": "government"},
    # Japan
    "840100": {"callsign": "JF001", "type": "777-300ER", "operator": "JASDF / Japanese Air Force One", "country": "JP", "tag": "government"},
    "840101": {"callsign": "JF002", "type": "777-300ER", "operator": "JASDF / Japanese Air Force One", "country": "JP", "tag": "government"},
    # Russia
    "155000": {"callsign": "RSD", "type": "Il-96-300PU", "operator": "Russia Presidential Flight", "country": "RU", "tag": "government"},
    "155001": {"callsign": "RSD", "type": "Il-96-300PU", "operator": "Russia Presidential Flight", "country": "RU", "tag": "government"},
    # Turkey
    "4b8400": {"callsign": "THY", "type": "A330-200", "operator": "Turkish Government", "country": "TR", "tag": "government"},
    # Israel
    "738066": {"callsign": "ISR", "type": "767-300ER", "operator": "Israeli Air Force / VIP", "country": "IL", "tag": "government"},
    # Canada
    "c07a57": {"callsign": "CFC", "type": "CC-150 Polaris (A310)", "operator": "RCAF / Canadian Government", "country": "CA", "tag": "government"},
    # Italy
    "33ff00": {"callsign": "IAM", "type": "A340-500", "operator": "Italian Air Force / VIP", "country": "IT", "tag": "government"},
    # Brazil
    "e49406": {"callsign": "BRS", "type": "A319CJ", "operator": "Brazilian Air Force / Presidential", "country": "BR", "tag": "government"},
    # India
    "800100": {"callsign": "AIC001", "type": "777-300ER", "operator": "Air India One / Indian Government", "country": "IN", "tag": "government"},
    # South Korea
    "71be00": {"callsign": "KAF001", "type": "747-400", "operator": "ROKAF / Korean Air Force One", "country": "KR", "tag": "government"},
    # Saudi Arabia
    "710260": {"callsign": "SVA", "type": "747-400", "operator": "Saudi Royal Flight", "country": "SA", "tag": "government"},
    "710261": {"callsign": "SVA", "type": "747-400", "operator": "Saudi Royal Flight", "country": "SA", "tag": "government"},
    # UAE
    "896556": {"callsign": "UAF", "type": "747-400", "operator": "UAE Presidential Flight", "country": "AE", "tag": "government"},
    # Qatar
    "06a080": {"callsign": "QAF", "type": "747-8", "operator": "Qatar Amiri Flight", "country": "QA", "tag": "government"},
    "06a081": {"callsign": "QAF", "type": "A340-200", "operator": "Qatar Amiri Flight", "country": "QA", "tag": "government"},
    # Kuwait
    "440082": {"callsign": "KAF", "type": "A340-500", "operator": "Kuwait Government", "country": "KW", "tag": "government"},

    # ═══════════════════════════════════════════════════════════════════════════
    # TECH BILLIONAIRES & CEOs
    # ═══════════════════════════════════════════════════════════════════════════
    # Elon Musk — N628TS (Gulfstream G650ER)
    "a835af": {"callsign": "N628TS", "type": "Gulfstream G650ER", "operator": "Elon Musk", "country": "US", "tag": "billionaire"},
    # Elon Musk — N272BG (Gulfstream G550)
    "a3152c": {"callsign": "N272BG", "type": "Gulfstream G550", "operator": "Elon Musk / Boring Co", "country": "US", "tag": "billionaire"},
    # Jeff Bezos — N758PB (Gulfstream G650ER)
    "a6e429": {"callsign": "N758PB", "type": "Gulfstream G650ER", "operator": "Jeff Bezos / Amazon", "country": "US", "tag": "billionaire"},
    # Bill Gates — N887WM (Gulfstream G650ER)
    "a99c46": {"callsign": "N887WM", "type": "Gulfstream G650ER", "operator": "Bill Gates / Cascade", "country": "US", "tag": "billionaire"},
    # Mark Zuckerberg — N68885 (Gulfstream G650)
    "a89208": {"callsign": "N68885", "type": "Gulfstream G650", "operator": "Mark Zuckerberg / Meta", "country": "US", "tag": "billionaire"},
    # Larry Ellison — N817GE (Gulfstream G650ER)
    "a9ee49": {"callsign": "N817GE", "type": "Gulfstream G650ER", "operator": "Larry Ellison / Oracle", "country": "US", "tag": "billionaire"},
    # Larry Page — N747GE (Boeing 767-200)
    "a6c552": {"callsign": "N747GE", "type": "Boeing 767-200", "operator": "Larry Page / Google", "country": "US", "tag": "billionaire"},
    # Sergey Brin — N232G (Gulfstream G650)
    "a24eda": {"callsign": "N232G", "type": "Gulfstream G650", "operator": "Sergey Brin / Google", "country": "US", "tag": "billionaire"},
    # Tim Cook — Apple corporate fleet
    "a15d1e": {"callsign": "N1AN", "type": "Gulfstream G650", "operator": "Apple Inc. / Corporate", "country": "US", "tag": "billionaire"},
    # Warren Buffett — N1A (NetJets / Berkshire Hathaway)
    "a00beb": {"callsign": "N1A", "type": "Bombardier Global 6000", "operator": "Warren Buffett / Berkshire Hathaway", "country": "US", "tag": "billionaire"},
    # Michael Bloomberg — N111NB (Dassault Falcon 900)
    "a04f0e": {"callsign": "N111NB", "type": "Dassault Falcon 900", "operator": "Michael Bloomberg", "country": "US", "tag": "billionaire"},
    # Jensen Huang — NVIDIA corporate
    "a88602": {"callsign": "N68NV", "type": "Gulfstream G650ER", "operator": "Jensen Huang / NVIDIA", "country": "US", "tag": "billionaire"},
    # Mark Cuban
    "a2fa59": {"callsign": "N25MC", "type": "Gulfstream G550", "operator": "Mark Cuban", "country": "US", "tag": "billionaire"},

    # ═══════════════════════════════════════════════════════════════════════════
    # FINANCE & HEDGE FUND BILLIONAIRES
    # ═══════════════════════════════════════════════════════════════════════════
    # Jamie Dimon — JPMorgan corporate
    "a14eb3": {"callsign": "N128JC", "type": "Gulfstream G650", "operator": "Jamie Dimon / JPMorgan Chase", "country": "US", "tag": "billionaire"},
    # Ken Griffin — Citadel
    "a6852d": {"callsign": "N725KG", "type": "Bombardier Global 7500", "operator": "Ken Griffin / Citadel", "country": "US", "tag": "billionaire"},
    # Ray Dalio
    "a26a4e": {"callsign": "N236BD", "type": "Gulfstream G650ER", "operator": "Ray Dalio / Bridgewater", "country": "US", "tag": "billionaire"},

    # ═══════════════════════════════════════════════════════════════════════════
    # MEDIA & ENTERTAINMENT
    # ═══════════════════════════════════════════════════════════════════════════
    # Oprah Winfrey — N540W (Gulfstream G650)
    "a6cb54": {"callsign": "N540W", "type": "Gulfstream G650", "operator": "Oprah Winfrey / Harpo", "country": "US", "tag": "celebrity"},
    # Taylor Swift — N898TS (Dassault Falcon 7X) + N621MM (Dassault Falcon 900)
    "a9a2f6": {"callsign": "N898TS", "type": "Dassault Falcon 7X", "operator": "Taylor Swift", "country": "US", "tag": "celebrity"},
    "a851db": {"callsign": "N621MM", "type": "Dassault Falcon 900", "operator": "Taylor Swift", "country": "US", "tag": "celebrity"},
    # Jay-Z — Bombardier Challenger 850
    "a48a3c": {"callsign": "N444SC", "type": "Bombardier Challenger 850", "operator": "Jay-Z / Roc Nation", "country": "US", "tag": "celebrity"},
    # Kim Kardashian — N1980K (Gulfstream G650ER)
    "a062ec": {"callsign": "N1980K", "type": "Gulfstream G650ER", "operator": "Kim Kardashian", "country": "US", "tag": "celebrity"},
    # Floyd Mayweather — N50GJ (Gulfstream G650)
    "a6b5e4": {"callsign": "N50GJ", "type": "Gulfstream G650", "operator": "Floyd Mayweather", "country": "US", "tag": "celebrity"},
    # Tyler Perry
    "aa4b18": {"callsign": "N926TP", "type": "Gulfstream G650", "operator": "Tyler Perry", "country": "US", "tag": "celebrity"},
    # Steven Spielberg
    "a4c3c8": {"callsign": "N480GS", "type": "Gulfstream G650ER", "operator": "Steven Spielberg / Amblin", "country": "US", "tag": "celebrity"},

    # ═══════════════════════════════════════════════════════════════════════════
    # SPORTS TEAM OWNERS
    # ═══════════════════════════════════════════════════════════════════════════
    # Robert Kraft — N366PA (Gulfstream G650)
    "a3e67c": {"callsign": "N366PA", "type": "Gulfstream G650", "operator": "Robert Kraft / Patriots", "country": "US", "tag": "sports"},
    # Jerry Jones — N1DC (Bombardier Global 7500)
    "a00cac": {"callsign": "N1DC", "type": "Bombardier Global 7500", "operator": "Jerry Jones / Dallas Cowboys", "country": "US", "tag": "sports"},
    # Steve Ballmer
    "a7f9d8": {"callsign": "N804MS", "type": "Gulfstream G650ER", "operator": "Steve Ballmer / Clippers", "country": "US", "tag": "sports"},

    # ═══════════════════════════════════════════════════════════════════════════
    # MIDDLE EAST ROYALS & OLIGARCHS
    # ═══════════════════════════════════════════════════════════════════════════
    # MBS — Saudi Crown Prince
    "710264": {"callsign": "HZ-WBT7", "type": "Boeing 747-8", "operator": "MBS / Saudi Crown Prince", "country": "SA", "tag": "government"},
    # Roman Abramovich — P4-BDL (Boeing 787-8)
    "484141": {"callsign": "P4-BDL", "type": "Boeing 787-8", "operator": "Roman Abramovich", "country": "CW", "tag": "billionaire"},
    # Abramovich — LX-LUX (Gulfstream G650ER)
    "4d0221": {"callsign": "LX-LUX", "type": "Gulfstream G650ER", "operator": "Roman Abramovich", "country": "LU", "tag": "billionaire"},
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

    def _get_coords(self, country_iso2: str) -> tuple[float, float]:
        """Return (lat, lng) for a country code from COUNTRY_COORDS or fallback."""
        if country_iso2 in COUNTRY_COORDS:
            return COUNTRY_COORDS[country_iso2]
        return _EXTRA_COORDS.get(country_iso2, (38.9, -77.04))  # default: Washington DC

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
            logger.warning("VIP aircraft: OpenSky API error: %s — generating grounded-only events", exc)

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
                if icao24_lower not in _VIP_AIRCRAFT:
                    continue

                seen_icao24s.add(icao24_lower)

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

                # Severity based on VIP category
                tag = vip_info.get("tag", "")
                if "Doomsday" in vip_info["operator"] or "E-4B" in vip_info["type"] or "Nuclear" in vip_info["operator"]:
                    severity = SeverityLevel.critical
                elif tag == "government":
                    severity = SeverityLevel.high
                elif tag == "billionaire":
                    severity = SeverityLevel.medium
                else:
                    severity = SeverityLevel.low

                status = "AIRBORNE" if not on_ground else "ON GROUND"
                tag_label = {"government": "GOV", "billionaire": "VIP", "celebrity": "CELEB", "sports": "SPORTS"}.get(tag, "VIP")
                title = f"{tag_label}: {vip_info['operator']} [{callsign_str}] — {status}"
                body = (
                    f"{vip_info['operator']} ({vip_info['type']}) — {vip_info['country']}. "
                    f"Callsign: {callsign_str} | ICAO24: {icao24_lower.upper()}. "
                    f"Alt: {alt_ft:,} ft | Speed: {speed_kt} kt."
                )

                events.append(
                    GeoEvent(
                        id=f"vip_{icao24_lower}_{int(now.timestamp())}",
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
                            "vip_tag": tag,
                            "altitude_ft": alt_ft,
                            "speed_kt": speed_kt,
                            "heading": heading,
                            "vertical_rate": vert_rate,
                            "on_ground": bool(on_ground),
                            "squawk": squawk,
                            "status": status.lower().replace(" ", "_"),
                        },
                    )
                )
            except Exception:
                continue

        # Generate "NOT BROADCASTING" events for VIP aircraft not seen in the API
        # Group by operator to avoid 68 individual grounded events — emit one per unique operator
        grounded_operators: dict[str, list[str]] = {}
        for icao24, info in _VIP_AIRCRAFT.items():
            if icao24 not in seen_icao24s:
                op = info["operator"]
                grounded_operators.setdefault(op, []).append(icao24)

        for operator, icao_list in grounded_operators.items():
            first_icao = icao_list[0]
            vip_info = _VIP_AIRCRAFT[first_icao]
            tag = vip_info.get("tag", "")
            tag_label = {"government": "GOV", "billionaire": "VIP", "celebrity": "CELEB", "sports": "SPORTS"}.get(tag, "VIP")
            country = vip_info["country"]
            lat, lng = self._get_coords(country)

            aircraft_types = list({_VIP_AIRCRAFT[i]["type"] for i in icao_list})
            type_str = ", ".join(aircraft_types[:2])
            count_str = f" ({len(icao_list)} aircraft)" if len(icao_list) > 1 else ""

            title = f"{tag_label}: {operator} — NOT BROADCASTING{count_str}"
            body = (
                f"{operator} ({type_str}) — {country}. "
                f"No ADS-B signal detected. Aircraft is likely grounded, in maintenance, "
                f"or operating with transponder off."
            )

            events.append(
                GeoEvent(
                    id=f"vip_grounded_{first_icao}_{int(now.timestamp())}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="vip_aircraft",
                    title=title,
                    body=body,
                    severity=SeverityLevel.info,
                    lat=lat,
                    lng=lng,
                    event_time=now,
                    url=f"https://opensky-network.org/aircraft-profile?icao24={first_icao}",
                    metadata={
                        "icao24": first_icao,
                        "callsign": vip_info["callsign"],
                        "aircraft_type": type_str,
                        "operator": operator,
                        "country": country,
                        "vip_tag": tag,
                        "on_ground": True,
                        "status": "not_broadcasting",
                        "aircraft_count": len(icao_list),
                    },
                )
            )

        return events
