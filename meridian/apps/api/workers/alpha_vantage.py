import logging
import httpx
from datetime import datetime, timezone
from typing import List
from core.credential_store import get_credential
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

logger = logging.getLogger(__name__)

_SYMBOLS = [
    ("SPY",  "S&P 500 ETF",    38.9, -77.0),
    ("QQQ",  "Nasdaq-100 ETF", 40.7, -74.0),
    ("GLD",  "Gold",           51.5,  -0.1),
    ("USO",  "WTI Crude Oil",  29.7, -95.4),
    ("EURUSD", "EUR/USD Forex", 48.8, 2.35),
    ("BTCUSD", "Bitcoin",      37.7, -122.4),
]

_MOVE_SEVERITY = [
    (5.0, SeverityLevel.critical),
    (3.0, SeverityLevel.high),
    (1.5, SeverityLevel.medium),
    (0.5, SeverityLevel.low),
    (0.0, SeverityLevel.info),
]


def _pct_severity(pct: float) -> SeverityLevel:
    for threshold, sev in _MOVE_SEVERITY:
        if abs(pct) >= threshold:
            return sev
    return SeverityLevel.info


class AlphaVantageWorker(FeedWorker):
    """Alpha Vantage — equity and forex quotes with significant move detection."""

    source_id = "alpha_vantage"
    display_name = "Alpha Vantage Markets"
    category = FeedCategory.finance
    refresh_interval = 300  # 5 minutes

    async def fetch(self) -> List[GeoEvent]:
        api_key = get_credential("ALPHA_VANTAGE_API_KEY") or "demo"
        if api_key == "demo":
            logger.warning("alpha_vantage_demo_key — rate-limited to 5 calls/day. Set ALPHA_VANTAGE_API_KEY for production use.")
        events: List[GeoEvent] = []
        now = datetime.now(timezone.utc)

        async with httpx.AsyncClient(timeout=20) as client:
            for symbol, label, lat, lng in _SYMBOLS:
                try:
                    if "/" in symbol or symbol.endswith("USD"):
                        from_sym = symbol[:3]
                        to_sym = symbol[3:]
                        resp = await client.get(
                            "https://www.alphavantage.co/query",
                            params={
                                "function": "CURRENCY_EXCHANGE_RATE",
                                "from_currency": from_sym,
                                "to_currency": to_sym,
                                "apikey": api_key,
                            },
                        )
                        resp.raise_for_status()
                        d = resp.json().get("Realtime Currency Exchange Rate", {})
                        price = float(d.get("5. Exchange Rate", 0))
                        pct = 0.0
                    else:
                        resp = await client.get(
                            "https://www.alphavantage.co/query",
                            params={
                                "function": "GLOBAL_QUOTE",
                                "symbol": symbol,
                                "apikey": api_key,
                            },
                        )
                        resp.raise_for_status()
                        q = resp.json().get("Global Quote", {})
                        price = float(q.get("05. price", 0))
                        pct = float(q.get("10. change percent", "0").replace("%", "").strip() or 0)

                    if price == 0:
                        continue

                    severity = _pct_severity(pct)
                    direction = "▲" if pct >= 0 else "▼"
                    title = f"{label} ({symbol}) {direction} {pct:+.2f}%" if pct != 0 else f"{label} ({symbol}) ${price:.2f}"

                    events.append(GeoEvent(
                        id=f"av_{symbol}_{datetime.now(timezone.utc).strftime('%Y%m%d%H')}",
                        source_id=self.source_id,
                        category=self.category,
                        severity=severity,
                        title=title,
                        body=f"Price: {price:.4f}" + (f" | Change: {pct:+.2f}%" if pct else ""),
                        lat=lat,
                        lng=lng,
                        event_time=now,
                        metadata={"symbol": symbol, "price": price, "change_pct": pct},
                    ))
                except Exception:
                    continue

        return events
