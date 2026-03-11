from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.alert import (
    AlertNotification,
    AlertNotificationResponse,
    AlertRule,
    AlertRuleCreate,
    AlertRuleResponse,
)
from routers.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/alerts", tags=["alerts"])

CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/rules", response_model=list[AlertRuleResponse])
async def list_rules(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlertRule).where(AlertRule.user_id == current_user.id).order_by(AlertRule.created_at.desc())
    )
    return result.scalars().all()


@router.post("/rules", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: AlertRuleCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    rule = AlertRule(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        condition_type=body.condition_type.value,
        condition_params=body.condition_params,
        delivery_channels=[ch.value for ch in body.delivery_channels],
        webhook_url=body.webhook_url,
        email_to=body.email_to,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}/toggle", response_model=AlertRuleResponse)
async def toggle_rule(rule_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == current_user.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.is_active = not rule.is_active
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == current_user.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()


@router.get("/notifications", response_model=list[AlertNotificationResponse])
async def list_notifications(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    unread_only: bool = False,
    limit: int = 50,
):
    q = select(AlertNotification).where(AlertNotification.user_id == current_user.id)
    if unread_only:
        q = q.where(AlertNotification.is_read == False)
    q = q.order_by(AlertNotification.created_at.desc()).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(notification_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(AlertNotification)
        .where(AlertNotification.id == notification_id, AlertNotification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(AlertNotification)
        .where(AlertNotification.user_id == current_user.id, AlertNotification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()


@router.get("/notifications/unread-count")
async def unread_count(current_user: CurrentUser, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(AlertNotification).where(
            AlertNotification.user_id == current_user.id,
            AlertNotification.is_read == False,
        )
    )
    count = len(result.scalars().all())
    return {"count": count}
