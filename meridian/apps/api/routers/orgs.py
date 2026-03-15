"""Organization management — create, invite, manage members."""
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.org import (
    Organization, OrganizationMember,
    OrgCreate, OrgResponse, OrgMemberResponse,
)
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/orgs", tags=["organizations"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _slug_valid(slug: str) -> bool:
    return bool(re.match(r"^[a-z0-9-]{3,50}$", slug))


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
async def create_org(body: OrgCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    if not _slug_valid(body.slug):
        raise HTTPException(400, "Slug must be 3-50 lowercase alphanumeric or hyphen chars")
    existing = await db.execute(select(Organization).where(Organization.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Slug already taken")

    org = Organization(name=body.name, slug=body.slug, owner_id=current_user.id)
    db.add(org)
    await db.commit()
    await db.refresh(org)

    db.add(OrganizationMember(org_id=org.id, user_id=current_user.id, role="owner"))
    await db.commit()
    return org


@router.get("", response_model=list[OrgResponse])
async def list_orgs(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    member_sub = select(OrganizationMember.org_id).where(OrganizationMember.user_id == current_user.id)
    result = await db.execute(select(Organization).where(Organization.id.in_(member_sub)))
    return result.scalars().all()


@router.get("/{org_id}", response_model=OrgResponse)
async def get_org(org_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await _get_org_member_or_404(org_id, current_user.id, db)


@router.get("/{org_id}/members", response_model=list[OrgMemberResponse])
async def list_members(org_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await _get_org_member_or_404(org_id, current_user.id, db)
    result = await db.execute(
        select(OrganizationMember).where(OrganizationMember.org_id == org_id)
    )
    return result.scalars().all()


@router.post("/{org_id}/members/{user_id}", response_model=OrgMemberResponse, status_code=201)
async def invite_member(
    org_id: int, user_id: int, current_user: CurrentUser,
    role: str = "member", db: AsyncSession = Depends(get_db),
):
    org = await _get_org_member_or_404(org_id, current_user.id, db)
    await _require_owner_or_admin(org_id, current_user.id, db)

    # Enforce member limit using org's tier-based max_members
    max_members = getattr(org, "max_members", 500) or 500
    count_result = await db.execute(
        select(func.count()).select_from(OrganizationMember).where(OrganizationMember.org_id == org_id)
    )
    current_count = count_result.scalar() or 0
    if current_count >= max_members:
        raise HTTPException(400, f"Organization has reached the member limit ({max_members})")

    existing = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "User is already a member")

    member = OrganizationMember(
        org_id=org_id, user_id=user_id, role=role, invited_by=current_user.id
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(
    org_id: int, user_id: int, current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _require_owner_or_admin(org_id, current_user.id, db)
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")
    await db.delete(member)
    await db.commit()


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_org_member_or_404(org_id: int, user_id: int, db: AsyncSession) -> Organization:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organization not found")
    member_result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(403, "Not a member of this organization")
    return org


async def _require_owner_or_admin(org_id: int, user_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.role.in_(["owner", "admin"]),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(403, "Owner or admin role required")
