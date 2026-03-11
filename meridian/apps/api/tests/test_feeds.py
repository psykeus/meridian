"""
Tests for GET /api/v1/feeds/health and /feeds/status.
The feeds endpoints call get_all_workers() directly (no DB), so they
work without any database override.
"""
import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from routers import feeds

pytestmark = pytest.mark.asyncio


@pytest.fixture
def feeds_app():
    app = FastAPI()
    app.include_router(feeds.router, prefix="/api/v1")
    return app


@pytest.fixture
async def feeds_client(feeds_app):
    async with AsyncClient(transport=ASGITransport(app=feeds_app), base_url="http://test") as c:
        yield c


class TestFeedHealth:
    async def test_returns_200(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/health")
        assert resp.status_code == 200

    async def test_returns_dict(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/health")
        data = resp.json()
        assert isinstance(data, dict)

    async def test_known_sources_present(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/health")
        data = resp.json()
        expected = {"usgs_earthquakes", "nasa_firms", "fema", "gdacs", "nasa_iss"}
        assert expected.issubset(data.keys()), f"Missing sources: {expected - data.keys()}"

    async def test_entry_schema(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/health")
        data = resp.json()
        assert len(data) > 0
        entry = next(iter(data.values()))
        required = {"name", "status", "last_success", "last_error", "fetch_count", "error_count"}
        assert required.issubset(entry.keys())

    async def test_all_statuses_are_valid(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/health")
        valid_statuses = {"healthy", "stale", "error", "disabled"}
        for source_id, entry in resp.json().items():
            assert entry["status"] in valid_statuses, (
                f"{source_id} has invalid status: {entry['status']}"
            )

    async def test_fetch_count_non_negative(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/health")
        for source_id, entry in resp.json().items():
            assert entry["fetch_count"] >= 0, f"{source_id} fetch_count is negative"

    async def test_error_count_non_negative(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/health")
        for source_id, entry in resp.json().items():
            assert entry["error_count"] >= 0, f"{source_id} error_count is negative"


class TestFeedStatus:
    async def test_returns_200(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/status")
        assert resp.status_code == 200

    async def test_returns_list(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/status")
        assert isinstance(resp.json(), list)

    async def test_entry_has_source_id(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/status")
        data = resp.json()
        assert len(data) > 0
        for entry in data:
            assert "source_id" in entry
            assert "display_name" in entry
            assert "status" in entry
            assert "refresh_interval_seconds" in entry

    async def test_at_least_40_workers_registered(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/status")
        assert len(resp.json()) >= 40, (
            f"Expected at least 40 workers, got {len(resp.json())}"
        )

    async def test_refresh_intervals_are_positive(self, feeds_client):
        resp = await feeds_client.get("/api/v1/feeds/status")
        for entry in resp.json():
            assert entry["refresh_interval_seconds"] > 0
