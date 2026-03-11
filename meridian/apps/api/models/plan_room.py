from datetime import datetime
from typing import Optional, Any
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from pydantic import BaseModel

from core.database import Base


class PlanRoom(Base):
    __tablename__ = "plan_rooms"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    aoi_bbox = Column(JSONB, nullable=True)
    aoi_countries = Column(JSONB, nullable=True, default=list)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class PlanRoomMember(Base):
    __tablename__ = "plan_room_members"

    id = Column(Integer, primary_key=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), default="analyst", nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    annotation_type = Column(String(30), nullable=False)
    label = Column(String(300), nullable=True)
    notes = Column(Text, nullable=True)
    color = Column(String(20), default="#00e676", nullable=False)
    geom_json = Column(JSONB, nullable=True)
    is_locked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class TimelineEntry(Base):
    __tablename__ = "timeline_entries"

    id = Column(Integer, primary_key=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_auto = Column(Boolean, default=False, nullable=False)
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    source_label = Column(String(100), nullable=True)
    entry_time = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(400), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String(30), default="to_monitor", nullable=False)
    priority = Column(String(20), default="medium", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class PlanRoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    aoi_bbox: Optional[list[float]] = None
    aoi_countries: Optional[list[str]] = None


class PlanRoomResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    description: Optional[str]
    aoi_bbox: Optional[list]
    aoi_countries: Optional[list]
    is_archived: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AnnotationCreate(BaseModel):
    annotation_type: str
    label: Optional[str] = None
    notes: Optional[str] = None
    color: str = "#00e676"
    geom_json: Optional[dict[str, Any]] = None


class AnnotationResponse(BaseModel):
    id: int
    plan_room_id: int
    created_by: Optional[int]
    annotation_type: str
    label: Optional[str]
    notes: Optional[str]
    color: str
    geom_json: Optional[dict]
    is_locked: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TimelineEntryCreate(BaseModel):
    title: str
    body: Optional[str] = None
    source_label: Optional[str] = None
    entry_time: datetime


class TimelineEntryResponse(BaseModel):
    id: int
    plan_room_id: int
    created_by: Optional[int]
    is_auto: bool
    title: str
    body: Optional[str]
    source_label: Optional[str]
    entry_time: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    priority: str = "medium"
    assigned_to: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[int] = None


class TaskResponse(BaseModel):
    id: int
    plan_room_id: int
    created_by: Optional[int]
    assigned_to: Optional[int]
    title: str
    notes: Optional[str]
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
