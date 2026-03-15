"""
Tests for routers/plan_rooms.py — Plan Room CRUD, annotations, timeline,
tasks. Uses mocked DB sessions — no PostgreSQL required.
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
from routers import plan_rooms, collab, exports, intel

pytestmark = pytest.mark.asyncio

# ── Helpers ──────────────────────────────────────────────────────────────────

_bcrypt_works = True
try:
    hash_password("probe")
except (ValueError, RuntimeError):
    _bcrypt_works = False

needs_bcrypt = pytest.mark.skipif(not _bcrypt_works, reason="passlib/bcrypt incompatible")

TOKEN = create_access_token(1, "test@example.com")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def _mock_user(id=1, email="test@example.com", is_active=True, tier="free"):
    user = MagicMock()
    user.id = id
    user.email = email
    user.is_active = is_active
    user.tier = tier
    return user


def _build_app(db_mock):
    app = FastAPI()
    app.include_router(plan_rooms.router, prefix="/api/v1")
    app.include_router(collab.router, prefix="/api/v1")
    app.include_router(exports.router, prefix="/api/v1")
    app.include_router(intel.router, prefix="/api/v1")

    async def override_get_db():
        yield db_mock

    app.dependency_overrides[get_db] = override_get_db
    return app


def _db_with_scalars(scalars=None, mappings=None):
    """Mock DB that can return scalars and/or mapping rows."""
    db = AsyncMock()
    result = MagicMock()
    # scalar returns
    if scalars is not None:
        result.scalars.return_value.all.return_value = scalars
        result.scalar_one_or_none.return_value = scalars[0] if scalars else None
    else:
        result.scalars.return_value.all.return_value = []
        result.scalar_one_or_none.return_value = None
    # mapping returns
    if mappings is not None:
        result.mappings.return_value.all.return_value = mappings
    else:
        result.mappings.return_value.all.return_value = []
    db.execute.return_value = result
    return db


def _mock_room(id=1, owner_id=1, name="Test Room", description="Test"):
    room = MagicMock()
    room.id = id
    room.owner_id = owner_id
    room.name = name
    room.description = description
    room.aoi_bbox = None
    room.aoi_countries = None
    room.is_archived = False
    room.created_at = datetime.now(timezone.utc)
    room.updated_at = datetime.now(timezone.utc)
    return room


def _mock_annotation(id=1, plan_room_id=1, annotation_type="poi"):
    ann = MagicMock()
    ann.id = id
    ann.plan_room_id = plan_room_id
    ann.created_by = 1
    ann.annotation_type = annotation_type
    ann.label = "Test POI"
    ann.notes = "Notes"
    ann.color = "#00ff00"
    ann.geom_json = {"type": "Point", "coordinates": [0, 0]}
    ann.is_locked = False
    ann.created_at = datetime.now(timezone.utc)
    ann.updated_at = datetime.now(timezone.utc)
    return ann


def _mock_task(id=1, plan_room_id=1, status="to_monitor"):
    task = MagicMock()
    task.id = id
    task.plan_room_id = plan_room_id
    task.created_by = 1
    task.assigned_to = None
    task.title = "Test Task"
    task.notes = None
    task.status = status
    task.priority = "medium"
    task.created_at = datetime.now(timezone.utc)
    task.updated_at = datetime.now(timezone.utc)
    return task


def _mock_member(user_id=1, role="owner"):
    m = MagicMock()
    m.user_id = user_id
    m.role = role
    m.joined_at = datetime.now(timezone.utc)
    return m


# ── Plan Room CRUD ───────────────────────────────────────────────────────────

@needs_bcrypt
class TestListRooms:
    async def test_returns_200(self):
        user = _mock_user()
        db = _db_with_scalars([])

        with patch("routers.plan_rooms.get_current_user", return_value=user):
            app = _build_app(db)
            app.dependency_overrides[plan_rooms.get_current_user] = lambda: user
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/plan-rooms/", headers=HEADERS)

        assert resp.status_code == 200

    async def test_unauthenticated_returns_401(self):
        db = _db_with_scalars()
        app = _build_app(db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/")
        assert resp.status_code in (401, 403)


@needs_bcrypt
class TestCreateRoom:
    async def test_create_room_returns_201(self):
        user = _mock_user()
        room = _mock_room()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        result.scalars.return_value.all.return_value = []
        db.execute.return_value = result

        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/", json={
                "name": "New Room",
                "description": "Test room",
            }, headers=HEADERS)

        assert resp.status_code == 201

    async def test_create_room_missing_name_returns_422(self):
        user = _mock_user()
        db = AsyncMock()
        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/", json={}, headers=HEADERS)

        assert resp.status_code == 422


# ── Annotations ──────────────────────────────────────────────────────────────

@needs_bcrypt
class TestAnnotations:
    async def test_list_annotations_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_scalars([room])
        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/annotations", headers=HEADERS)

        assert resp.status_code == 200

    async def test_create_annotation_returns_201(self):
        user = _mock_user()
        room = _mock_room()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = room
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result

        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/annotations", json={
                "annotation_type": "poi",
                "label": "Test",
                "color": "#ff0000",
                "geom_json": {"type": "Point", "coordinates": [0, 0]},
            }, headers=HEADERS)

        assert resp.status_code == 201


# ── Tasks ────────────────────────────────────────────────────────────────────

@needs_bcrypt
class TestTasks:
    async def test_list_tasks_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_scalars([room])
        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/tasks", headers=HEADERS)

        assert resp.status_code == 200

    async def test_create_task_returns_201(self):
        user = _mock_user()
        room = _mock_room()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = room
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result

        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/tasks", json={
                "title": "Monitor situation",
                "priority": "high",
            }, headers=HEADERS)

        assert resp.status_code == 201


# ── Timeline ─────────────────────────────────────────────────────────────────

@needs_bcrypt
class TestTimeline:
    async def test_list_timeline_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_scalars([room])
        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/timeline", headers=HEADERS)

        assert resp.status_code == 200

    async def test_add_timeline_entry_returns_201(self):
        user = _mock_user()
        room = _mock_room()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = room
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result

        app = _build_app(db)
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/timeline", json={
                "title": "Situation escalated",
                "entry_time": "2026-03-11T12:00:00Z",
            }, headers=HEADERS)

        assert resp.status_code == 201
