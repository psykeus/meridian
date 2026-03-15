"""Per-user AI API key storage model."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func

from core.database import Base


class UserAIKey(Base):
    __tablename__ = "user_ai_keys"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_ai_keys_user_provider"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(30), nullable=False)
    # Stored as plaintext; column name retained for DB compatibility
    encrypted_api_key = Column("encrypted_api_key", Text, nullable=False)
    model_preference = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class UserAIKeyCreate(BaseModel):
    provider: str
    api_key: Optional[str] = None
    model_preference: Optional[str] = None


class UserAIKeyResponse(BaseModel):
    provider: str
    key_preview: str
    model_preference: Optional[str] = None
    is_active: bool = True

    model_config = {"from_attributes": True}
