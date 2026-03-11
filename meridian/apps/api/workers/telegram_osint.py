"""Telegram OSINT — public OSINT channel monitoring via Bot API."""
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

OSINT_CHANNELS = [
    ("@IntelSlava", "Intel Slava", 50.45, 30.52),
    ("@wartranslated", "War Translated", 50.45, 30.52),
    ("@GeoConfirmed", "GeoConfirmed", 52.52, 13.41),
    ("@OSINTua", "OSINT Ukraine", 50.45, 30.52),
    ("@conflicts", "Conflicts Monitor", 0.0, 30.0),
]


class TelegramOSINTWorker(FeedWorker):
    source_id = "telegram_osint"
    display_name = "Telegram OSINT Channels"
    category = FeedCategory.geopolitical
    refresh_interval = 900  # 15 min

    async def fetch(self) -> list[GeoEvent]:
        import os
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        if not bot_token:
            return self._placeholder()

        events: list[GeoEvent] = []
        async with httpx.AsyncClient(timeout=20) as client:
            for channel_id, label, lat, lng in OSINT_CHANNELS:
                try:
                    url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
                    resp = await client.get(url, params={"allowed_updates": ["channel_post"]})
                    if not resp.is_success:
                        continue
                    data = resp.json()
                    for update in (data.get("result") or [])[:5]:
                        post = update.get("channel_post", {})
                        chat = post.get("chat", {})
                        if chat.get("username", "") != channel_id.lstrip("@"):
                            continue
                        text = post.get("text", "")
                        msg_id = post.get("message_id", "")
                        date_ts = post.get("date", 0)
                        if not text:
                            continue
                        event_time = datetime.fromtimestamp(date_ts, tz=timezone.utc)
                        events.append(GeoEvent(
                            id=f"tg_{channel_id}_{msg_id}",
                            source_id=self.source_id,
                            category=self.category,
                            severity=SeverityLevel.medium,
                            title=f"OSINT [{label}]: {text[:80]}{'…' if len(text) > 80 else ''}",
                            body=text[:400],
                            lat=lat, lng=lng,
                            event_time=event_time.isoformat(),
                            url=f"https://t.me/{channel_id.lstrip('@')}",
                            metadata={"channel": channel_id, "label": label, "msg_id": msg_id},
                        ))
                except Exception:
                    continue

        return events or self._placeholder()

    def _placeholder(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        return [GeoEvent(
            id=f"tg_status_{now.strftime('%Y%m%d%H')}",
            source_id=self.source_id,
            category=self.category,
            severity=SeverityLevel.low,
            title="Telegram OSINT: Channel monitoring ready",
            body="Configure TELEGRAM_BOT_TOKEN to enable live monitoring of public OSINT Telegram channels.",
            lat=52.52, lng=13.41,
            event_time=now.isoformat(),
            url="https://core.telegram.org/bots",
            metadata={"channels": [c[0] for c in OSINT_CHANNELS]},
        )]
