"""
Tests for routers/orgs.py, tokens.py, credentials.py.
Covers organization CRUD, API token lifecycle, and credential store endpoints.
Uses mocked DB — no PostgreSQL required.
"""
import sys
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.database import get_db
from core.security import create_access_token, hash_password
from routers import orgs, tokens, credentials

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


# ── Organizations ────────────────────────────────────────────────────────────

def _build_org_app(db_mock, user=None):
    app = FastAPI()
    app.include_router(orgs.router, prefix="/api/v1")
    async def override():
        yield db_mock
    app.dependency_overrides[get_db] = override
    if user:
        app.dependency_overrides[orgs.get_current_user] = lambda: user
    return app


def _mock_org(id=1, name="TestOrg", slug="test-org", owner_id=1):
    org = MagicMock()
    org.id = id
    org.name = name
    org.slug = slug
    org.tier = "free"
    org.owner_id = owner_id
    org.stripe_customer_id = None
    org.stripe_subscription_id = None
    org.subscription_status = None
    org.max_members = 5
    org.created_at = datetime.now(timezone.utc)
    return org


@needs_bcrypt
class TestOrganizations:
    async def test_create_org_returns_201(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None  # no existing slug
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_org_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/orgs/", json={
                "name": "My Org",
                "slug": "my-org",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_org_invalid_slug_returns_422(self):
        user = _mock_user()
        db = AsyncMock()
        app = _build_org_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/orgs/", json={
                "name": "Org",
                "slug": "AB",  # too short / uppercase
            }, headers=HEADERS)
        assert resp.status_code == 422

    async def test_list_orgs_returns_200(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_org_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/orgs/", headers=HEADERS)
        assert resp.status_code == 200

    async def test_get_org_returns_200(self):
        user = _mock_user()
        org = _mock_org()
        member = MagicMock()
        member.org_id = 1
        member.user_id = 1
        member.role = "owner"
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.side_effect = [org, member]
        result.scalars.return_value.all.return_value = [org]
        db.execute.return_value = result
        app = _build_org_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/orgs/1", headers=HEADERS)
        assert resp.status_code == 200

    async def test_unauthenticated_returns_401(self):
        db = AsyncMock()
        app = _build_org_app(db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/orgs/")
        assert resp.status_code in (401, 403)


# ── API Tokens ───────────────────────────────────────────────────────────────

def _build_token_app(db_mock, user=None):
    app = FastAPI()
    app.include_router(tokens.router, prefix="/api/v1")
    async def override():
        yield db_mock
    app.dependency_overrides[get_db] = override
    if user:
        app.dependency_overrides[tokens.get_current_user] = lambda: user
    return app


@needs_bcrypt
class TestAPITokens:
    async def test_list_tokens_returns_200(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_token_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/tokens/", headers=HEADERS)
        assert resp.status_code == 200

    async def test_create_read_token(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_token_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/tokens/", json={
                "name": "CI Read Token",
                "scope": "read",
            }, headers=HEADERS)
        assert resp.status_code == 201
        data = resp.json()
        assert "raw_token" in data or "token" in data

    async def test_create_write_token(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_token_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/tokens/", json={
                "name": "Deploy Token",
                "scope": "write",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_revoke_token(self):
        user = _mock_user()
        mock_token = MagicMock()
        mock_token.id = 1
        mock_token.user_id = 1
        mock_token.is_active = True
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = mock_token
        db.execute.return_value = result
        app = _build_token_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete("/api/v1/tokens/1", headers=HEADERS)
        assert resp.status_code == 204

    async def test_create_token_missing_name_returns_422(self):
        user = _mock_user()
        db = AsyncMock()
        app = _build_token_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/tokens/", json={
                "scope": "read",
            }, headers=HEADERS)
        assert resp.status_code == 422


# ── Credentials ──────────────────────────────────────────────────────────────

def _mock_user():
    user = MagicMock()
    user.id = 1
    user.email = "test@example.com"
    user.is_active = True
    return user


def _build_cred_app():
    from routers.auth import get_current_user
    from routers.credentials import _require_user_or_service
    app = FastAPI()
    app.include_router(credentials.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = _mock_user
    app.dependency_overrides[_require_user_or_service] = lambda: None
    return app


class TestCredentials:
    async def test_list_configured_returns_200(self):
        app = _build_cred_app()
        with patch("routers.credentials.list_configured", return_value=["OPENSKY_USERNAME"]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/credentials")
        assert resp.status_code == 200
        assert "configured" in resp.json()

    async def test_save_credentials_returns_200(self):
        app = _build_cred_app()
        with patch("routers.credentials.set_credential", new_callable=AsyncMock):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.put("/api/v1/credentials", json={
                    "OPENSKY_USERNAME": "myuser",
                    "OPENSKY_PASSWORD": "mypass",
                })
        assert resp.status_code == 200
        assert "saved" in resp.json()

    async def test_check_single_key_configured(self):
        app = _build_cred_app()
        with patch("routers.credentials.get_credential", return_value="some_value"):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/credentials/OPENSKY_USERNAME/configured")
        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == "OPENSKY_USERNAME"
        assert data["configured"] is True

    async def test_check_single_key_not_configured(self):
        app = _build_cred_app()
        with patch("routers.credentials.get_credential", return_value=""):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/credentials/MISSING_KEY/configured")
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is False
