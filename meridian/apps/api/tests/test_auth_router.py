"""
Tests for routers/auth.py — registration, login, token refresh, and protected
endpoints. Uses mocked DB sessions to run without PostgreSQL.
"""
import sys
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from jose import jwt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.database import get_db
from core.security import create_access_token, create_refresh_token, hash_password
from core.config import get_settings
from routers import auth

settings = get_settings()

pytestmark = pytest.mark.asyncio

# passlib + bcrypt >= 4.1 incompatibility on Python 3.13: skip auth tests that hash
_bcrypt_works = True
try:
    hash_password("probe")
except (ValueError, RuntimeError):
    _bcrypt_works = False

needs_bcrypt = pytest.mark.skipif(not _bcrypt_works, reason="passlib/bcrypt incompatible in this env")


# ── Fixtures ────────────────────────────────────────────────────────────────

def _make_user_obj(
    id=1,
    email="test@example.com",
    hashed_password=None,
    full_name="Test User",
    is_active=True,
    is_verified=False,
    tier="free",
    username=None,
    avatar_url=None,
    created_at=None,
    updated_at=None,
    last_login=None,
):
    """Build a mock User ORM object."""
    if hashed_password is None:
        hashed_password = hash_password("ValidPass123")
    if created_at is None:
        created_at = datetime.now(timezone.utc)
    if updated_at is None:
        updated_at = datetime.now(timezone.utc)

    user = MagicMock()
    user.id = id
    user.email = email
    user.hashed_password = hashed_password
    user.full_name = full_name
    user.is_active = is_active
    user.is_verified = is_verified
    user.tier = tier
    user.username = username
    user.avatar_url = avatar_url
    user.created_at = created_at
    user.updated_at = updated_at
    user.last_login = last_login
    return user


def _build_auth_app(db_mock):
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")

    async def override_get_db():
        yield db_mock

    app.dependency_overrides[get_db] = override_get_db
    return app


def _db_returning_user(user):
    """Mock DB that returns a user for any select query."""
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute.return_value = result
    return db


def _db_returning_none():
    """Mock DB that returns None (no user found)."""
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result
    return db


# ── Registration ─────────────────────────────────────────────────────────────

@needs_bcrypt
class TestRegister:
    async def test_register_success(self):
        db = _db_returning_none()  # no existing user
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/register", json={
                "email": "new@example.com",
                "password": "StrongPass123",
                "full_name": "New User",
            })

        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_email_returns_409(self):
        existing_user = _make_user_obj(email="exists@example.com")
        db = _db_returning_user(existing_user)
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/register", json={
                "email": "exists@example.com",
                "password": "StrongPass123",
            })

        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"]

    async def test_register_short_password_rejected(self):
        db = _db_returning_none()
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/register", json={
                "email": "x@y.com",
                "password": "short",
            })

        assert resp.status_code == 422  # pydantic validation

    async def test_register_invalid_email_rejected(self):
        db = _db_returning_none()
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/register", json={
                "email": "not-an-email",
                "password": "StrongPass123",
            })

        assert resp.status_code == 422

    async def test_register_missing_email_rejected(self):
        db = _db_returning_none()
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/register", json={
                "password": "StrongPass123",
            })

        assert resp.status_code == 422


# ── Login ────────────────────────────────────────────────────────────────────

@needs_bcrypt
class TestLogin:
    async def test_login_success(self):
        user = _make_user_obj(
            email="login@example.com",
            hashed_password=hash_password("CorrectPass123"),
        )
        db = _db_returning_user(user)
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/login", json={
                "email": "login@example.com",
                "password": "CorrectPass123",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "login@example.com"

    async def test_login_wrong_password(self):
        user = _make_user_obj(hashed_password=hash_password("CorrectPass123"))
        db = _db_returning_user(user)
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/login", json={
                "email": "test@example.com",
                "password": "WrongPass",
            })

        assert resp.status_code == 401

    async def test_login_nonexistent_user(self):
        db = _db_returning_none()
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/login", json={
                "email": "nobody@example.com",
                "password": "SomePass123",
            })

        assert resp.status_code == 401

    async def test_login_inactive_user_returns_403(self):
        user = _make_user_obj(
            is_active=False,
            hashed_password=hash_password("CorrectPass123"),
        )
        db = _db_returning_user(user)
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/login", json={
                "email": "test@example.com",
                "password": "CorrectPass123",
            })

        assert resp.status_code == 403


# ── Token refresh ────────────────────────────────────────────────────────────

@needs_bcrypt
class TestRefresh:
    async def test_refresh_with_valid_refresh_token(self):
        user = _make_user_obj(id=5)
        db = _db_returning_user(user)
        app = _build_auth_app(db)
        refresh = create_refresh_token(5)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/auth/refresh",
                headers={"Authorization": f"Bearer {refresh}"},
            )

        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_refresh_with_access_token_rejected(self):
        """Using an access token for refresh should fail — type mismatch."""
        user = _make_user_obj(id=5)
        db = _db_returning_user(user)
        app = _build_auth_app(db)
        access = create_access_token(5, "test@example.com")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/auth/refresh",
                headers={"Authorization": f"Bearer {access}"},
            )

        assert resp.status_code == 401

    async def test_refresh_without_token_returns_401(self):
        db = _db_returning_none()
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/auth/refresh")

        assert resp.status_code in (401, 403)


# ── Protected endpoint: /auth/me ─────────────────────────────────────────────

@needs_bcrypt
class TestGetMe:
    async def test_me_with_valid_token(self):
        user = _make_user_obj(id=10, email="me@example.com", full_name="Me")
        db = _db_returning_user(user)
        app = _build_auth_app(db)
        token = create_access_token(10, "me@example.com")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        assert resp.json()["email"] == "me@example.com"

    async def test_me_without_token_returns_401(self):
        db = _db_returning_none()
        app = _build_auth_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/auth/me")

        assert resp.status_code == 401

    async def test_me_with_expired_token_returns_401(self):
        db = _db_returning_none()
        app = _build_auth_app(db)
        expired_token = jwt.encode(
            {
                "sub": "1",
                "email": "test@example.com",
                "type": "access",
                "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            },
            settings.secret_key,
            algorithm=settings.algorithm,
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {expired_token}"},
            )

        assert resp.status_code == 401

    async def test_me_with_refresh_token_rejected(self):
        """Refresh tokens should not work as access tokens."""
        user = _make_user_obj(id=10)
        db = _db_returning_user(user)
        app = _build_auth_app(db)
        refresh = create_refresh_token(10)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {refresh}"},
            )

        assert resp.status_code == 401

    async def test_me_with_inactive_user_returns_401(self):
        user = _make_user_obj(id=10, is_active=False)
        db = _db_returning_user(user)
        app = _build_auth_app(db)
        token = create_access_token(10, "test@example.com")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 401
