"""Create prompt_configs table for user-customizable AI prompts

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prompt_configs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("prompt_key", sa.String(50), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("model_override", sa.String(100), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "prompt_key", name="uq_prompt_configs_user_key"),
    )


def downgrade() -> None:
    op.drop_table("prompt_configs")
