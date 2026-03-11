"""Collaborative Plan Mode models — annotation comments and shareable links."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from pydantic import BaseModel

from core.database import Base


class AnnotationComment(Base):
    __tablename__ = "annotation_comments"

    id = Column(Integer, primary_key=True, index=True)
    annotation_id = Column(Integer, ForeignKey("annotations.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ShareableLink(Base):
    __tablename__ = "shareable_links"

    id = Column(Integer, primary_key=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    label = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    view_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class AnnotationCommentCreate(BaseModel):
    body: str


class AnnotationCommentResponse(BaseModel):
    id: int
    annotation_id: int
    created_by: Optional[int]
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ShareableLinkCreate(BaseModel):
    label: Optional[str] = None
    expires_days: Optional[int] = None


class ShareableLinkResponse(BaseModel):
    id: int
    plan_room_id: int
    token: str
    label: Optional[str]
    is_active: bool
    expires_at: Optional[datetime]
    view_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
