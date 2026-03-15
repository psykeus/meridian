"""AlienVault OTX — Open Threat Exchange pulse feed."""
import hashlib
import logging
from datetime import datetime, timedelta, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_OTX_API_URL = "https://otx.alienvault.com/api/v1/pulses/subscribed"

# Default coords when no country mapping is available (OTX HQ, San Mateo CA)
_DEFAULT_LAT, _DEFAULT_LNG = 37.56, -122.32


def _hash_to_coords(text: str) -> tuple[float, float]:
    """Deterministic global spread from hash when no geo info available."""
    h = int(hashlib.sha256(text.encode()).hexdigest(), 16)
    lat = ((h % 18000) / 100.0) - 90.0
    lng = (((h >> 64) % 36000) / 100.0) - 180.0
    return lat, lng


def _pulse_severity(pulse: dict) -> SeverityLevel:
    """Map OTX pulse adversary/TLP/indicator count to severity."""
    adversary = pulse.get("adversary") or ""
    tlp = (pulse.get("tlp") or "").lower()
    indicator_count = len(pulse.get("indicators", []))

    if tlp == "red" or indicator_count > 50:
        return SeverityLevel.critical
    if adversary or indicator_count > 20:
        return SeverityLevel.high
    if indicator_count > 5:
        return SeverityLevel.medium
    return SeverityLevel.low


class OTXPulseWorker(FeedWorker):
    """AlienVault OTX threat intelligence pulses."""

    source_id = "otx_pulse"
    display_name = "AlienVault OTX Threat Intel"
    category = FeedCategory.cyber
    refresh_interval = 3600

    async def fetch(self) -> list[GeoEvent]:
        api_key = get_credential("OTX_API_KEY")
        if not api_key:
            logger.info("OTX_API_KEY not configured, skipping OTX pulse fetch")
            return []

        since = (datetime.now(timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S+00:00"
        )
        headers = {"X-OTX-API-KEY": api_key}
        params = {"limit": 20, "modified_since": since}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_OTX_API_URL, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results") or []
        events: list[GeoEvent] = []

        for pulse in results:
            try:
                pulse_id = pulse.get("id", "")
                if not pulse_id:
                    continue

                name = pulse.get("name", "Unknown Pulse")
                description = (pulse.get("description") or "")[:500]
                adversary = pulse.get("adversary") or ""

                # Parse modification time
                modified = pulse.get("modified") or pulse.get("created")
                if modified:
                    try:
                        event_time = datetime.fromisoformat(
                            modified.replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        event_time = datetime.now(timezone.utc)
                else:
                    event_time = datetime.now(timezone.utc)

                # Determine coordinates from targeted countries
                targeted = pulse.get("targeted_countries") or []
                lat, lng = _DEFAULT_LAT, _DEFAULT_LNG
                if targeted:
                    # Use first targeted country's coords
                    for cc in targeted:
                        cc_lower = cc.lower() if isinstance(cc, str) else ""
                        if cc_lower in COUNTRY_COORDS:
                            lat, lng = COUNTRY_COORDS[cc_lower]
                            break
                else:
                    # Spread based on hash
                    lat, lng = _hash_to_coords(pulse_id)

                severity = _pulse_severity(pulse)
                tags = pulse.get("tags") or []
                indicator_count = len(pulse.get("indicators", []))

                title = f"OTX: {name[:180]}"
                if adversary:
                    title = f"OTX [{adversary}]: {name[:150]}"

                events.append(GeoEvent(
                    id=f"otx_{hashlib.md5(pulse_id.encode()).hexdigest()[:12]}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="threat_intel",
                    title=title[:250],
                    body=description or None,
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=f"https://otx.alienvault.com/pulse/{pulse_id}",
                    metadata={
                        "pulse_id": pulse_id,
                        "adversary": adversary,
                        "tlp": pulse.get("tlp"),
                        "tags": tags[:20],
                        "indicator_count": indicator_count,
                        "targeted_countries": targeted[:10],
                    },
                ))
            except Exception:
                continue

        return events
