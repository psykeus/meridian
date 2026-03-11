"""Safecast — citizen science radiation monitoring network."""
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

# Safecast global measurements endpoint
_API_URL = "https://api.safecast.org/measurements.json"


def _cpm_to_severity(cpm: float) -> SeverityLevel:
    """Classify radiation level (CPM) to severity.

    Normal background radiation: 10–100 CPM
    Slightly elevated:          100–200 CPM
    Elevated:                   200–300 CPM
    Significantly elevated:     300–1000 CPM
    Dangerous:                  >1000 CPM
    """
    if cpm > 1000:
        return SeverityLevel.critical
    if cpm > 300:
        return SeverityLevel.high
    if cpm > 200:
        return SeverityLevel.medium
    if cpm > 100:
        return SeverityLevel.low
    return SeverityLevel.info


def _cpm_to_label(cpm: float) -> str:
    """Human-readable radiation level label."""
    if cpm > 1000:
        return "DANGEROUS"
    if cpm > 300:
        return "Significantly Elevated"
    if cpm > 200:
        return "Elevated"
    if cpm > 100:
        return "Slightly Elevated"
    return "Normal Background"


class SafecastRadiationWorker(FeedWorker):
    """Safecast citizen-science radiation monitoring measurements."""

    source_id = "safecast_radiation"
    display_name = "Safecast Radiation Monitor"
    category = FeedCategory.nuclear
    refresh_interval = 3600  # hourly

    async def fetch(self) -> list[GeoEvent]:
        params = {
            "order": "captured_at desc",
            "per_page": 100,
        }

        try:
            async with httpx.AsyncClient(
                timeout=30,
                headers={"User-Agent": "Meridian/1.0"},
            ) as client:
                resp = await client.get(_API_URL, params=params)
                resp.raise_for_status()
                measurements = resp.json()
        except Exception:
            return []

        if not isinstance(measurements, list):
            return []

        events: list[GeoEvent] = []

        for m in measurements:
            try:
                lat = m.get("latitude")
                lng = m.get("longitude")
                value = m.get("value")
                unit = m.get("unit") or "cpm"

                if lat is None or lng is None or value is None:
                    continue

                try:
                    lat = float(lat)
                    lng = float(lng)
                    cpm = float(value)
                except (ValueError, TypeError):
                    continue

                # Skip invalid coordinates
                if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                    continue

                # Skip zero/negative readings
                if cpm <= 0:
                    continue

                # Parse captured_at timestamp
                captured_at = m.get("captured_at")
                if captured_at:
                    try:
                        event_time = datetime.fromisoformat(
                            captured_at.replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        event_time = datetime.now(timezone.utc)
                else:
                    event_time = datetime.now(timezone.utc)

                measurement_id = m.get("id", "")
                device_id = m.get("device_id")
                location_name = m.get("location_name") or ""
                severity = _cpm_to_severity(cpm)
                level_label = _cpm_to_label(cpm)

                title = f"Safecast: {cpm:.0f} CPM — {level_label}"
                if location_name:
                    title = f"Safecast: {cpm:.0f} CPM — {level_label} ({location_name})"

                events.append(
                    GeoEvent(
                        id=f"safecast_{measurement_id}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="radiation_measurement",
                        title=title[:300],
                        body=(
                            f"Radiation measurement: {cpm:.1f} {unit.upper()}. "
                            f"Level: {level_label}. "
                            f"Normal background is typically 10–100 CPM."
                        ),
                        severity=severity,
                        lat=lat,
                        lng=lng,
                        event_time=event_time,
                        url=f"https://api.safecast.org/measurements/{measurement_id}.json",
                        metadata={
                            "value_cpm": cpm,
                            "unit": unit,
                            "device_id": device_id,
                            "location_name": location_name or None,
                            "level": level_label,
                        },
                    )
                )
            except Exception:
                continue

        return events
