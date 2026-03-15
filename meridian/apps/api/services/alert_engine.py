"""Alert rule engine — evaluates rules against incoming events and dispatches delivery."""
import asyncio
import ipaddress
import logging
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
import orjson
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from core.config import get_settings
from core.redis_client import get_redis
from models.alert import AlertRule, AlertNotification

logger = logging.getLogger(__name__)

settings = get_settings()

# ── Throttle & dedup cache ─────────────────────────────────────────────────
# Maps rule_id → last_fired_epoch. Prevents the same rule from firing more
# than once within MIN_FIRE_INTERVAL_SECONDS.
_rule_last_fired: dict[int, float] = {}
MIN_FIRE_INTERVAL_SECONDS = 300  # 5-minute cooldown per rule

# Maps (rule_id, source_event_id) → True. Prevents the same event from
# triggering the same rule twice.
_dedup_cache: dict[tuple[int, str], float] = {}
_DEDUP_TTL = 3600  # 1 hour

# ── Rule cache ─────────────────────────────────────────────────────────────
# Caches active rules for 30s to avoid per-event DB queries under burst.
_rules_cache: list[AlertRule] = []
_rules_cache_time: float = 0
_RULES_CACHE_TTL = 30  # seconds

# ── Webhook URL validation (SSRF prevention) ──────────────────────────────

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _is_safe_webhook_url(url: str) -> bool:
    """Validate that a webhook URL is safe to POST to (no SSRF)."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    # Require https
    if parsed.scheme not in ("https",):
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    # Block common internal hostnames
    if hostname in ("localhost", "metadata.google.internal"):
        return False

    # Resolve hostname and check against blocked networks
    import socket
    try:
        addrs = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in addrs:
            ip = ipaddress.ip_address(sockaddr[0])
            for net in _BLOCKED_NETWORKS:
                if ip in net:
                    return False
    except socket.gaierror:
        return False

    return True


# ---------------------------------------------------------------------------
# Rule condition evaluators
# ---------------------------------------------------------------------------

def _evaluate_rule(rule: AlertRule, event: dict) -> bool:
    """Return True if event matches the rule's condition."""
    ctype = rule.condition_type
    params: dict = rule.condition_params or {}

    if ctype == "category":
        return event.get("category") == params.get("category")

    elif ctype == "severity":
        levels = ["info", "low", "medium", "high", "critical"]
        min_sev = params.get("min_severity", "medium")
        event_sev = event.get("severity", "info")
        try:
            return levels.index(event_sev) >= levels.index(min_sev)
        except ValueError:
            return False

    elif ctype == "keyword":
        keyword = (params.get("keyword") or "").lower()
        text = f"{event.get('title', '')} {event.get('body', '')}".lower()
        return keyword in text

    elif ctype == "source":
        return event.get("source_id") == params.get("source_id")

    elif ctype == "region_bbox":
        lat = event.get("lat")
        lng = event.get("lng")
        if lat is None or lng is None:
            return False
        return (
            params.get("min_lat", -90) <= lat <= params.get("max_lat", 90)
            and params.get("min_lng", -180) <= lng <= params.get("max_lng", 180)
        )

    elif ctype == "composite":
        conditions: list[dict] = params.get("conditions", [])
        op = params.get("operator", "and").lower()
        results = [_evaluate_single_condition(c, event) for c in conditions]
        return all(results) if op == "and" else any(results)

    return False


def _evaluate_single_condition(cond: dict, event: dict) -> bool:
    """Evaluate a single composite condition entry."""
    mock_rule = type("MockRule", (), {
        "condition_type": cond.get("type"),
        "condition_params": cond.get("params", {}),
    })()
    return _evaluate_rule(mock_rule, event)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Delivery: Email via SendGrid
# ---------------------------------------------------------------------------

async def _send_email(to: str, subject: str, body: str) -> None:
    if not settings.sendgrid_api_key:
        logger.debug("sendgrid_api_key not set, skipping email delivery")
        return
    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": settings.email_from},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {settings.sendgrid_api_key}",
                    "Content-Type": "application/json",
                },
                content=orjson.dumps(payload),
            )
            if resp.status_code not in (200, 202):
                logger.warning(f"sendgrid_failed status={resp.status_code} body={resp.text[:200]}")
            else:
                logger.info(f"email_sent to={to}")
        except Exception as e:
            logger.error(f"email_error: {e}")


# ---------------------------------------------------------------------------
# Delivery: Webhook
# ---------------------------------------------------------------------------

