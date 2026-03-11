"""
Tests for services/alert_engine.py — rule condition evaluation logic.
Exercises all condition types: category, severity, keyword, source, region_bbox,
and composite (AND/OR). No DB or Redis required.
"""
import pytest

from services.alert_engine import _evaluate_rule, _evaluate_single_condition


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mock_rule(condition_type: str, condition_params: dict):
    """Create a mock rule object matching the interface _evaluate_rule expects."""
    return type("MockRule", (), {
        "condition_type": condition_type,
        "condition_params": condition_params,
    })()


def _event(**overrides):
    """Build a sample event dict with sensible defaults."""
    base = {
        "id": "test_evt_1",
        "source_id": "usgs_earthquakes",
        "category": "environment",
        "title": "M5.5 Earthquake near Test City",
        "body": "Moderate shaking reported in surrounding areas.",
        "severity": "medium",
        "lat": 34.0,
        "lng": -118.0,
        "event_time": "2024-06-01T12:00:00Z",
    }
    base.update(overrides)
    return base


# ── Category condition ───────────────────────────────────────────────────────

class TestCategoryCondition:
    def test_matches_exact_category(self):
        rule = _mock_rule("category", {"category": "environment"})
        assert _evaluate_rule(rule, _event(category="environment")) is True

    def test_rejects_wrong_category(self):
        rule = _mock_rule("category", {"category": "cyber"})
        assert _evaluate_rule(rule, _event(category="environment")) is False

    def test_rejects_missing_category_param(self):
        rule = _mock_rule("category", {})
        assert _evaluate_rule(rule, _event(category="environment")) is False

    def test_rejects_event_with_no_category(self):
        rule = _mock_rule("category", {"category": "environment"})
        evt = _event()
        del evt["category"]
        assert _evaluate_rule(rule, evt) is False


# ── Severity condition ───────────────────────────────────────────────────────

class TestSeverityCondition:
    def test_medium_event_matches_medium_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "medium"})
        assert _evaluate_rule(rule, _event(severity="medium")) is True

    def test_high_event_matches_medium_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "medium"})
        assert _evaluate_rule(rule, _event(severity="high")) is True

    def test_critical_event_matches_medium_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "medium"})
        assert _evaluate_rule(rule, _event(severity="critical")) is True

    def test_low_event_fails_medium_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "medium"})
        assert _evaluate_rule(rule, _event(severity="low")) is False

    def test_info_event_fails_medium_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "medium"})
        assert _evaluate_rule(rule, _event(severity="info")) is False

    def test_info_event_matches_info_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "info"})
        assert _evaluate_rule(rule, _event(severity="info")) is True

    def test_critical_matches_critical_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "critical"})
        assert _evaluate_rule(rule, _event(severity="critical")) is True

    def test_high_fails_critical_threshold(self):
        rule = _mock_rule("severity", {"min_severity": "critical"})
        assert _evaluate_rule(rule, _event(severity="high")) is False

    def test_defaults_to_medium_when_no_min_severity(self):
        rule = _mock_rule("severity", {})
        assert _evaluate_rule(rule, _event(severity="medium")) is True
        assert _evaluate_rule(rule, _event(severity="low")) is False

    def test_unknown_severity_in_event_returns_false(self):
        rule = _mock_rule("severity", {"min_severity": "low"})
        assert _evaluate_rule(rule, _event(severity="unknown")) is False

    def test_unknown_min_severity_in_rule_returns_false(self):
        rule = _mock_rule("severity", {"min_severity": "extreme"})
        assert _evaluate_rule(rule, _event(severity="critical")) is False


# ── Keyword condition ────────────────────────────────────────────────────────

