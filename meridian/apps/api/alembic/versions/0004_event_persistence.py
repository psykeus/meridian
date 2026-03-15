"""fix geo_events id type and make it sole primary key for upsert support

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-11 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Change id column from UUID to Text so arbitrary string IDs work.
    # Keep composite PK (id, ingested_at) — TimescaleDB hypertables require
    # the partition column in all unique constraints / primary keys.
    op.execute("ALTER TABLE geo_events DROP CONSTRAINT geo_events_pkey")
    op.execute("ALTER TABLE geo_events ALTER COLUMN id TYPE TEXT USING id::text")
    op.execute(
        "ALTER TABLE geo_events ADD CONSTRAINT geo_events_pkey "
        "PRIMARY KEY (id, ingested_at)"
    )

    # Index ingested_at as a regular column for time-range queries
    op.create_index("ix_geo_events_ingested_at", "geo_events", ["ingested_at"])


def downgrade() -> None:
    op.drop_index("ix_geo_events_ingested_at", "geo_events")
    op.execute("ALTER TABLE geo_events DROP CONSTRAINT geo_events_pkey")
    op.execute("ALTER TABLE geo_events ALTER COLUMN id TYPE UUID USING id::uuid")
    op.execute(
        "ALTER TABLE geo_events ADD CONSTRAINT geo_events_pkey PRIMARY KEY (id, ingested_at)"
    )
