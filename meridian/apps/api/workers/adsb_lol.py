"""adsb.lol — open unfiltered ADS-B flight feed including military."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_MILITARY_PREFIXES = {"AE", "43C", "43D", "43E", "43F", "ADF", "RRR", "RCH", "LAGR", "DOOM", "FURY", "ZEUS", "JAKE", "COLT"}


class ADSBLolWorker(FeedWorker):
    source_id = "adsb_lol"
    display_name = "adsb.lol — Open ADS-B Feed"
    category = FeedCategory.military
    refresh_interval = 75

    _URL = "https://api.adsb.lol/v2/mil"

    async def fetch(self) -> list[GeoEvent]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(self._URL)
            if not resp.is_success:
                return []
            data = resp.json()

        aircraft = data.get("ac", []) or []
        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)
        seen: set[str] = set()

        for ac in aircraft[:100]:
            hex_code = ac.get("hex", "")
            if not hex_code or hex_code in seen:
                continue
            seen.add(hex_code)

            lat = ac.get("lat")
            lng = ac.get("lon")
            if lat is None or lng is None:
                continue

            callsign = (ac.get("flight") or "").strip()
            alt_baro = ac.get("alt_baro", 0)
            gs = ac.get("gs", 0)
            t = ac.get("t", "")
            desc = ac.get("desc", "")
            squawk = ac.get("squawk", "")

            severity = SeverityLevel.medium
            if squawk in ("7700", "7600", "7500"):
                severity = SeverityLevel.critical
            elif any(callsign.startswith(p) for p in _MILITARY_PREFIXES):
                severity = SeverityLevel.medium

            events.append(GeoEvent(
                id=f"adsb_{hex_code}_{now.strftime('%Y%m%d%H%M')}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"{'⚠️ ' if squawk in ('7700','7600','7500') else ''}Military: {callsign or hex_code} [{t or 'Unknown'}]",
                body=f"Alt: {alt_baro}ft · GS: {gs}kts · Squawk: {squawk}" + (f" · {desc}" if desc else ""),
                lat=float(lat), lng=float(lng),
                event_time=now,
                url="https://adsb.lol/",
                metadata={"hex": hex_code, "callsign": callsign, "alt_baro": alt_baro, "squawk": squawk, "type": t},
            ))
        return events
