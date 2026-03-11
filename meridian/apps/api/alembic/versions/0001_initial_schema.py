"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tier", sa.String(length=20), nullable=False, server_default="free"),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_id", "users", ["id"])

    # ── geo_events ─────────────────────────────────────────────────────────────
    op.create_table(
        "geo_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_id", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("subcategory", sa.String(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(), nullable=False, server_default="info"),
        sa.Column("lat", sa.Numeric(), nullable=False),
        sa.Column("lng", sa.Numeric(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("event_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", "ingested_at"),
    )
    op.create_index("ix_geo_events_source_id", "geo_events", ["source_id"])
    op.create_index("ix_geo_events_category", "geo_events", ["category"])
    op.create_index("ix_geo_events_event_time", "geo_events", ["event_time"])
    op.create_index("ix_geo_events_category_ingested", "geo_events", ["category", "ingested_at"])
    op.create_index("ix_geo_events_source_ingested", "geo_events", ["source_id", "ingested_at"])

    # ── alert_rules ────────────────────────────────────────────────────────────
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("condition_type", sa.String(length=30), nullable=False),
        sa.Column("condition_params", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("delivery_channels", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='["in_app"]'),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column("email_to", sa.String(length=255), nullable=True),
        sa.Column("trigger_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_triggered", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_rules_user_id", "alert_rules", ["user_id"])
    op.create_index("ix_alert_rules_id", "alert_rules", ["id"])

    # ── alert_notifications ────────────────────────────────────────────────────
    op.create_table(
        "alert_notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("source_event_id", sa.String(length=200), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["rule_id"], ["alert_rules.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_notifications_user_id", "alert_notifications", ["user_id"])
    op.create_index("ix_alert_notifications_id", "alert_notifications", ["id"])

    # ── plan_rooms ─────────────────────────────────────────────────────────────
    op.create_table(
        "plan_rooms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("aoi_bbox", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("aoi_countries", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_rooms_owner_id", "plan_rooms", ["owner_id"])
    op.create_index("ix_plan_rooms_id", "plan_rooms", ["id"])

    # ── plan_room_members ──────────────────────────────────────────────────────
    op.create_table(
        "plan_room_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_room_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="analyst"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["plan_room_id"], ["plan_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_room_members_plan_room_id", "plan_room_members", ["plan_room_id"])
    op.create_index("ix_plan_room_members_id", "plan_room_members", ["id"])

    # ── annotations ────────────────────────────────────────────────────────────
    op.create_table(
        "annotations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_room_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("annotation_type", sa.String(length=30), nullable=False),
        sa.Column("label", sa.String(length=300), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#00e676"),
        sa.Column("geom_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_room_id"], ["plan_rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_annotations_plan_room_id", "annotations", ["plan_room_id"])
    op.create_index("ix_annotations_id", "annotations", ["id"])

    # ── timeline_entries ───────────────────────────────────────────────────────
    op.create_table(
        "timeline_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_room_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("is_auto", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("source_label", sa.String(length=100), nullable=True),
        sa.Column("entry_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_room_id"], ["plan_rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_timeline_entries_plan_room_id", "timeline_entries", ["plan_room_id"])
    op.create_index("ix_timeline_entries_id", "timeline_entries", ["id"])

    # ── tasks ──────────────────────────────────────────────────────────────────
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_room_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("assigned_to", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=400), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="to_monitor"),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_room_id"], ["plan_rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_plan_room_id", "tasks", ["plan_room_id"])
    op.create_index("ix_tasks_id", "tasks", ["id"])

    # ── watch_list_entities ────────────────────────────────────────────────────
    op.create_table(
        "watch_list_entities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_room_id", sa.Integer(), nullable=False),
        sa.Column("added_by", sa.Integer(), nullable=True),
        sa.Column("entity_type", sa.String(length=30), nullable=False),
        sa.Column("label", sa.String(length=300), nullable=False),
        sa.Column("identifier", sa.String(length=300), nullable=False),
        sa.Column("radius_meters", sa.Float(), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["added_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_room_id"], ["plan_rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_watch_list_entities_plan_room_id", "watch_list_entities", ["plan_room_id"])
    op.create_index("ix_watch_list_entities_id", "watch_list_entities", ["id"])

    # ── intel_notes ────────────────────────────────────────────────────────────
    op.create_table(
        "intel_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_room_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=400), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("classification", sa.String(length=20), nullable=False, server_default="unclassified"),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("linked_event_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_room_id"], ["plan_rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_intel_notes_plan_room_id", "intel_notes", ["plan_room_id"])
    op.create_index("ix_intel_notes_id", "intel_notes", ["id"])

    # ── sequences for integer PKs ──────────────────────────────────────────────
    for table in [
        "users", "alert_rules", "alert_notifications", "plan_rooms",
        "plan_room_members", "annotations", "timeline_entries", "tasks",
        "watch_list_entities", "intel_notes",
    ]:
        op.execute(
            f"CREATE SEQUENCE IF NOT EXISTS {table}_id_seq OWNED BY {table}.id;"
            f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT nextval('{table}_id_seq');"
        )


def downgrade() -> None:
    for tbl in [
        "intel_notes", "watch_list_entities", "tasks", "timeline_entries",
        "annotations", "plan_room_members", "plan_rooms",
        "alert_notifications", "alert_rules", "geo_events", "users",
    ]:
        op.drop_table(tbl)