class TestKeywordCondition:
    def test_matches_keyword_in_title(self):
        rule = _mock_rule("keyword", {"keyword": "earthquake"})
        assert _evaluate_rule(rule, _event(title="M5.5 Earthquake near LA")) is True

    def test_matches_keyword_in_body(self):
        rule = _mock_rule("keyword", {"keyword": "shaking"})
        assert _evaluate_rule(rule, _event(body="Moderate shaking reported")) is True

    def test_case_insensitive_match(self):
        rule = _mock_rule("keyword", {"keyword": "EARTHQUAKE"})
        assert _evaluate_rule(rule, _event(title="M5.5 earthquake")) is True

    def test_no_match_returns_false(self):
        rule = _mock_rule("keyword", {"keyword": "tornado"})
        assert _evaluate_rule(rule, _event(title="Earthquake", body="Seismic activity")) is False

    def test_empty_keyword_matches_everything(self):
        rule = _mock_rule("keyword", {"keyword": ""})
        assert _evaluate_rule(rule, _event()) is True

    def test_none_keyword_matches_everything(self):
        rule = _mock_rule("keyword", {"keyword": None})
        assert _evaluate_rule(rule, _event()) is True

    def test_matches_across_title_and_body(self):
        rule = _mock_rule("keyword", {"keyword": "test"})
        assert _evaluate_rule(rule, _event(title="Test City Earthquake")) is True

    def test_handles_none_body(self):
        rule = _mock_rule("keyword", {"keyword": "search"})
        assert _evaluate_rule(rule, _event(title="No match", body=None)) is False


# ── Source condition ─────────────────────────────────────────────────────────

class TestSourceCondition:
    def test_matches_exact_source(self):
        rule = _mock_rule("source", {"source_id": "usgs_earthquakes"})
        assert _evaluate_rule(rule, _event(source_id="usgs_earthquakes")) is True

    def test_rejects_wrong_source(self):
        rule = _mock_rule("source", {"source_id": "nasa_firms"})
        assert _evaluate_rule(rule, _event(source_id="usgs_earthquakes")) is False


# ── Region bbox condition ───────────────────────────────────────────────────

class TestRegionBboxCondition:
    def test_point_inside_bbox(self):
        rule = _mock_rule("region_bbox", {
            "min_lat": 30.0, "max_lat": 40.0,
            "min_lng": -120.0, "max_lng": -110.0,
        })
        assert _evaluate_rule(rule, _event(lat=35.0, lng=-115.0)) is True

    def test_point_outside_bbox(self):
        rule = _mock_rule("region_bbox", {
            "min_lat": 30.0, "max_lat": 40.0,
            "min_lng": -120.0, "max_lng": -110.0,
        })
        assert _evaluate_rule(rule, _event(lat=50.0, lng=-115.0)) is False

    def test_point_on_bbox_boundary_included(self):
        rule = _mock_rule("region_bbox", {
            "min_lat": 30.0, "max_lat": 40.0,
            "min_lng": -120.0, "max_lng": -110.0,
        })
        assert _evaluate_rule(rule, _event(lat=30.0, lng=-120.0)) is True
        assert _evaluate_rule(rule, _event(lat=40.0, lng=-110.0)) is True

    def test_handles_missing_lat(self):
        rule = _mock_rule("region_bbox", {
            "min_lat": 30.0, "max_lat": 40.0,
            "min_lng": -120.0, "max_lng": -110.0,
        })
        evt = _event()
        del evt["lat"]
        assert _evaluate_rule(rule, evt) is False

    def test_handles_missing_lng(self):
        rule = _mock_rule("region_bbox", {
            "min_lat": 30.0, "max_lat": 40.0,
            "min_lng": -120.0, "max_lng": -110.0,
        })
        evt = _event()
        del evt["lng"]
        assert _evaluate_rule(rule, evt) is False

    def test_defaults_to_full_globe_when_no_bounds(self):
        rule = _mock_rule("region_bbox", {})
        assert _evaluate_rule(rule, _event(lat=0, lng=0)) is True
        assert _evaluate_rule(rule, _event(lat=89, lng=179)) is True

    def test_handles_none_lat(self):
        rule = _mock_rule("region_bbox", {
            "min_lat": 30.0, "max_lat": 40.0,
            "min_lng": -120.0, "max_lng": -110.0,
        })
        assert _evaluate_rule(rule, _event(lat=None, lng=-115.0)) is False


