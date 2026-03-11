"""CoinGecko — top 10 cryptocurrency prices and market data."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

_LAT, _LNG = 1.3521, 103.8198  # Singapore — crypto hub

TOP_IDS = "bitcoin,ethereum,tether,binancecoin,solana,ripple,usd-coin,steth,dogecoin,cardano"


class CoinGeckoWorker(FeedWorker):
    source_id = "coingecko"
    display_name = "CoinGecko — Cryptocurrency Markets"
    category = FeedCategory.finance
    refresh_interval = 60

    _URL = "https://api.coingecko.com/api/v3/coins/markets"

    async def fetch(self) -> list[GeoEvent]:
        params = {
            "vs_currency": "usd",
            "ids": TOP_IDS,
            "order": "market_cap_desc",
            "per_page": 10,
            "page": 1,
            "sparkline": False,
            "price_change_percentage": "24h",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(self._URL, params=params)
            if resp.status_code == 429:
                return []
            resp.raise_for_status()
            coins = resp.json()

        events: list[GeoEvent] = []
        now = datetime.now(timezone.utc)
        for coin in coins:
            cid = coin.get("id", "")
            symbol = coin.get("symbol", "").upper()
            price = coin.get("current_price", 0)
            change_24h = coin.get("price_change_percentage_24h") or 0
            market_cap = coin.get("market_cap", 0)
            volume = coin.get("total_volume", 0)

            severity = SeverityLevel.medium if abs(change_24h) > 10 else SeverityLevel.low
            direction = "▲" if change_24h >= 0 else "▼"

            events.append(GeoEvent(
                id=f"crypto_{cid}_{now.strftime('%Y%m%d%H%M')}",
                source_id=self.source_id,
                category=self.category,
                severity=severity,
                title=f"{symbol} ${price:,.2f} {direction}{abs(change_24h):.1f}% (24h)",
                body=f"Market cap: ${market_cap / 1e9:.1f}B · 24h volume: ${volume / 1e9:.1f}B",
                lat=_LAT, lng=_LNG,
                event_time=now.isoformat(),
                url=f"https://www.coingecko.com/en/coins/{cid}",
                metadata={"coin_id": cid, "symbol": symbol, "price_usd": price, "change_24h_pct": round(change_24h, 2), "market_cap": market_cap},
            ))
        return events
