"""
Tests for routers/intel.py — Watch list entities and Intel notes CRUD.
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
from routers import intel, plan_rooms

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
    room.name = "Intel Room"
    room.is_archived = False
    room.created_at = datetime.now(timezone.utc)
    room.updated_at = datetime.now(timezone.utc)
    return room


def _build_app(db_mock, user=None):
    app = FastAPI()
    app.include_router(intel.router, prefix="/api/v1")
    app.include_router(plan_rooms.router, prefix="/api/v1")

    async def override():
        yield db_mock
    app.dependency_overrides[get_db] = override
    if user:
        app.dependency_overrides[intel.get_current_user] = lambda: user
        app.dependency_overrides[plan_rooms.get_current_user] = lambda: user
    return app


def _db_with_room(room):
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = room
    result.scalars.return_value.all.return_value = [room]
    result.mappings.return_value.all.return_value = []
    db.execute.return_value = result
    return db


# ── Watch List ───────────────────────────────────────────────────────────────

@needs_bcrypt
class TestWatchList:
    async def test_list_watch_entities_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/watch-list", headers=HEADERS)
        assert resp.status_code == 200

    async def test_add_vessel_to_watch_list(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/watch-list", json={
                "entity_type": "vessel",
                "label": "USS Gerald Ford",
                "identifier": "MMSI:368207620",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_add_aircraft_to_watch_list(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/watch-list", json={
                "entity_type": "aircraft",
                "label": "Air Force One",
                "identifier": "ICAO24:ae5048",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_add_location_with_radius(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/watch-list", json={
                "entity_type": "location",
                "label": "Strait of Hormuz",
                "identifier": "hormuz",
                "lat": 26.6,
                "lng": 56.2,
                "radius_meters": 50000,
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_add_keyword_entity(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/watch-list", json={
                "entity_type": "keyword",
                "label": "Nuclear",
                "identifier": "nuclear",
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_add_all_entity_types(self):
        """Verify all 8 entity types are accepted."""
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        types = ["vessel", "aircraft", "location", "country", "keyword",
                 "cyber_asset", "weather_system", "satellite"]
        for etype in types:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post("/api/v1/plan-rooms/1/watch-list", json={
                    "entity_type": etype,
                    "label": f"Test {etype}",
                    "identifier": f"id_{etype}",
                }, headers=HEADERS)
            assert resp.status_code == 201, f"Failed for entity_type={etype}"

    async def test_remove_watch_entity_returns_204(self):
        user = _mock_user()
        room = _mock_room()
        entity = MagicMock()
        entity.id = 1
        entity.plan_room_id = 1
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.side_effect = [room, entity]
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete("/api/v1/plan-rooms/1/watch-list/1", headers=HEADERS)
        assert resp.status_code == 204


# ── Intel Notes ──────────────────────────────────────────────────────────────

@needs_bcrypt
class TestIntelNotes:
    async def test_list_intel_notes_returns_200(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/intel", headers=HEADERS)
        assert resp.status_code == 200

    async def test_create_unclassified_note(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/intel", json={
                "title": "Vessel movement observed",
                "body": "3 cargo ships diverted from normal route",
                "classification": "unclassified",
                "tags": ["maritime", "anomaly"],
                "is_pinned": False,
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_create_secret_pinned_note(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/plan-rooms/1/intel", json={
                "title": "SIGINT intercept",
                "body": "Encrypted comms spike on military freq",
                "classification": "secret",
                "tags": ["sigint", "military"],
                "is_pinned": True,
            }, headers=HEADERS)
        assert resp.status_code == 201

    async def test_list_pinned_only(self):
        user = _mock_user()
        room = _mock_room()
        db = _db_with_room(room)
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/plan-rooms/1/intel?pinned_only=true", headers=HEADERS)
        assert resp.status_code == 200

    async def test_update_intel_note(self):
        user = _mock_user()
        room = _mock_room()
        note = MagicMock()
        note.id = 1
        note.plan_room_id = 1
        note.title = "Old title"
        note.is_pinned = False
        note.classification = "unclassified"
        note.created_at = datetime.now(timezone.utc)
        note.updated_at = datetime.now(timezone.utc)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.side_effect = [room, note]
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.patch("/api/v1/plan-rooms/1/intel/1", json={
                "title": "Updated title",
                "is_pinned": True,
            }, headers=HEADERS)
        assert resp.status_code == 200

    async def test_delete_intel_note_returns_204(self):
        user = _mock_user()
        room = _mock_room()
        note = MagicMock()
        note.id = 1
        note.plan_room_id = 1
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.side_effect = [room, note]
        result.scalars.return_value.all.return_value = [room]
        db.execute.return_value = result
        app = _build_app(db, user)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete("/api/v1/plan-rooms/1/intel/1", headers=HEADERS)
        assert resp.status_code == 204
