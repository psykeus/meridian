"""
Shared pytest fixtures for Meridian API tests.
Uses a lightweight test FastAPI app (no lifespan/scheduler/Redis) with
the database dependency overridden by an AsyncMock session.
"""
import sys
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

# Make sure app package is importable from the api root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch

from core.database import get_db
from routers import events, feeds
from routers.auth import get_current_user


# ── Reusable sample rows ─────────────────────────────────────────────────────

SAMPLE_EVENT_ROW = {
    "id": "usgs_ci12345",
    "source_id": "usgs_earthquakes",
    "category": "environment",
    "subcategory": "earthquake",
    "title": "M5.5 — 10km NE of Test City, CA",
    "body": None,
    "severity": "medium",
    "lat": 34.052,
    "lng": -118.243,
    "metadata": {"magnitude": 5.5, "depth_km": 10.0},
    "url": "https://earthquake.usgs.gov/earthquakes/eventpage/ci12345",
    "event_time": datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
    "ingested_at": datetime(2024, 6, 1, 12, 0, 5, tzinfo=timezone.utc),
}

SAMPLE_FEMA_ROW = {
    "id": "fema_4800",
    "source_id": "fema",
    "category": "humanitarian",
    "subcategory": None,
    "title": "FEMA DR-4800: Hurricane (FL)",
    "body": None,
    "severity": "critical",
    "lat": 27.8,
    "lng": -81.8,
    "metadata": {"disaster_number": 4800, "incident_type": "Hurricane", "state": "FL"},
    "url": "https://www.fema.gov/disaster/4800",
    "event_time": datetime(2024, 9, 10, 0, 0, 0, tzinfo=timezone.utc),
    "ingested_at": datetime(2024, 9, 10, 0, 0, 5, tzinfo=timezone.utc),
}


# ── DB session mock helpers ──────────────────────────────────────────────────

def make_db_mock(rows: list[dict] | None = None) -> AsyncMock:
    """Return an AsyncMock SQLAlchemy session that yields the given rows."""
    rows = rows or []
    session = AsyncMock()
    result = MagicMock()
    result.mappings.return_value.all.return_value = rows
    session.execute.return_value = result
    return session


# ── Test application (no lifespan, no scheduler, no Redis) ──────────────────

def _make_fake_user():
    """Return a mock User object for auth override."""
    user = MagicMock()
    user.id = 1
    user.email = "test@meridian.app"
    user.tier = "pro"
    user.is_active = True
    return user


def build_test_app(db_rows: list[dict] | None = None) -> FastAPI:
    """Construct a minimal FastAPI app with mocked DB for testing."""
    app = FastAPI()
    app.include_router(events.router, prefix="/api/v1")
    app.include_router(feeds.router, prefix="/api/v1")

    @app.get("/health")
    async def health():
        return {"status": "ok", "version": "0.1.0"}

    mock_session = make_db_mock(db_rows)
    fake_user = _make_fake_user()

    async def override_get_db():
        yield mock_session

    async def override_get_current_user():
        return fake_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    return app


# ── Pytest fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def test_app():
    return build_test_app([SAMPLE_EVENT_ROW, SAMPLE_FEMA_ROW])


@pytest.fixture
def empty_app():
    return build_test_app([])


@pytest.fixture
async def client(test_app):
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def empty_client(empty_app):
    async with AsyncClient(transport=ASGITransport(app=empty_app), base_url="http://test") as c:
        yield c
