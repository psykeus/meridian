"""User-customizable AI prompt configurations."""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from core.database import Base


class PromptConfig(Base):
    __tablename__ = "prompt_configs"
    __table_args__ = (
        UniqueConstraint("user_id", "prompt_key", name="uq_prompt_configs_user_key"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt_key = Column(String(50), nullable=False)
    system_prompt = Column(Text, nullable=False)
    model_override = Column(String(100), nullable=True)
    temperature = Column(Float, nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
