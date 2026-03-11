from datetime import datetime
from enum import Enum
from typing import Optional, Any
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from pydantic import BaseModel

from core.database import Base


class AlertConditionType(str, Enum):
    CATEGORY = "category"
    SEVERITY = "severity"
    KEYWORD = "keyword"
    SOURCE = "source"
    REGION_BBOX = "region_bbox"
    COMPOSITE = "composite"


class AlertDeliveryChannel(str, Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    WEBHOOK = "webhook"


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    condition_type = Column(String(30), nullable=False)
    condition_params = Column(JSONB, nullable=False, default={})
    delivery_channels = Column(JSONB, nullable=False, default=["in_app"])
    webhook_url = Column(Text, nullable=True)
    email_to = Column(String(255), nullable=True)
    trigger_count = Column(Integer, default=0, nullable=False)
    last_triggered = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AlertNotification(Base):
    __tablename__ = "alert_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=True)
    severity = Column(String(20), nullable=False, default="medium")
    source_event_id = Column(String(200), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AlertRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    condition_type: AlertConditionType
    condition_params: dict[str, Any] = {}
    delivery_channels: list[AlertDeliveryChannel] = [AlertDeliveryChannel.IN_APP]
    webhook_url: Optional[str] = None
    email_to: Optional[str] = None


class AlertRuleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    condition_type: str
    condition_params: dict
    delivery_channels: list
    trigger_count: int
    last_triggered: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertNotificationResponse(BaseModel):
    id: int
    rule_id: Optional[int]
    title: str
    body: Optional[str]
    severity: str
    source_event_id: Optional[str]
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
