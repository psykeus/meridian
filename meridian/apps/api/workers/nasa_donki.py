"""NASA DONKI — Coronal Mass Ejections, Solar Flares, and Geomagnetic Storms."""
import hashlib
import logging
from datetime import datetime, timedelta, timezone

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.nasa.gov/DONKI"

# Solar events are placed at the NOAA SWPC location by default,
# but we spread them using a hash-based offset to avoid stacking.
_BASE_LAT, _BASE_LNG = 39.9956, -105.2621


def _hash_offset(text: str) -> tuple[float, float]:
    """Deterministic lat/lng offset from a string hash."""
    h = int(hashlib.md5(text.encode()).hexdigest(), 16)
    lat_off = ((h % 1000) / 1000.0 - 0.5) * 60  # +/- 30 degrees
    lng_off = (((h >> 40) % 1000) / 1000.0 - 0.5) * 180  # +/- 90 degrees
    return lat_off, lng_off


def _flare_severity(class_type: str) -> SeverityLevel:
    if not class_type:
        return SeverityLevel.medium
    c = class_type[0].upper()
    if c == "X":
        return SeverityLevel.high
    if c == "M":
        return SeverityLevel.medium
    return SeverityLevel.low


def _kp_severity(kp_index: float | None) -> SeverityLevel:
    if kp_index is None:
        return SeverityLevel.medium
    if kp_index >= 8:
        return SeverityLevel.critical
    if kp_index >= 6:
        return SeverityLevel.high
    if kp_index >= 4:
        return SeverityLevel.medium
    return SeverityLevel.low


def _parse_donki_time(ts: str | None) -> datetime:
    if not ts:
        return datetime.now(timezone.utc)
    for fmt in ("%Y-%m-%dT%H:%MZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ"):
        try:
            return datetime.strptime(ts, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


class NASADONKIWorker(FeedWorker):
    """NASA DONKI: Coronal Mass Ejections, Solar Flares, and Geomagnetic Storms."""

    source_id = "nasa_donki"
    display_name = "NASA DONKI Space Weather"
    category = FeedCategory.space
    refresh_interval = 3600

    async def fetch(self) -> list[GeoEvent]:
        api_key = get_credential("NASA_API_KEY") or "DEMO_KEY"
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
        params = {"startDate": start, "endDate": end, "api_key": api_key}

        events: list[GeoEvent] = []

        async with httpx.AsyncClient(timeout=30) as client:
            # --- Coronal Mass Ejections ---
            try:
                resp = await client.get(f"{_BASE_URL}/CME", params=params)
                resp.raise_for_status()
                for cme in resp.json() or []:
                    cme_id = cme.get("activityID", "")
                    if not cme_id:
                        continue
                    event_time = _parse_donki_time(cme.get("startTime"))
                    lat_off, lng_off = _hash_offset(cme_id)
                    lat = max(-90, min(90, _BASE_LAT + lat_off))
                    lng = max(-180, min(180, _BASE_LNG + lng_off))
                    note = (cme.get("note") or "")[:500]
                    events.append(GeoEvent(
                        id=f"donki_cme_{hashlib.md5(cme_id.encode()).hexdigest()[:12]}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="cme",
                        title=f"CME: {cme_id}",
                        body=note or None,
                        severity=SeverityLevel.medium,
                        lat=lat,
                        lng=lng,
                        event_time=event_time,
                        url=cme.get("link"),
                        metadata={
                            "activity_id": cme_id,
                            "type": "CME",
                            "source_location": cme.get("sourceLocation"),
                        },
                    ))
            except Exception as exc:
                logger.warning("DONKI CME fetch failed: %s", exc)

            # --- Solar Flares ---
            try:
                resp = await client.get(f"{_BASE_URL}/FLR", params=params)
                resp.raise_for_status()
                for flr in resp.json() or []:
                    flr_id = flr.get("flrID", "")
                    if not flr_id:
                        continue
                    class_type = flr.get("classType", "")
                    event_time = _parse_donki_time(flr.get("beginTime"))
                    lat_off, lng_off = _hash_offset(flr_id)
                    lat = max(-90, min(90, _BASE_LAT + lat_off))
                    lng = max(-180, min(180, _BASE_LNG + lng_off))
                    events.append(GeoEvent(
                        id=f"donki_flr_{hashlib.md5(flr_id.encode()).hexdigest()[:12]}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="solar_flare",
                        title=f"Solar Flare {class_type}: {flr_id}",
                        body=f"Class {class_type} solar flare from {flr.get('sourceLocation', 'unknown')}",
                        severity=_flare_severity(class_type),
                        lat=lat,
                        lng=lng,
                        event_time=event_time,
                        url=flr.get("link"),
                        metadata={
                            "flr_id": flr_id,
                            "type": "FLR",
                            "class_type": class_type,
                            "source_location": flr.get("sourceLocation"),
                            "peak_time": flr.get("peakTime"),
                            "end_time": flr.get("endTime"),
                        },
                    ))
            except Exception as exc:
                logger.warning("DONKI FLR fetch failed: %s", exc)

            # --- Geomagnetic Storms ---
            try:
                resp = await client.get(f"{_BASE_URL}/GST", params=params)
                resp.raise_for_status()
                for gst in resp.json() or []:
                    gst_id = gst.get("gstID", "")
                    if not gst_id:
                        continue
                    event_time = _parse_donki_time(gst.get("startTime"))
                    # Extract max Kp index from allKpIndex
                    kp_values = gst.get("allKpIndex") or []
                    max_kp = max((kp.get("kpIndex", 0) for kp in kp_values), default=None)
                    lat_off, lng_off = _hash_offset(gst_id)
                    lat = max(-90, min(90, _BASE_LAT + lat_off))
                    lng = max(-180, min(180, _BASE_LNG + lng_off))
                    events.append(GeoEvent(
                        id=f"donki_gst_{hashlib.md5(gst_id.encode()).hexdigest()[:12]}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="geomagnetic_storm",
                        title=f"Geomagnetic Storm: {gst_id}" + (f" (Kp={max_kp})" if max_kp else ""),
                        body=f"Geomagnetic storm starting {gst.get('startTime', 'N/A')}",
                        severity=_kp_severity(max_kp),
                        lat=lat,
                        lng=lng,
                        event_time=event_time,
                        url=gst.get("link"),
                        metadata={
                            "gst_id": gst_id,
                            "type": "GST",
                            "max_kp_index": max_kp,
                            "kp_values": [kp.get("kpIndex") for kp in kp_values],
                        },
                    ))
            except Exception as exc:
                logger.warning("DONKI GST fetch failed: %s", exc)

        return events
