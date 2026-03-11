"""
Tests for Pydantic models and data validation — GeoEvent, GeoEventFilter,
UserCreate, AlertRuleCreate. Validates field constraints, enum values,
defaults, and serialization behavior.
"""
import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from models.geo_event import (
    FeedCategory,
    GeoEvent,
    GeoEventFilter,
    GeoEventResponse,
    SeverityLevel,
)
from models.user import UserCreate, UserLogin, UserResponse, TokenResponse
from models.alert import AlertConditionType, AlertDeliveryChannel, AlertRuleCreate


# ── FeedCategory enum ────────────────────────────────────────────────────────

class TestFeedCategory:
    def test_all_expected_categories_exist(self):
        expected = {
            "environment", "military", "aviation", "maritime", "cyber",
            "finance", "geopolitical", "humanitarian", "nuclear", "space",
            "social", "energy",
        }
        actual = {c.value for c in FeedCategory}
        assert expected == actual

    def test_has_12_categories(self):
        assert len(FeedCategory) == 12


# ── SeverityLevel enum ──────────────────────────────────────────────────────

class TestSeverityLevel:
    def test_all_expected_levels_exist(self):
        expected = {"info", "low", "medium", "high", "critical"}
        actual = {s.value for s in SeverityLevel}
        assert expected == actual

    def test_has_5_levels(self):
        assert len(SeverityLevel) == 5


# ── GeoEvent model ──────────────────────────────────────────────────────────

class TestGeoEvent:
    def _valid_event(self, **overrides):
        base = {
            "source_id": "test_source",
            "category": "environment",
            "title": "Test Event",
            "lat": 34.0,
            "lng": -118.0,
            "event_time": datetime.now(timezone.utc),
        }
        base.update(overrides)
        return GeoEvent(**base)

    def test_creates_with_minimal_fields(self):
        event = self._valid_event()
        assert event.source_id == "test_source"
        assert event.category == "environment"

    def test_auto_generates_uuid_id(self):
        event = self._valid_event()
        # Should be a valid UUID
        uuid.UUID(event.id)  # raises ValueError if not valid

    def test_different_events_get_different_ids(self):
        e1 = self._valid_event()
        e2 = self._valid_event()
        assert e1.id != e2.id

    def test_custom_id_overrides_default(self):
        event = self._valid_event(id="custom_id_123")
        assert event.id == "custom_id_123"

    def test_default_severity_is_info(self):
        event = self._valid_event()
        assert event.severity == "info"  # use_enum_values=True

    def test_default_metadata_is_empty_dict(self):
        event = self._valid_event()
        assert event.metadata == {}

    def test_optional_fields_default_to_none(self):
        event = self._valid_event()
        assert event.subcategory is None
        assert event.body is None
        assert event.url is None

    def test_accepts_all_categories(self):
        for cat in FeedCategory:
            event = self._valid_event(category=cat.value)
            assert event.category == cat.value

    def test_rejects_invalid_category(self):
        with pytest.raises(ValidationError):
            self._valid_event(category="nonexistent_category")

    def test_accepts_all_severities(self):
        for sev in SeverityLevel:
            event = self._valid_event(severity=sev.value)
            assert event.severity == sev.value

    def test_rejects_invalid_severity(self):
        with pytest.raises(ValidationError):
            self._valid_event(severity="ultra_critical")

    def test_metadata_accepts_nested_dict(self):
        event = self._valid_event(metadata={"depth_km": 10.5, "nested": {"key": "val"}})
        assert event.metadata["depth_km"] == 10.5

    def test_use_enum_values_serializes_strings(self):
        event = self._valid_event(category=FeedCategory.cyber, severity=SeverityLevel.critical)
        assert event.category == "cyber"
        assert event.severity == "critical"

    def test_model_dump_produces_serializable_dict(self):
        event = self._valid_event()
        d = event.model_dump(mode="json")
        assert isinstance(d, dict)
        assert isinstance(d["category"], str)
        assert isinstance(d["event_time"], str)

    def test_requires_source_id(self):
        with pytest.raises(ValidationError):
            GeoEvent(
                category="environment",
                title="No source",
                lat=0, lng=0,
                event_time=datetime.now(timezone.utc),
            )

    def test_requires_title(self):
        with pytest.raises(ValidationError):
            GeoEvent(
                source_id="test",
                category="environment",
                lat=0, lng=0,
                event_time=datetime.now(timezone.utc),
            )

    def test_requires_lat_and_lng(self):
        with pytest.raises(ValidationError):
            GeoEvent(
                source_id="test",
                category="environment",
                title="Missing coords",
                event_time=datetime.now(timezone.utc),
            )


