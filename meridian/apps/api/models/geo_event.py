import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from core.database import Base


class FeedCategory(str, Enum):
    environment = "environment"
    military = "military"
    aviation = "aviation"
    maritime = "maritime"
    cyber = "cyber"
    finance = "finance"
    geopolitical = "geopolitical"
    humanitarian = "humanitarian"
    nuclear = "nuclear"
    space = "space"
    social = "social"
    energy = "energy"


class SeverityLevel(str, Enum):
    info = "info"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


# ─── SQLAlchemy ORM Model ─────────────────────────────────────────────────────

class GeoEventORM(Base):
    __tablename__ = "geo_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, index=True)
    subcategory = Column(String)
    title = Column(Text, nullable=False)
    body = Column(Text)
    severity = Column(String, nullable=False, default="info")
    lat = Column("lat", type_=None, nullable=False)
    lng = Column("lng", type_=None, nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=False, default=dict)
    url = Column(Text)
    event_time = Column(DateTime(timezone=True), nullable=False, index=True)
    ingested_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        primary_key=True,
    )

    __table_args__ = (
        Index("ix_geo_events_category_ingested", "category", "ingested_at"),
        Index("ix_geo_events_source_ingested", "source_id", "ingested_at"),
    )


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class GeoEvent(BaseModel):
    """The universal event schema all feed workers must produce."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_id: str
    category: FeedCategory
    subcategory: str | None = None
    title: str
    body: str | None = None
    severity: SeverityLevel = SeverityLevel.info
    lat: float
    lng: float
    metadata: dict[str, Any] = Field(default_factory=dict)
    url: str | None = None
    event_time: datetime

    model_config = {"use_enum_values": True}


class GeoEventResponse(GeoEvent):
    ingested_at: datetime

    model_config = {"from_attributes": True}


class GeoEventFilter(BaseModel):
    category: FeedCategory | None = None
    severity: SeverityLevel | None = None
    source_id: str | None = None
    lat_min: float | None = None
    lat_max: float | None = None
    lng_min: float | None = None
    lng_max: float | None = None
    hours_back: int = 24
    limit: int = Field(default=500, le=2000)
    offset: int = 0
