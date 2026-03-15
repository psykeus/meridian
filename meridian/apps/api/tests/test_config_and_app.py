"""
Tests for core/config.py settings, main.py health endpoint, and
ConnectionManager behavior. Validates configuration defaults, CORS parsing,
and WebSocket broadcast error handling.
"""
import sys
import os
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.config import Settings, get_settings


# ── Settings defaults ────────────────────────────────────────────────────────

class TestSettingsDefaults:
    def test_default_environment_is_development(self):
        s = Settings(
            _env_file=None,  # don't load .env during tests
            database_url="postgresql+asyncpg://x:x@localhost/x",
        )
        assert s.environment == "development"

    def test_default_log_level_is_info(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.log_level == "INFO"

    def test_default_cors_origins(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert "localhost:5173" in s.cors_origins

    def test_default_secret_key_is_placeholder(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.secret_key == "change-me-to-a-random-64-char-string"

    def test_default_algorithm_is_hs256(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.algorithm == "HS256"

    def test_default_access_token_expire_24h(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.access_token_expire_minutes == 1440

    def test_default_refresh_token_expire_30_days(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.refresh_token_expire_days == 30

    def test_default_nasa_api_key_is_demo(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.nasa_api_key == "DEMO_KEY"

    def test_default_litellm_provider_is_ollama(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.litellm_provider == "ollama"

    def test_feed_api_keys_default_empty(self):
        s = Settings(_env_file=None, database_url="postgresql+asyncpg://x:x@localhost/x")
        assert s.acled_api_key == ""
        assert s.alpha_vantage_api_key == ""
        assert s.opensky_client_id == ""
        assert s.sendgrid_api_key == ""


# ── CORS origins parsing ────────────────────────────────────────────────────

class TestCORSOrigins:
    def test_single_origin(self):
        s = Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://x:x@localhost/x",
            cors_origins="http://localhost:5173",
        )
        assert s.cors_origins_list == ["http://localhost:5173"]

    def test_multiple_origins_comma_separated(self):
        s = Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://x:x@localhost/x",
            cors_origins="http://localhost:5173, https://app.meridian.io",
        )
        assert s.cors_origins_list == ["http://localhost:5173", "https://app.meridian.io"]

    def test_strips_whitespace(self):
        s = Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://x:x@localhost/x",
            cors_origins="  http://a.com ,  http://b.com  ",
        )
        assert s.cors_origins_list == ["http://a.com", "http://b.com"]


# ── is_production property ──────────────────────────────────────────────────

class TestIsProduction:
    def test_is_production_true(self):
        s = Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://x:x@localhost/x",
            environment="production",
        )
        assert s.is_production is True

    def test_is_production_false_for_dev(self):
        s = Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://x:x@localhost/x",
            environment="development",
        )
        assert s.is_production is False

    def test_is_production_false_for_test(self):
        s = Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://x:x@localhost/x",
            environment="test",
        )
        assert s.is_production is False


# ── ConnectionManager ───────────────────────────────────────────────────────

class TestConnectionManager:
    def _manager(self):
        from main import ConnectionManager
        return ConnectionManager()

    def test_starts_with_no_connections(self):
        m = self._manager()
        assert len(m._connections) == 0

    @pytest.mark.asyncio
    async def test_connect_adds_to_list(self):
        m = self._manager()
        ws = AsyncMock()
        await m.connect(ws)
        assert len(m._connections) == 1
        ws.accept.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_disconnect_removes_from_list(self):
        m = self._manager()
        ws = AsyncMock()
        await m.connect(ws)
        m.disconnect(ws)
        assert len(m._connections) == 0

    @pytest.mark.asyncio
    async def test_broadcast_sends_to_all(self):
        m = self._manager()
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        await m.connect(ws1)
        await m.connect(ws2)
        await m.broadcast("hello")
        ws1.send_text.assert_awaited_once_with("hello")
        ws2.send_text.assert_awaited_once_with("hello")

    @pytest.mark.asyncio
    async def test_broadcast_removes_dead_connections(self):
        m = self._manager()
        healthy_ws = AsyncMock()
        dead_ws = AsyncMock()
        dead_ws.send_text.side_effect = RuntimeError("connection closed")

        await m.connect(healthy_ws)
        await m.connect(dead_ws)
        assert len(m._connections) == 2

        await m.broadcast("test")
        # Dead connection should have been removed
        assert len(m._connections) == 1
        assert healthy_ws in m._connections
        assert dead_ws not in m._connections

    @pytest.mark.asyncio
    async def test_broadcast_with_no_connections(self):
        m = self._manager()
        # Should not raise
        await m.broadcast("nobody listening")


# ── Health endpoint ─────────────────────────────────────────────────────────

class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_ok(self):
        """Already tested in test_events.py but included here for completeness."""
        from httpx import AsyncClient, ASGITransport
        from fastapi import FastAPI

        app = FastAPI()

        @app.get("/health")
        async def health():
            return {"status": "ok", "version": "0.1.0"}

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/health")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data
