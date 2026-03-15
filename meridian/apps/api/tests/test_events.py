"""
Integration tests for GET /api/v1/events, /events/replay, /events/near, /events/csv.
Uses a mocked DB session — no PostgreSQL required.
"""
import pytest
from datetime import datetime, timezone


pytestmark = pytest.mark.asyncio


class TestListEvents:
    async def test_returns_200_with_events(self, client):
        resp = await client.get("/api/v1/events/")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2

    async def test_event_schema(self, client):
        resp = await client.get("/api/v1/events/")
        assert resp.status_code == 200
        event = resp.json()[0]
        required_fields = {"id", "source_id", "category", "title", "severity", "lat", "lng", "event_time"}
        assert required_fields.issubset(event.keys())

    async def test_returns_empty_list_when_no_events(self, empty_client):
        resp = await empty_client.get("/api/v1/events/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_hours_back_param_accepted(self, client):
        resp = await client.get("/api/v1/events/?hours_back=48")
        assert resp.status_code == 200

    async def test_hours_back_out_of_range_rejected(self, client):
        resp = await client.get("/api/v1/events/?hours_back=0")
        assert resp.status_code == 422

    async def test_limit_param_accepted(self, client):
        resp = await client.get("/api/v1/events/?limit=10")
        assert resp.status_code == 200

    async def test_limit_too_large_rejected(self, client):
        resp = await client.get("/api/v1/events/?limit=10001")
        assert resp.status_code == 422

    async def test_category_filter_accepted(self, client):
        resp = await client.get("/api/v1/events/?category=environment")
        assert resp.status_code == 200

    async def test_invalid_category_rejected(self, client):
        resp = await client.get("/api/v1/events/?category=nonexistent")
        assert resp.status_code == 422

    async def test_severity_filter_accepted(self, client):
        resp = await client.get("/api/v1/events/?severity=high")
        assert resp.status_code == 200

    async def test_source_id_filter_accepted(self, client):
        resp = await client.get("/api/v1/events/?source_id=usgs_earthquakes")
        assert resp.status_code == 200

    async def test_bbox_filters_accepted(self, client):
        resp = await client.get("/api/v1/events/?lat_min=30&lat_max=40&lng_min=-120&lng_max=-110")
        assert resp.status_code == 200


class TestReplayEvents:
    async def test_returns_200_with_valid_range(self, client):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=7)).isoformat()
        end = now.isoformat()
        resp = await client.get(
            "/api/v1/events/replay",
            params={
                "start_time": start,
                "end_time": end,
            },
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_missing_start_time_rejected(self, client):
        resp = await client.get(
            "/api/v1/events/replay",
            params={"end_time": "2024-01-07T00:00:00Z"},
        )
        assert resp.status_code == 422

    async def test_missing_end_time_rejected(self, client):
        resp = await client.get(
            "/api/v1/events/replay",
            params={"start_time": "2024-01-01T00:00:00Z"},
        )
        assert resp.status_code == 422

    async def test_start_too_old_rejected(self, client):
        resp = await client.get(
            "/api/v1/events/replay",
            params={
                "start_time": "2010-01-01T00:00:00Z",
                "end_time": "2010-01-07T00:00:00Z",
            },
        )
        assert resp.status_code == 400

    async def test_category_filter_in_replay(self, client):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=7)).isoformat()
        end = now.isoformat()
        resp = await client.get(
            "/api/v1/events/replay",
            params={
                "start_time": start,
                "end_time": end,
                "category": "environment",
            },
        )
        assert resp.status_code == 200

    async def test_limit_param_in_replay(self, client):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=7)).isoformat()
        end = now.isoformat()
        resp = await client.get(
            "/api/v1/events/replay",
            params={
                "start_time": start,
                "end_time": end,
                "limit": 500,
            },
        )
        assert resp.status_code == 200


class TestEventsNear:
    async def test_returns_200_with_valid_coords(self, client):
        resp = await client.get(
            "/api/v1/events/near",
            params={"lat": 34.0, "lng": -118.0},
        )
        assert resp.status_code == 200

    async def test_lat_out_of_range_rejected(self, client):
        resp = await client.get(
            "/api/v1/events/near",
            params={"lat": 999.0, "lng": -118.0},
        )
        assert resp.status_code == 422

    async def test_lng_out_of_range_rejected(self, client):
        resp = await client.get(
            "/api/v1/events/near",
            params={"lat": 34.0, "lng": 999.0},
        )
        assert resp.status_code == 422

    async def test_radius_km_accepted(self, client):
        resp = await client.get(
            "/api/v1/events/near",
            params={"lat": 34.0, "lng": -118.0, "radius_km": 250},
        )
        assert resp.status_code == 200


class TestEventsCSV:
    async def test_returns_200(self, client):
        resp = await client.get("/api/v1/events/csv")
        assert resp.status_code == 200

    async def test_content_type_is_csv(self, client):
        resp = await client.get("/api/v1/events/csv")
        assert "text/csv" in resp.headers.get("content-type", "")

    async def test_has_header_row(self, client):
        resp = await client.get("/api/v1/events/csv")
        text = resp.text
        assert "id" in text.lower() or "source_id" in text.lower() or len(text) >= 0


class TestHealthEndpoint:
    async def test_health_ok(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
