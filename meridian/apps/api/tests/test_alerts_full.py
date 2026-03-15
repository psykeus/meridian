"""
Comprehensive tests for routers/alerts.py — Alert rules CRUD, notifications,
toggle, and delivery channel validation. Uses mocked DB — no PostgreSQL.
"""
import sys
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.database import get_db
from core.security import create_access_token, hash_password
from routers import alerts

pytestmark = pytest.mark.asyncio

_bcrypt_works = True
try:
    hash_password("probe")
except (ValueError, RuntimeError):
    _bcrypt_works = False
needs_bcrypt = pytest.mark.skipif(not _bcrypt_works, reason="passlib/bcrypt incompatible")

TOKEN = create_access_token(1, "test@example.com")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def _mock_user(id=1):
    user = MagicMock()
    user.id = id
    user.email = "test@example.com"
    user.is_active = True
    user.tier = "free"
    return user


def _build_app(db_mock, user=None):
    app = FastAPI()
    app.include_router(alerts.router, prefix="/api/v1")

    async def override_get_db():
        yield db_mock

    app.dependency_overrides[get_db] = override_get_db
    if user:
        app.dependency_overrides[alerts.get_current_user] = lambda: user
    return app


def _mock_rule(id=1, user_id=1, is_active=True):
    rule = MagicMock()
    rule.id = id
    rule.user_id = user_id
    rule.name = "Test Rule"
    rule.description = "Test"
    rule.is_active = is_active
    rule.condition_type = "category"
    rule.condition_params = {"category": "military"}
    rule.delivery_channels = ["in_app"]
    rule.webhook_url = None
    rule.email_to = None
    rule.trigger_count = 0
    rule.last_triggered = None
    rule.created_at = datetime.now(timezone.utc)
    return rule


def _mock_notification(id=1, is_read=False):
    n = MagicMock()
    n.id = id
    n.user_id = 1
    n.rule_id = 1
    n.title = "Alert triggered"
    n.body = "Military event detected"
    n.severity = "high"
    n.source_event_id = "event_123"
    n.is_read = is_read
    n.created_at = datetime.now(timezone.utc)
    return n


# ── Alert Rules CRUD ─────────────────────────────────────────────────────────

@needs_bcrypt
class TestAlertRulesCRUD:
    async def test_list_rules_returns_200(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/alerts/rules", headers=HEADERS)
        assert resp.status_code == 200

    async def test_create_category_rule(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result

        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/rules", json={
                "name": "Military Alert",
                "condition_type": "category",
                "condition_params": {"category": "military"},
                "delivery_channels": ["in_app"],
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_severity_rule(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/rules", json={
                "name": "High Severity",
                "condition_type": "severity",
                "condition_params": {"min_severity": "high"},
                "delivery_channels": ["in_app", "email"],
                "email_to": "ops@example.com",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_keyword_rule(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/rules", json={
                "name": "Keyword Watch",
                "condition_type": "keyword",
                "condition_params": {"keyword": "nuclear"},
                "delivery_channels": ["in_app"],
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_region_bbox_rule(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/rules", json={
                "name": "Middle East Region",
                "condition_type": "region_bbox",
                "condition_params": {
                    "lat_min": 12.0, "lat_max": 42.0,
                    "lng_min": 25.0, "lng_max": 63.0,
                },
                "delivery_channels": ["in_app", "webhook"],
                "webhook_url": "https://hooks.example.com/alerts",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_composite_rule(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/rules", json={
                "name": "Composite Rule",
                "condition_type": "composite",
                "condition_params": {
                    "operator": "AND",
                    "conditions": [
                        {"type": "category", "category": "cyber"},
                        {"type": "severity", "min_severity": "high"},
                    ],
                },
                "delivery_channels": ["in_app"],
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_rule_missing_name_returns_422(self):
        user = _mock_user()
        db = AsyncMock()
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/rules", json={
                "condition_type": "category",
                "condition_params": {"category": "military"},
                "delivery_channels": ["in_app"],
            }, headers=HEADERS)
        assert resp.status_code == 422

    async def test_toggle_rule(self):
        user = _mock_user()
        rule = _mock_rule(is_active=True)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = rule
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.patch("/api/v1/alerts/rules/1/toggle", headers=HEADERS)
        assert resp.status_code == 200

    async def test_delete_rule(self):
        user = _mock_user()
        rule = _mock_rule()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = rule
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete("/api/v1/alerts/rules/1", headers=HEADERS)
        assert resp.status_code == 204

    async def test_delete_nonexistent_rule_returns_404(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete("/api/v1/alerts/rules/999", headers=HEADERS)
        assert resp.status_code == 404

    async def test_unauthenticated_returns_401(self):
        db = AsyncMock()
        app = _build_app(db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/alerts/rules")
        assert resp.status_code in (401, 403)


# ── Notifications ────────────────────────────────────────────────────────────

@needs_bcrypt
class TestNotifications:
    async def test_list_notifications_returns_200(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/alerts/notifications", headers=HEADERS)
        assert resp.status_code == 200

    async def test_unread_count_returns_200(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = 5
        result.scalar.return_value = 5
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/alerts/notifications/unread-count", headers=HEADERS)
        assert resp.status_code == 200

    async def test_mark_all_read_returns_204(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/notifications/read-all", headers=HEADERS)
        assert resp.status_code == 204

    async def test_mark_single_read_returns_204(self):
        user = _mock_user()
        notif = _mock_notification()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = notif
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/alerts/notifications/1/read", headers=HEADERS)
        assert resp.status_code == 204
