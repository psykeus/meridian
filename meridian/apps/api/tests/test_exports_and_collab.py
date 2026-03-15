"""
Tests for routers/exports.py and routers/collab.py.
Covers plan room exports (JSON, GeoJSON, KML, PDF), shareable links,
annotation comments, and annotation locking. Uses mocked DB.
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
from routers import exports, collab, plan_rooms

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


def _mock_room(id=1, owner_id=1):
    room = MagicMock()
    room.id = id
    room.owner_id = owner_id
    room.name = "Ops Room"
    room.description = "Active operations"
    room.aoi_bbox = None
    room.aoi_countries = None
    room.is_archived = False
    room.created_at = datetime.now(timezone.utc)
    room.updated_at = datetime.now(timezone.utc)
    return room


def _mock_annotation(id=1, is_locked=False):
    ann = MagicMock()
    ann.id = id
    ann.plan_room_id = 1
    ann.created_by = 1
    ann.annotation_type = "poi"
    ann.label = "HQ"
    ann.notes = "Command post"
    ann.color = "#00ff00"
    ann.geom_json = {"type": "Point", "coordinates": [35.2, 31.8]}
    ann.is_locked = is_locked
    ann.created_at = datetime.now(timezone.utc)
    ann.updated_at = datetime.now(timezone.utc)
    return ann


def _mock_comment(id=1, created_by=1):
    c = MagicMock()
    c.id = id
    c.annotation_id = 1
    c.plan_room_id = 1
    c.created_by = created_by
    c.body = "Confirmed position"
    c.created_at = datetime.now(timezone.utc)
    c.updated_at = datetime.now(timezone.utc)
    return c


def _mock_share_link(id=1, token="abc123"):
    link = MagicMock()
    link.id = id
    link.plan_room_id = 1
    link.created_by = 1
    link.token = token
    link.label = "Shared link"
    link.is_active = True
    link.expires_at = None
    link.view_count = 0
    link.created_at = datetime.now(timezone.utc)
    return link


def _build_app(db_mock, user=None):
    app = FastAPI()
    app.include_router(plan_rooms.router, prefix="/api/v1")
    app.include_router(exports.router, prefix="/api/v1")
    app.include_router(collab.router, prefix="/api/v1")

    async def override():
        yield db_mock

    app.dependency_overrides[get_db] = override
    if user:
        app.dependency_overrides[exports.get_current_user] = lambda: user
        app.dependency_overrides[collab.get_current_user] = lambda: user
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user
    return app


def _db_returning_room_and_items(room, items=None):
    """DB that returns a room for first query, then items for subsequent."""
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = room
    result.scalars.return_value.all.return_value = items or []
    result.mappings.return_value.all.return_value = []
    db.execute.return_value = result
    return db


# ── Exports ──────────────────────────────────────────────────────────────────

@needs_bcrypt
class TestExportJSON:
    async def test_export_json_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/export/json", headers=HEADERS)
        assert resp.status_code == 200
        assert "application/json" in resp.headers.get("content-type", "")

    async def test_export_geojson_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        ann = _mock_annotation()
        db = _db_returning_room_and_items(room, [ann])
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/export/geojson", headers=HEADERS)
        assert resp.status_code == 200

    async def test_export_kml_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/export/kml", headers=HEADERS)
        assert resp.status_code == 200

    async def test_export_pdf_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/export/pdf", headers=HEADERS)
        assert resp.status_code == 200


# ── Shareable Links ──────────────────────────────────────────────────────────

@needs_bcrypt
class TestShareableLinks:
    async def test_create_share_link_returns_201(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/share", json={
                "label": "For review",
                "expires_days": 7,
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_list_share_links_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/share", headers=HEADERS)
        assert resp.status_code == 200

    async def test_view_shared_room_with_valid_token(self):
        """Public endpoint — no auth required."""
        room = _mock_room()
        link = _mock_share_link()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = link
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result
        app = _build_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/view/abc123")
        assert resp.status_code == 200

    async def test_view_shared_room_invalid_token_returns_404(self):
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result
        app = _build_app(db)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/view/invalid_token")
        assert resp.status_code in (404, 410)


# ── Annotation Comments ─────────────────────────────────────────────────────

@needs_bcrypt
class TestAnnotationComments:
    async def test_list_comments_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/annotations/1/comments", headers=HEADERS)
        assert resp.status_code == 200

    async def test_add_comment_returns_201(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/annotations/1/comments", json={
                "body": "Confirmed visual contact",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_delete_own_comment_returns_204(self):
        user = _mock_user()
        room = _mock_room()
        comment = _mock_comment(created_by=1)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.side_effect = [room, comment]
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete("/api/v1/plan-rooms/1/annotations/1/comments/1", headers=HEADERS)
        assert resp.status_code == 204


# ── Annotation Locking ───────────────────────────────────────────────────────

@needs_bcrypt
class TestAnnotationLocking:
    async def test_lock_annotation_returns_204(self):
        user = _mock_user()
        room = _mock_room()
        ann = _mock_annotation(is_locked=False)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.side_effect = [room, ann]
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/annotations/1/lock", headers=HEADERS)
        assert resp.status_code == 204

    async def test_unlock_annotation_returns_204(self):
        user = _mock_user()
        room = _mock_room()
        ann = _mock_annotation(is_locked=True)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.side_effect = [room, ann]
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/annotations/1/unlock", headers=HEADERS)
        assert resp.status_code == 204


# ── Room Members ─────────────────────────────────────────────────────────────

@needs_bcrypt
class TestRoomMembers:
    async def test_list_members_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_returning_room_and_items(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/members", headers=HEADERS)
        assert resp.status_code == 200
