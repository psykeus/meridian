"""Alert rule engine — evaluates rules against incoming events and dispatches delivery."""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
import orjson
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from core.config import get_settings
from core.redis_client import get_redis
from models.alert import AlertRule, AlertNotification

logger = logging.getLogger(__name__)

settings = get_settings()

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
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(3):
            try:
                resp = await client.post(
                    url,
                    content=orjson.dumps(payload),
                    headers={"Content-Type": "application/json", "X-Meridian-Event": "alert"},
                )
                if resp.status_code < 500:
                    logger.info(f"webhook_dispatched url={url} status={resp.status_code}")
                    return
                logger.warning(f"webhook_retry attempt={attempt+1} status={resp.status_code}")
            except Exception as e:
                logger.warning(f"webhook_error attempt={attempt+1} url={url} error={e}")
            await asyncio.sleep(2 ** attempt)


# ---------------------------------------------------------------------------
# Per-event alert evaluation loop
# ---------------------------------------------------------------------------

async def _process_event(event: dict, db: AsyncSession) -> None:
    """Evaluate all active rules against a single event and dispatch deliveries."""
    result = await db.execute(
        select(AlertRule).where(AlertRule.is_active == True)  # noqa: E712
    )
    rules: list[AlertRule] = list(result.scalars().all())

    for rule in rules:
        if not _evaluate_rule(rule, event):
            continue

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

        # Update trigger stats
        await db.execute(
            update(AlertRule)
            .where(AlertRule.id == rule.id)
            .values(
                trigger_count=rule.trigger_count + 1,
                last_triggered=datetime.now(timezone.utc),
            )
        )

    await db.commit()


# ---------------------------------------------------------------------------
# Main background loop — subscribes to Redis and processes events
# ---------------------------------------------------------------------------

async def run_alert_engine() -> None:
    """Background task: subscribes to Redis meridian:events and evaluates rules."""
    engine = create_async_engine(settings.database_url, pool_size=3, max_overflow=2)
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
