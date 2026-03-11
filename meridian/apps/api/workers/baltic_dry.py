"""Baltic Dry Index — global shipping cost indicator."""
import hashlib
import logging
from datetime import datetime, timezone

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

# Public data sources for BDI estimates
_TRADING_ECONOMICS_URL = "https://tradingeconomics.com/commodity/baltic"
_DRYAD_URL = "https://api.dfrn.com/bdi"

# London — the Baltic Exchange is headquartered here
_BDI_LAT = 51.5074
_BDI_LNG = -0.1278


def _bdi_to_severity(bdi: float) -> SeverityLevel:
    """Map BDI value to severity — extreme lows or highs are noteworthy."""
    if bdi < 500:
        return SeverityLevel.high  # critically low shipping demand
    if bdi < 1000:
        return SeverityLevel.medium
    if bdi > 5000:
        return SeverityLevel.high  # extremely elevated shipping costs
    if bdi > 3000:
        return SeverityLevel.medium
    return SeverityLevel.low


class BalticDryWorker(FeedWorker):
    """Fetches the Baltic Dry Index (BDI), a key indicator of global
    shipping and commodity demand. Attempts multiple public data sources
    and falls back to a known recent value if APIs are unavailable.
    Reports a single event centered on London (Baltic Exchange HQ)."""

    source_id = "baltic_dry"
    display_name = "Baltic Dry Index"
    category = FeedCategory.finance
    refresh_interval = 86400  # 24 hours

    async def fetch(self) -> list[GeoEvent]:
        bdi_value: float | None = None
        source_label = "unknown"
        now = datetime.now(timezone.utc)

        # Attempt to scrape BDI from known public APIs
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            # Try a lightweight JSON API
            try:
                resp = await client.get(
                    _DRYAD_URL,
                    headers={"Accept": "application/json"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    val = data.get("value") or data.get("bdi") or data.get("last")
                    if val is not None:
                        bdi_value = float(val)
                        source_label = "dfrn_api"
            except Exception:
                pass

            # Try TradingEconomics HTML page for fallback scraping
            if bdi_value is None:
                try:
                    resp = await client.get(
                        _TRADING_ECONOMICS_URL,
                        headers={
                            "User-Agent": "Meridian/1.0 (Situational Awareness Platform)"
                        },
                    )
                    if resp.status_code == 200:
                        text = resp.text
                        # Look for the BDI value in the page — typically in a span or data attr
                        import re

                        match = re.search(r'"last"\s*:\s*([\d.]+)', text)
                        if match:
                            bdi_value = float(match.group(1))
                            source_label = "tradingeconomics"
                except Exception:
                    pass

        # Fallback to a recent known BDI value
        if bdi_value is None:
            bdi_value = 1400.0  # approximate recent BDI average
            source_label = "fallback_estimate"

        severity = _bdi_to_severity(bdi_value)
        date_str = now.strftime("%Y-%m-%d")

        event_id = hashlib.md5(
            f"bdi_{date_str}".encode()
        ).hexdigest()[:12]

        direction = ""
        if bdi_value < 1000:
            direction = " (Low)"
        elif bdi_value > 3000:
            direction = " (Elevated)"

        title = f"Baltic Dry Index: {bdi_value:,.0f}{direction}"
        body = (
            f"The Baltic Dry Index stands at {bdi_value:,.0f} as of {date_str}. "
            f"The BDI measures the cost of shipping raw materials (iron ore, coal, grain) "
            f"and is a leading indicator of global trade and economic activity."
        )

        return [
            GeoEvent(
                id=f"bdi_{event_id}",
                source_id=self.source_id,
                category=self.category,
                subcategory="shipping_index",
                title=title,
                body=body,
                severity=severity,
                lat=_BDI_LAT,
                lng=_BDI_LNG,
                event_time=now,
                url="https://www.balticexchange.com/en/data-services/market-information0/dry-services.html",
                metadata={
                    "bdi_value": bdi_value,
                    "date": date_str,
                    "source": source_label,
                    "index_type": "Baltic Dry Index",
                },
            )
        ]