# ── Composite condition ─────────────────────────────────────────────────────

class TestCompositeCondition:
    def test_and_both_true(self):
        rule = _mock_rule("composite", {
            "operator": "and",
            "conditions": [
                {"type": "category", "params": {"category": "environment"}},
                {"type": "severity", "params": {"min_severity": "medium"}},
            ],
        })
        assert _evaluate_rule(rule, _event(category="environment", severity="high")) is True

    def test_and_one_false(self):
        rule = _mock_rule("composite", {
            "operator": "and",
            "conditions": [
                {"type": "category", "params": {"category": "environment"}},
                {"type": "severity", "params": {"min_severity": "critical"}},
            ],
        })
        assert _evaluate_rule(rule, _event(category="environment", severity="medium")) is False

    def test_or_one_true(self):
        rule = _mock_rule("composite", {
            "operator": "or",
            "conditions": [
                {"type": "category", "params": {"category": "cyber"}},
                {"type": "severity", "params": {"min_severity": "medium"}},
            ],
        })
        assert _evaluate_rule(rule, _event(category="environment", severity="high")) is True

    def test_or_both_false(self):
        rule = _mock_rule("composite", {
            "operator": "or",
            "conditions": [
                {"type": "category", "params": {"category": "cyber"}},
                {"type": "severity", "params": {"min_severity": "critical"}},
            ],
        })
        assert _evaluate_rule(rule, _event(category="environment", severity="low")) is False

    def test_default_operator_is_and(self):
        rule = _mock_rule("composite", {
            "conditions": [
                {"type": "category", "params": {"category": "environment"}},
                {"type": "severity", "params": {"min_severity": "critical"}},
            ],
        })
        # Both must match — medium < critical, so should fail
        assert _evaluate_rule(rule, _event(category="environment", severity="medium")) is False

    def test_empty_conditions_and_returns_true(self):
        rule = _mock_rule("composite", {"operator": "and", "conditions": []})
        assert _evaluate_rule(rule, _event()) is True  # all([]) is True

    def test_empty_conditions_or_returns_false(self):
        rule = _mock_rule("composite", {"operator": "or", "conditions": []})
        assert _evaluate_rule(rule, _event()) is False  # any([]) is False

    def test_nested_composite_with_keyword_and_region(self):
        rule = _mock_rule("composite", {
            "operator": "and",
            "conditions": [
                {"type": "keyword", "params": {"keyword": "earthquake"}},
                {"type": "region_bbox", "params": {
                    "min_lat": 30, "max_lat": 40,
                    "min_lng": -120, "max_lng": -110,
                }},
            ],
        })
        assert _evaluate_rule(rule, _event(
            title="Earthquake", lat=35, lng=-115
        )) is True
        assert _evaluate_rule(rule, _event(
            title="Earthquake", lat=50, lng=-115
        )) is False
        assert _evaluate_rule(rule, _event(
            title="Wildfire", lat=35, lng=-115
        )) is False


# ── Unknown condition type ───────────────────────────────────────────────────

class TestUnknownConditionType:
    def test_unknown_type_returns_false(self):
        rule = _mock_rule("nonexistent_type", {})
        assert _evaluate_rule(rule, _event()) is False

    def test_none_condition_params(self):
        rule = _mock_rule("category", None)
        # condition_params is None → params = {} via `or {}`
        assert _evaluate_rule(rule, _event()) is False


# ── Single condition evaluator (used by composite) ──────────────────────────

class TestEvaluateSingleCondition:
    def test_delegates_correctly(self):
        cond = {"type": "category", "params": {"category": "environment"}}
        assert _evaluate_single_condition(cond, _event(category="environment")) is True

    def test_missing_type_returns_false(self):
        cond = {"params": {"category": "environment"}}
        assert _evaluate_single_condition(cond, _event()) is False

    def test_missing_params_uses_empty_dict(self):
        cond = {"type": "category"}
        assert _evaluate_single_condition(cond, _event()) is False
