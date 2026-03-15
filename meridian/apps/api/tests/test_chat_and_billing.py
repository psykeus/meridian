"""
Tests for routers/chat_sessions.py.
Covers chat session CRUD, message history, and reading history.
Uses mocked DB — no PostgreSQL required.
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
from routers import chat_sessions

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
    return user


# ── Chat Sessions ────────────────────────────────────────────────────────────

def _build_chat_app(db_mock, user=None):
    app = FastAPI()
    app.include_router(chat_sessions.router, prefix="/api/v1")
    async def override():
        yield db_mock
    app.dependency_overrides[get_db] = override
    if user:
        app.dependency_overrides[chat_sessions.get_current_user] = lambda: user
    return app


def _mock_session(id=1, title="Test Chat"):
    s = MagicMock()
    s.id = id
    s.user_id = 1
    s.title = title
    s.model = "gpt-4o"
    s.context = None
    s.created_at = datetime.now(timezone.utc)
    s.updated_at = datetime.now(timezone.utc)
    return s


@needs_bcrypt
class TestChatSessions:
    async def test_list_sessions_returns_200(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/chat/sessions", headers=HEADERS)
        assert resp.status_code == 200

    async def test_create_session_returns_201(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat/sessions", json={
                "title": "Intelligence Chat",
                "model": "gpt-4o",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_session_default_model(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat/sessions", json={}, headers=HEADERS)
        assert resp.status_code == 201

    async def test_delete_session_returns_204(self):
        user = _mock_user()
        session = _mock_session()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = session
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete("/api/v1/chat/sessions/1", headers=HEADERS)
        assert resp.status_code == 204

    async def test_add_message_returns_201(self):
        user = _mock_user()
        session = _mock_session()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = session
        result.scalars.return_value.all.return_value = [session]
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat/sessions/1/messages", json={
                "role": "user",
                "content": "What are the current threats in the Middle East?",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_get_messages_returns_200(self):
        user = _mock_user()
        session = _mock_session()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = session
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/chat/sessions/1/messages", headers=HEADERS)
        assert resp.status_code == 200


@needs_bcrypt
class TestReadingHistory:
    async def test_track_reading_returns_201(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/chat/reading-history", json={
                "event_id": "usgs_ci12345",
                "category": "environment",
                "source_id": "usgs_earthquakes",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_top_categories_returns_200(self):
        user = _mock_user()
        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = []
        result.mappings.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_chat_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/chat/reading-history/top-categories", headers=HEADERS)
        assert resp.status_code == 200
