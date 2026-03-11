"""Organization, API tokens, and audit log models."""
import secrets
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from pydantic import BaseModel

from core.database import Base


# ─── Organization ─────────────────────────────────────────────────────────────

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    tier = Column(String(30), default="team_starter", nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    stripe_customer_id = Column(String(100), nullable=True)
    stripe_subscription_id = Column(String(100), nullable=True)
    subscription_status = Column(String(30), default="trialing", nullable=False)
    max_members = Column(Integer, default=5, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), default="member", nullable=False)
    invited_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ─── API Tokens ───────────────────────────────────────────────────────────────

class APIToken(Base):
    __tablename__ = "api_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    token_prefix = Column(String(12), nullable=False)
    scope = Column(String(20), default="read", nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ─── Audit Log ────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    plan_room_id = Column(Integer, ForeignKey("plan_rooms.id", ondelete="CASCADE"), nullable=True, index=True)
    action = Column(String(80), nullable=False)
    resource_type = Column(String(40), nullable=True)
    resource_id = Column(String(100), nullable=True)
    detail = Column(JSONB, nullable=False, default=dict)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str
    slug: str


class OrgResponse(BaseModel):
    id: int
    name: str
    slug: str
    tier: str
    max_members: int
    subscription_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OrgMemberResponse(BaseModel):
    id: int
    user_id: int
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class APITokenCreate(BaseModel):
    name: str
    scope: str = "read"
    expires_days: Optional[int] = None


class APITokenResponse(BaseModel):
    id: int
    name: str
    token_prefix: str
    scope: str
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class APITokenCreated(APITokenResponse):
    raw_token: str


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    detail: dict
    created_at: datetime

    model_config = {"from_attributes": True}
