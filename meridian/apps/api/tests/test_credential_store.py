"""
Tests for core/credential_store.py — credential lookup priority,
cache behavior, and edge cases. No database required.
"""
import os
from unittest.mock import patch

import pytest

from core.credential_store import get_credential, list_configured, _cache


# ── get_credential priority ─────────────────────────────────────────────────

class TestGetCredential:
    def setup_method(self):
        """Clear credential cache before each test."""
        _cache.clear()

    def test_returns_cache_value_first(self):
        _cache["TEST_KEY"] = "cached_value"
        assert get_credential("TEST_KEY") == "cached_value"

    def test_falls_back_to_env_var(self):
        with patch.dict(os.environ, {"TEST_ENV_KEY": "env_value"}):
            assert get_credential("TEST_ENV_KEY") == "env_value"

    def test_returns_empty_string_when_not_found(self):
        assert get_credential("NONEXISTENT_KEY_XYZ_12345") == ""

    def test_cache_overrides_env_var(self):
        _cache["DUAL_KEY"] = "from_cache"
        with patch.dict(os.environ, {"DUAL_KEY": "from_env"}):
            assert get_credential("DUAL_KEY") == "from_cache"

    def test_empty_cache_value_falls_through_to_env(self):
        """An empty string in cache is falsy, so env var should take over."""
        _cache["EMPTY_CACHE"] = ""
        with patch.dict(os.environ, {"EMPTY_CACHE": "from_env"}):
            result = get_credential("EMPTY_CACHE")
            # `_cache.get(key)` returns "" which is falsy, so `or` falls through
            assert result == "from_env"


# ── list_configured ─────────────────────────────────────────────────────────

class TestListConfigured:
    def setup_method(self):
        _cache.clear()

    def test_includes_cache_keys_with_values(self):
        _cache["CONFIGURED_KEY"] = "has_value"
        result = list_configured()
        assert "CONFIGURED_KEY" in result

    def test_excludes_keys_with_empty_values(self):
        _cache["EMPTY_KEY"] = ""
        # Also ensure it's not in env
        result = list_configured()
        assert "EMPTY_KEY" not in result

    def test_includes_env_vars_with_values(self):
        with patch.dict(os.environ, {"ENV_CONFIGURED": "value"}):
            result = list_configured()
            assert "ENV_CONFIGURED" in result
