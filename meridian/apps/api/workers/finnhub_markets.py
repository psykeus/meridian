"""Finnhub — real-time market data and financial news."""
import hashlib
import logging
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from core.credential_store import get_credential

logger = logging.getLogger(__name__)

_QUOTE_URL = "https://finnhub.io/api/v1/quote"
_NEWS_URL = "https://finnhub.io/api/v1/news"

# Major indices: (symbol, display_name, lat, lng)
# Coordinates correspond to the physical exchange location
_INDICES = [
    ("^GSPC",  "S&P 500",       40.71, -74.01),   # NYSE, New York
    ("^DJI",   "Dow Jones",     40.71, -74.01),   # NYSE, New York
    ("^IXIC",  "NASDAQ",        40.71, -74.01),   # NASDAQ, New York
    ("^FTSE",  "FTSE 100",      51.51,  -0.13),   # London Stock Exchange
    ("^N225",  "Nikkei 225",    35.68, 139.69),   # Tokyo Stock Exchange
]

# Financial center coords for news events that lack geographic specificity
_DEFAULT_NEWS_COORDS = (40.71, -74.01)  # New York (global financial hub)


def _pct_to_severity(pct: float) -> SeverityLevel:
    """Map absolute percent change to severity."""
    abs_pct = abs(pct)
    if abs_pct > 3.0:
        return SeverityLevel.high
    if abs_pct > 1.5:
        return SeverityLevel.medium
    return SeverityLevel.low


class FinnhubMarketsWorker(FeedWorker):
    """Fetches real-time quotes for major indices and general market news
    from Finnhub. Requires a FINNHUB_API_KEY credential."""

    source_id = "finnhub_markets"
    display_name = "Finnhub Market Data"
    category = FeedCategory.finance
    refresh_interval = 300  # 5 minutes

    async def fetch(self) -> list[GeoEvent]:
        api_key = get_credential("FINNHUB_API_KEY")
        if not api_key:
            logger.warning("finnhub_no_api_key — set FINNHUB_API_KEY to enable Finnhub market data")
            return []

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)

        async with httpx.AsyncClient(timeout=20) as client:
            # ── Index quotes ───────────────────────────────────────────
            for symbol, label, lat, lng in _INDICES:
                try:
                    resp = await client.get(
                        _QUOTE_URL,
                        params={"symbol": symbol, "token": api_key},
                    )
                    resp.raise_for_status()
                    q = resp.json()

                    current = q.get("c", 0)       # current price
                    prev_close = q.get("pc", 0)    # previous close
                    high = q.get("h", 0)           # day high
                    low = q.get("l", 0)            # day low
                    open_price = q.get("o", 0)     # open price

                    if not current or not prev_close:
                        continue

                    pct_change = ((current - prev_close) / prev_close) * 100
                    severity = _pct_to_severity(pct_change)
                    direction = "▲" if pct_change >= 0 else "▼"

                    title = f"{label} ({symbol}) {direction} {pct_change:+.2f}%"
                    body = (
                        f"Current: {current:,.2f} | Open: {open_price:,.2f} | "
                        f"High: {high:,.2f} | Low: {low:,.2f} | "
                        f"Prev Close: {prev_close:,.2f}"
                    )

                    events.append(GeoEvent(
                        id=f"fh_{symbol}_{now.strftime('%Y%m%d%H')}",
                        source_id=self.source_id,
                        category=self.category,
                        severity=severity,
                        title=title,
                        body=body,
                        lat=lat,
                        lng=lng,
                        event_time=now,
                        metadata={
                            "symbol": symbol,
                            "label": label,
                            "current": current,
                            "previous_close": prev_close,
                            "open": open_price,
                            "high": high,
                            "low": low,
                            "change_pct": round(pct_change, 4),
                        },
                    ))
                except Exception:
                    continue

            # ── Market news ────────────────────────────────────────────
            try:
                resp = await client.get(
                    _NEWS_URL,
                    params={"category": "general", "token": api_key},
                )
                resp.raise_for_status()
                articles = resp.json()

                for article in (articles or [])[:10]:
                    headline = article.get("headline", "").strip()
                    if not headline:
                        continue

                    news_id = article.get("id") or hashlib.md5(headline.encode()).hexdigest()[:12]
                    summary = (article.get("summary") or "")[:400]
                    source = article.get("source", "")
                    url = article.get("url", "")
                    ts = article.get("datetime", 0)
                    event_time = (
                        datetime.fromtimestamp(ts, tz=timezone.utc)
                        if ts
                        else now
                    )

                    events.append(GeoEvent(
                        id=f"fh_news_{news_id}",
                        source_id=self.source_id,
                        category=self.category,
                        subcategory="market_news",
                        severity=SeverityLevel.info,
                        title=f"[{source}] {headline[:180]}",
                        body=summary or None,
                        lat=_DEFAULT_NEWS_COORDS[0],
                        lng=_DEFAULT_NEWS_COORDS[1],
                        event_time=event_time,
                        url=url or None,
                        metadata={
                            "source": source,
                            "news_id": news_id,
                            "category": article.get("category", ""),
                            "related": article.get("related", ""),
                        },
                    ))
            except Exception:
                logger.debug("finnhub_news_fetch_failed", exc_info=True)

        return events
