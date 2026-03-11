"""API token management — scoped programmatic access tokens."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.org import APIToken, APITokenCreate, APITokenCreated, APITokenResponse
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/tokens", tags=["tokens"])
CurrentUser = Annotated[User, Depends(get_current_user)]

PREFIX = "mid_"


def _generate_token() -> tuple[str, str, str]:
    """Returns (raw_token, token_hash, token_prefix)."""
    raw = PREFIX + secrets.token_urlsafe(40)
    h = hashlib.sha256(raw.encode()).hexdigest()
    prefix = raw[:12]
    return raw, h, prefix


@router.get("", response_model=list[APITokenResponse])
async def list_tokens(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(APIToken)
        .where(APIToken.user_id == current_user.id, APIToken.is_active == True)  # noqa: E712
        .order_by(APIToken.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=APITokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(body: APITokenCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    if body.scope not in ("read", "write"):
        raise HTTPException(400, "Scope must be 'read' or 'write'")

    raw, h, prefix = _generate_token()
    expires_at = None
    if body.expires_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_days)

    token = APIToken(
        user_id=current_user.id,
        name=body.name,
        token_hash=h,
        token_prefix=prefix,
        scope=body.scope,
        expires_at=expires_at,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    resp = APITokenCreated.model_validate(token)
    resp.raw_token = raw
    return resp


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(token_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(APIToken).where(APIToken.id == token_id, APIToken.user_id == current_user.id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(404, "Token not found")
    await db.execute(
        update(APIToken).where(APIToken.id == token_id).values(is_active=False)
    )
    await db.commit()


async def get_user_by_api_token(raw_token: str, db: AsyncSession) -> User | None:
    """Validate a raw API token and return the owning user (or None)."""
    h = hashlib.sha256(raw_token.encode()).hexdigest()
    result = await db.execute(
        select(APIToken).where(
            APIToken.token_hash == h,
            APIToken.is_active == True,  # noqa: E712
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        return None
    if token.expires_at and token.expires_at < datetime.now(timezone.utc):
        return None

    await db.execute(
        update(APIToken).where(APIToken.id == token.id)
        .values(last_used_at=datetime.now(timezone.utc))
    )
    await db.commit()

    user_result = await db.execute(select(User).where(User.id == token.user_id))
    return user_result.scalar_one_or_none()
