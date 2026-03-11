"""
Tests for worker registration integrity and FeedWorker contract compliance.
Validates that all workers in the scheduler registry have correct attributes,
unique source IDs, valid categories, and reasonable refresh intervals.
No external calls are made — this tests the worker class definitions only.
"""
import pytest
from datetime import datetime, timezone

from models.geo_event import FeedCategory, SeverityLevel
from workers.base import FeedWorker, FeedHealth, FeedStatus
from workers.scheduler import WORKERS, get_all_workers


# ── Worker registry ─────────────────────────────────────────────────────────

class TestWorkerRegistry:
    def test_at_least_40_workers_registered(self):
        assert len(WORKERS) >= 40, (
            f"Expected ≥40 workers, got {len(WORKERS)}. "
            "A worker may have been accidentally removed."
        )

    def test_all_workers_are_feedworker_instances(self):
        for w in WORKERS:
            assert isinstance(w, FeedWorker), (
                f"{type(w).__name__} is not a FeedWorker subclass"
            )

    def test_all_source_ids_are_unique(self):
        ids = [w.source_id for w in WORKERS]
        duplicates = [sid for sid in ids if ids.count(sid) > 1]
        assert len(duplicates) == 0, f"Duplicate source_ids: {set(duplicates)}"

    def test_all_source_ids_are_snake_case(self):
        import re
        for w in WORKERS:
            assert re.match(r'^[a-z][a-z0-9_]*$', w.source_id), (
                f"source_id '{w.source_id}' on {type(w).__name__} is not snake_case"
            )

    def test_all_workers_have_display_name(self):
        for w in WORKERS:
            assert hasattr(w, 'display_name'), (
                f"{type(w).__name__} missing display_name"
            )
            assert isinstance(w.display_name, str) and len(w.display_name) > 0, (
                f"{type(w).__name__} has empty display_name"
            )

    def test_all_workers_have_valid_category(self):
        valid_categories = {c.value for c in FeedCategory}
        for w in WORKERS:
            cat = w.category if isinstance(w.category, str) else w.category.value
            assert cat in valid_categories, (
                f"{type(w).__name__} has invalid category '{cat}'. "
                f"Valid: {valid_categories}"
            )

    def test_all_workers_have_positive_refresh_interval(self):
        for w in WORKERS:
            assert w.refresh_interval > 0, (
                f"{type(w).__name__} has refresh_interval={w.refresh_interval}"
            )

    def test_no_refresh_interval_under_5_seconds(self):
        """Extremely low intervals risk rate-limiting from upstream APIs.
        ISS tracking (5s) is the known minimum — anything below that is a bug."""
        for w in WORKERS:
            assert w.refresh_interval >= 5, (
                f"{type(w).__name__} refresh_interval={w.refresh_interval}s "
                "is dangerously low (< 5s)"
            )

    def test_all_workers_have_run_on_startup_attribute(self):
        for w in WORKERS:
            assert hasattr(w, 'run_on_startup'), (
                f"{type(w).__name__} missing run_on_startup attribute"
            )
            assert isinstance(w.run_on_startup, bool), (
                f"{type(w).__name__}.run_on_startup is not a bool"
            )

    def test_get_all_workers_returns_same_list(self):
        assert get_all_workers() is WORKERS


# ── Category coverage ───────────────────────────────────────────────────────

class TestCategoryCoverage:
    def test_at_least_8_categories_represented(self):
        """Ensure the platform has broad coverage across domains."""
        categories_present = set()
        for w in WORKERS:
            cat = w.category if isinstance(w.category, str) else w.category.value
            categories_present.add(cat)

        assert len(categories_present) >= 8, (
            f"Only {len(categories_present)} categories covered: {categories_present}"
        )

    def test_environment_category_has_workers(self):
        env_workers = [w for w in WORKERS
                       if (w.category if isinstance(w.category, str) else w.category.value) == "environment"]
        assert len(env_workers) >= 3, "Expected at least 3 environment workers"

    def test_cyber_category_has_workers(self):
        cyber_workers = [w for w in WORKERS
                         if (w.category if isinstance(w.category, str) else w.category.value) == "cyber"]
        assert len(cyber_workers) >= 1, "Expected at least 1 cyber worker"


# ── FeedWorker base class health tracking ───────────────────────────────────

class TestFeedWorkerContract:
    def _dummy_worker(self):
        class Dummy(FeedWorker):
            source_id = "test_dummy"
            display_name = "Test Dummy"
            category = FeedCategory.environment
            refresh_interval = 60

            async def fetch(self):
                return []
        return Dummy()

    def test_health_check_returns_feedhealth(self):
        w = self._dummy_worker()
        h = w.health_check()
        assert isinstance(h, FeedHealth)

    def test_health_check_has_expected_attributes(self):
        w = self._dummy_worker()
        h = w.health_check()
        assert hasattr(h, "source_id")
        assert hasattr(h, "status")
        assert hasattr(h, "last_fetched")
        assert hasattr(h, "last_success")
        assert hasattr(h, "last_error")
        assert hasattr(h, "fetch_count")
        assert hasattr(h, "error_count")
        assert hasattr(h, "avg_latency_ms")

    def test_initial_health_is_healthy(self):
        w = self._dummy_worker()
        assert w.health_check().status == FeedStatus.healthy

    def test_stale_detection(self):
        """If last_success is > 3x refresh_interval old, status = stale."""
        w = self._dummy_worker()
        w._set_state("last_success", datetime(2020, 1, 1, tzinfo=timezone.utc))
        w._set_state("last_fetched", datetime(2020, 1, 1, tzinfo=timezone.utc))
        h = w.health_check()
        assert h.status == FeedStatus.stale

    def test_error_detection_at_3_consecutive(self):
        w = self._dummy_worker()
        w._set_state("last_error", "boom")
        w._set_state("consecutive_errors", 3)
        h = w.health_check()
        assert h.status == FeedStatus.error

    def test_error_detection_below_3_stays_healthy(self):
        w = self._dummy_worker()
        w._set_state("last_error", "boom")
        w._set_state("consecutive_errors", 2)
        h = w.health_check()
        assert h.status == FeedStatus.healthy

    async def test_run_resets_consecutive_errors_on_success(self):
        w = self._dummy_worker()
        w._set_state("consecutive_errors", 5)
        await w.run()
        assert w._get_state("consecutive_errors") == 0

    async def test_run_records_latency(self):
        w = self._dummy_worker()
        await w.run()
        total_latency = w._get_state("total_latency_ms", 0.0)
        assert total_latency > 0
