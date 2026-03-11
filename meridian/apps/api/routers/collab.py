"""Collaborative extras — annotation comments, timeline AI summary, team alerts."""
import logging
from datetime import datetime, timezone
from typing import Annotated, AsyncGenerator

import httpx
import orjson
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.collab import AnnotationComment, AnnotationCommentCreate, AnnotationCommentResponse
from models.plan_room import Annotation, TimelineEntry
from models.user import User
from routers.auth import get_current_user
from routers.plan_rooms import _get_room_or_404

router = APIRouter(prefix="/plan-rooms", tags=["collab"])
CurrentUser = Annotated[User, Depends(get_current_user)]
logger = logging.getLogger(__name__)

AI_BASE = "http://ai:8001"


# ─── Annotation Comments ──────────────────────────────────────────────────────

@router.get("/{room_id}/annotations/{ann_id}/comments", response_model=list[AnnotationCommentResponse])
async def list_comments(
    room_id: int, ann_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(AnnotationComment)
        .where(AnnotationComment.annotation_id == ann_id, AnnotationComment.plan_room_id == room_id)
        .order_by(AnnotationComment.created_at)
    )
    return result.scalars().all()


@router.post(
    "/{room_id}/annotations/{ann_id}/comments",
    response_model=AnnotationCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    room_id: int, ann_id: int, body: AnnotationCommentCreate,
    current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    ann_result = await db.execute(
        select(Annotation).where(Annotation.id == ann_id, Annotation.plan_room_id == room_id)
    )
    if not ann_result.scalar_one_or_none():
        raise HTTPException(404, "Annotation not found")

    comment = AnnotationComment(
        annotation_id=ann_id,
        plan_room_id=room_id,
        created_by=current_user.id,
        body=body.body,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.delete("/{room_id}/annotations/{ann_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    room_id: int, ann_id: int, comment_id: int,
    current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(AnnotationComment).where(
            AnnotationComment.id == comment_id,
            AnnotationComment.annotation_id == ann_id,
            AnnotationComment.plan_room_id == room_id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, "Comment not found")
    if comment.created_by != current_user.id:
        raise HTTPException(403, "Cannot delete another user's comment")
    await db.delete(comment)
    await db.commit()


# ─── Annotation Lock / Unlock ─────────────────────────────────────────────────

@router.post("/{room_id}/annotations/{ann_id}/lock", status_code=204)
async def lock_annotation(
    room_id: int, ann_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(Annotation).where(Annotation.id == ann_id, Annotation.plan_room_id == room_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Annotation not found")
    ann.is_locked = True
    await db.commit()


@router.post("/{room_id}/annotations/{ann_id}/unlock", status_code=204)
async def unlock_annotation(
    room_id: int, ann_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(Annotation).where(Annotation.id == ann_id, Annotation.plan_room_id == room_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Annotation not found")
    ann.is_locked = False
    await db.commit()


# ─── Timeline AI Summary (streaming) ─────────────────────────────────────────

@router.get("/{room_id}/timeline/summary")
async def timeline_ai_summary(
    room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    entries = (await db.execute(
        select(TimelineEntry)
        .where(TimelineEntry.plan_room_id == room_id)
        .order_by(TimelineEntry.entry_time.desc())
        .limit(50)
    )).scalars().all()

    if not entries:
        raise HTTPException(404, "No timeline entries to summarize")

    lines = [
        f"- [{e.entry_time.strftime('%Y-%m-%d %H:%M')} UTC] {e.title}"
        + (f": {e.body[:120]}" if e.body else "")
        for e in entries
    ]
    timeline_text = "\n".join(lines)

    prompt = (
        f"You are an intelligence analyst. Summarize the following Plan Room timeline in 3-4 sentences, "
        f"highlighting key developments, escalation patterns, and watch points:\n\n{timeline_text}"
    )

    async def gen() -> AsyncGenerator[bytes, None]:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    f"{AI_BASE}/ai/chat",
                    json={"messages": [{"role": "user", "content": prompt}], "stream": True},
                ) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            yield (line + "\n\n").encode()
        except Exception as e:
            yield f"data: {orjson.dumps({'type': 'error', 'text': str(e)}).decode()}\n\n".encode()
        yield b"data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache"})


# ─── Plan Room Member List ────────────────────────────────────────────────────

@router.get("/{room_id}/members")
async def list_room_members(
    room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
) -> list[dict]:
    from models.plan_room import PlanRoomMember
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(PlanRoomMember).where(PlanRoomMember.plan_room_id == room_id)
    )
    members = result.scalars().all()
    return [{"user_id": m.user_id, "role": m.role, "joined_at": m.joined_at.isoformat()} for m in members]


@router.post("/{room_id}/members/{user_id}", status_code=201)
async def add_room_member(
    room_id: int, user_id: int, role: str = "analyst",
    current_user: CurrentUser = None, db: AsyncSession = Depends(get_db)
) -> dict:
    from models.plan_room import PlanRoom, PlanRoomMember
    room = await _get_room_or_404(room_id, current_user.id, db)
    if room.owner_id != current_user.id:
        raise HTTPException(403, "Only the room owner can add members")

    from sqlalchemy import select as sel
    existing = await db.execute(
        sel(PlanRoomMember).where(
            PlanRoomMember.plan_room_id == room_id,
            PlanRoomMember.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "User already a member")

    member = PlanRoomMember(plan_room_id=room_id, user_id=user_id, role=role)
    db.add(member)
    await db.commit()
    return {"user_id": user_id, "role": role}