async def _dispatch_webhook(url: str, payload: dict) -> None:
    if not _is_safe_webhook_url(url):
        logger.warning(f"webhook_blocked_ssrf url={url}")
        return

    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(3):
            try:
                resp = await client.post(
                    url,
                    content=orjson.dumps(payload),
                    headers={"Content-Type": "application/json", "X-Meridian-Event": "alert"},
                )
                if resp.status_code < 400:
                    logger.info(f"webhook_dispatched url={url} status={resp.status_code}")
                    return
                if resp.status_code < 500:
                    # Client error (4xx) — don't retry, it won't help
                    logger.warning(f"webhook_client_error url={url} status={resp.status_code}")
                    return
                logger.warning(f"webhook_retry attempt={attempt+1} status={resp.status_code}")
            except (httpx.ConnectError, httpx.TimeoutException, httpx.ReadTimeout) as e:
                logger.warning(f"webhook_transient_error attempt={attempt+1} url={url} error={e}")
            except Exception as e:
                logger.warning(f"webhook_error attempt={attempt+1} url={url} error={e}")
                return  # Unknown error — don't retry
            await asyncio.sleep(2 ** attempt)
    logger.error(f"webhook_exhausted url={url} — all retries failed")


# ---------------------------------------------------------------------------
# Per-event alert evaluation loop
# ---------------------------------------------------------------------------

async def _process_event(event: dict, db: AsyncSession) -> None:
    """Evaluate all active rules against a single event and dispatch deliveries."""
    global _rules_cache, _rules_cache_time

    now_mono = time.monotonic()
    if now_mono - _rules_cache_time > _RULES_CACHE_TTL or not _rules_cache:
        result = await db.execute(
            select(AlertRule).where(AlertRule.is_active == True)  # noqa: E712
        )
        _rules_cache = list(result.scalars().all())
        _rules_cache_time = now_mono

    rules = _rules_cache

    now = time.monotonic()

    # Periodic cleanup of stale dedup entries (every evaluation cycle is fine)
    stale_keys = [k for k, t in _dedup_cache.items() if now - t > _DEDUP_TTL]
    for k in stale_keys:
        del _dedup_cache[k]

    has_changes = False

    for rule in rules:
        if not _evaluate_rule(rule, event):
            continue

        # Throttle: skip if this rule fired recently
        last_fired = _rule_last_fired.get(rule.id, 0)
        if now - last_fired < MIN_FIRE_INTERVAL_SECONDS:
            continue

        # Dedup: skip if this exact (rule, event) pair already fired
        event_id = str(event.get("id", ""))
        dedup_key = (rule.id, event_id)
        if event_id and dedup_key in _dedup_cache:
            continue

        _rule_last_fired[rule.id] = now
        if event_id:
            _dedup_cache[dedup_key] = now

        channels: list[str] = rule.delivery_channels or ["in_app"]
        title = f"Alert: {rule.name}"
        body = (
            f"Triggered by: {event.get('title', 'Unknown event')}\n"
            f"Source: {event.get('source_id', '')}\n"
            f"Severity: {event.get('severity', '')}\n"
            f"Time: {event.get('event_time', '')}"
        )

        # In-app notification
        if "in_app" in channels:
            notif = AlertNotification(
                user_id=rule.user_id,
                rule_id=rule.id,
                title=title,
                body=body,
                severity=event.get("severity", "medium"),
                source_event_id=str(event.get("id", "")),
            )
            db.add(notif)
            has_changes = True

        # Email
        if "email" in channels and rule.email_to:
            asyncio.create_task(_send_email(rule.email_to, title, body))

        # Webhook
        if "webhook" in channels and rule.webhook_url:
            webhook_payload: dict[str, Any] = {
                "alert_rule": rule.name,
                "alert_rule_id": rule.id,
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "event": event,
            }
            asyncio.create_task(_dispatch_webhook(rule.webhook_url, webhook_payload))

        # Update trigger stats (atomic DB-level increment)
        await db.execute(
            update(AlertRule)
            .where(AlertRule.id == rule.id)
            .values(
                trigger_count=AlertRule.trigger_count + 1,
                last_triggered=datetime.now(timezone.utc),
            )
        )
        has_changes = True

    if has_changes:
        await db.commit()


# ---------------------------------------------------------------------------
# Main background loop — subscribes to Redis and processes events
# ---------------------------------------------------------------------------

# Module-level engine ref for proper cleanup
_alert_engine_instance = None


async def run_alert_engine() -> None:
    """Background task: subscribes to Redis meridian:events and evaluates rules."""
    global _alert_engine_instance
    engine = create_async_engine(settings.database_url, pool_size=3, max_overflow=2)
    _alert_engine_instance = engine
    Session = async_sessionmaker(engine, expire_on_commit=False)

    logger.info("alert_engine_started")

    while True:
        try:
            r = await get_redis()
            pubsub = r.pubsub()
            await pubsub.subscribe("meridian:events")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    event = orjson.loads(message["data"])
                    async with Session() as db:
                        await _process_event(event, db)
                except Exception as e:
                    logger.error(f"alert_engine_process_error: {e}")

        except Exception as e:
            logger.error(f"alert_engine_redis_error: {e}")
            await asyncio.sleep(5)


async def dispose_alert_engine() -> None:
    """Dispose the alert engine's DB connection pool. Call on shutdown."""
    global _alert_engine_instance
    if _alert_engine_instance:
        await _alert_engine_instance.dispose()
        _alert_engine_instance = None