# ── GeoEventFilter model ────────────────────────────────────────────────────

class TestGeoEventFilter:
    def test_default_values(self):
        f = GeoEventFilter()
        assert f.hours_back == 24
        assert f.limit == 500
        assert f.offset == 0
        assert f.category is None
        assert f.severity is None

    def test_limit_max_2000(self):
        with pytest.raises(ValidationError):
            GeoEventFilter(limit=2001)

    def test_limit_at_2000_ok(self):
        f = GeoEventFilter(limit=2000)
        assert f.limit == 2000


# ── UserCreate model ────────────────────────────────────────────────────────

class TestUserCreate:
    def test_valid_user(self):
        u = UserCreate(email="test@example.com", password="StrongPass123")
        assert u.email == "test@example.com"

    def test_rejects_short_password(self):
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(email="x@y.com", password="short")
        assert "8 characters" in str(exc_info.value)

    def test_8_char_password_accepted(self):
        u = UserCreate(email="x@y.com", password="exactly8")
        assert u.password == "exactly8"

    def test_rejects_invalid_email(self):
        with pytest.raises(ValidationError):
            UserCreate(email="not-an-email", password="StrongPass123")

    def test_full_name_is_optional(self):
        u = UserCreate(email="x@y.com", password="StrongPass123")
        assert u.full_name is None


# ── AlertRuleCreate model ───────────────────────────────────────────────────

class TestAlertRuleCreate:
    def test_valid_rule(self):
        rule = AlertRuleCreate(
            name="High severity events",
            condition_type=AlertConditionType.SEVERITY,
            condition_params={"min_severity": "high"},
        )
        assert rule.name == "High severity events"
        assert rule.condition_type == AlertConditionType.SEVERITY

    def test_default_delivery_is_in_app(self):
        rule = AlertRuleCreate(
            name="Test",
            condition_type=AlertConditionType.CATEGORY,
        )
        assert rule.delivery_channels == [AlertDeliveryChannel.IN_APP]

    def test_default_condition_params_is_empty_dict(self):
        rule = AlertRuleCreate(
            name="Test",
            condition_type=AlertConditionType.KEYWORD,
        )
        assert rule.condition_params == {}

    def test_optional_webhook_and_email(self):
        rule = AlertRuleCreate(
            name="Test",
            condition_type=AlertConditionType.CATEGORY,
        )
        assert rule.webhook_url is None
        assert rule.email_to is None

    def test_accepts_all_condition_types(self):
        for ct in AlertConditionType:
            rule = AlertRuleCreate(name="Test", condition_type=ct)
            assert rule.condition_type == ct

    def test_accepts_all_delivery_channels(self):
        rule = AlertRuleCreate(
            name="Test",
            condition_type=AlertConditionType.CATEGORY,
            delivery_channels=list(AlertDeliveryChannel),
        )
        assert len(rule.delivery_channels) == 3


# ── AlertConditionType enum ─────────────────────────────────────────────────

class TestAlertConditionType:
    def test_all_expected_types(self):
        expected = {"category", "severity", "keyword", "source", "region_bbox", "composite"}
        actual = {ct.value for ct in AlertConditionType}
        assert expected == actual


# ── AlertDeliveryChannel enum ────────────────────────────────────────────────

class TestAlertDeliveryChannel:
    def test_all_expected_channels(self):
        expected = {"in_app", "email", "webhook"}
        actual = {ch.value for ch in AlertDeliveryChannel}
        assert expected == actual
