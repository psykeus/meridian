"""Database hardening: watch list unique constraint, GIN indexes on JSONB, intel classification check

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-11 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Prevent duplicate watch list tracking for the same entity in a room
    op.create_unique_constraint(
        "uq_watch_list_room_type_identifier",
        "watch_list_entities",
        ["plan_room_id", "entity_type", "identifier"],
    )

    # GIN index on geo_events.metadata for fast JSONB queries at scale
    op.execute("CREATE INDEX IF NOT EXISTS idx_geo_events_metadata_gin ON geo_events USING GIN (metadata)")

    # GIN index on intel_notes.tags for fast tag-based queries
    op.execute("CREATE INDEX IF NOT EXISTS idx_intel_notes_tags_gin ON intel_notes USING GIN (tags)")

    # Add CHECK constraint on intel_notes.classification
    op.execute("""
        ALTER TABLE intel_notes
        ADD CONSTRAINT chk_intel_classification
        CHECK (classification IN ('unclassified', 'confidential', 'secret', 'top_secret'))
    """)

    # Add CHECK constraint on tasks.priority
    op.execute("""
        ALTER TABLE tasks
        ADD CONSTRAINT chk_task_priority
        CHECK (priority IN ('low', 'medium', 'high', 'critical'))
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_task_priority")
    op.execute("ALTER TABLE intel_notes DROP CONSTRAINT IF EXISTS chk_intel_classification")
    op.execute("DROP INDEX IF EXISTS idx_intel_notes_tags_gin")
    op.execute("DROP INDEX IF EXISTS idx_geo_events_metadata_gin")
    op.drop_constraint("uq_watch_list_room_type_identifier", "watch_list_entities", type_="unique")
