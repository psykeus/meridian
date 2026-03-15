"""Create user_ai_keys table for per-user LLM API key storage

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-14 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_ai_keys",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("encrypted_api_key", sa.Text, nullable=False),
        sa.Column("model_preference", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_ai_keys_user_provider"),
    )
    op.create_index("ix_user_ai_keys_user_id", "user_ai_keys", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_ai_keys_user_id")
    op.drop_table("user_ai_keys")
