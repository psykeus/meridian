from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from pydantic import BaseModel

from core.database import Base

ENTITY_TYPES = ["vessel", "aircraft", "location", "country", "keyword", "cyber_asset", "weather_system", "satellite"]


class WatchListEntity(Base):
    __tablename__ = "watch_list_entities"

    id = Column(Integer, primary_key=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    added_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entity_type = Column(String(30), nullable=False)
    label = Column(String(300), nullable=False)
    identifier = Column(String(300), nullable=False)
    radius_meters = Column(Float, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    last_event_at = Column(DateTime(timezone=True), nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class IntelNote(Base):
    __tablename__ = "intel_notes"

    id = Column(Integer, primary_key=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(400), nullable=False)
    body = Column(Text, nullable=True)
    classification = Column(String(20), default="unclassified", nullable=False)
    tags = Column(JSONB, nullable=False, default=list)
    is_pinned = Column(Boolean, default=False, nullable=False)
    linked_event_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class WatchListEntityCreate(BaseModel):
    entity_type: str
    label: str
    identifier: str
    radius_meters: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class WatchListEntityResponse(BaseModel):
    id: int
    plan_room_id: int
    added_by: Optional[int]
    entity_type: str
    label: str
    identifier: str
    radius_meters: Optional[float]
    lat: Optional[float]
    lng: Optional[float]
    last_event_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class IntelNoteCreate(BaseModel):
    title: str
    body: Optional[str] = None
    classification: str = "unclassified"
    tags: list[str] = []
    is_pinned: bool = False
    linked_event_id: Optional[str] = None


class IntelNoteUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    classification: Optional[str] = None
    tags: Optional[list[str]] = None
    is_pinned: Optional[bool] = None


class IntelNoteResponse(BaseModel):
    id: int
    plan_room_id: int
    created_by: Optional[int]
    title: str
    body: Optional[str]
    classification: str
    tags: list
    is_pinned: bool
    linked_event_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
