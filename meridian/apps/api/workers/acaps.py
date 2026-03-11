"""ACAPS INFORM Severity Index — humanitarian crisis severity rankings."""
import logging
import httpx
from datetime import datetime, timezone
from workers.base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

logger = logging.getLogger(__name__)

_COUNTRY_COORDS: dict[str, tuple[float, float]] = {
    "AFG": (33.94, 67.71), "SYR": (34.80, 38.99), "YEM": (15.55, 48.52),
    "SDN": (12.86, 30.22), "SOM": (5.15, 46.19), "COD": (-4.03, 21.75),
    "ETH": (9.15, 40.49), "MMR": (16.87, 96.08), "HTI": (18.97, -72.29),
    "NGA": (9.08, 8.68), "MLI": (17.57, -3.99), "BFA": (12.36, -1.53),
    "CAF": (6.61, 20.94), "TCD": (15.45, 18.73), "MOZ": (-18.67, 35.53),
    "UKR": (48.38, 31.17), "PAK": (30.38, 69.35), "IRQ": (33.22, 43.68),
}


def _severity_from_score(score: float) -> SeverityLevel:
    if score >= 4.5:
        return SeverityLevel.critical
    if score >= 3.5:
        return SeverityLevel.high
    if score >= 2.5:
        return SeverityLevel.medium
    return SeverityLevel.low


class ACAPSWorker(FeedWorker):
    source_id = "acaps"
    display_name = "ACAPS Crisis Severity"
    category = FeedCategory.humanitarian
    refresh_interval = 21600
    _api_url = "https://api.acaps.org/api/v1/inform-severity-index/"

    async def fetch(self) -> list[GeoEvent]:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(self._api_url, params={"format": "json", "limit": 50, "ordering": "-overall_severity"})
                if resp.status_code in (401, 403, 404):
                    logger.warning("acaps_api_auth_failed", extra={"status": resp.status_code})
                    return []
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.warning("acaps_fetch_failed", extra={"error": str(exc)})
            return []

        events: list[GeoEvent] = []
        for item in (data.get("results") or data if isinstance(data, list) else [])[:30]:
            country = item.get("country", {})
            iso3 = country.get("iso3", "") if isinstance(country, dict) else ""
            name = country.get("name", iso3) if isinstance(country, dict) else str(country)
            score = float(item.get("overall_severity", 0) or 0)
            if score < 2.0:
                continue
            lat, lng = _COUNTRY_COORDS.get(iso3, (0.0, 0.0))
            events.append(GeoEvent(
                source_id=self.source_id,
                title=f"Humanitarian crisis: {name} (severity {score:.1f}/5)",
                body=f"ACAPS INFORM Severity Index: {name} rated {score:.2f}/5. Indicator of acute humanitarian need.",
                category=FeedCategory.humanitarian,
                severity=_severity_from_score(score),
                lat=lat,
                lng=lng,
                event_time=datetime.now(timezone.utc),
            ))

        return events

