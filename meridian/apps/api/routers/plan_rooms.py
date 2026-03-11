from typing import Annotated

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.plan_room import (
    Annotation, AnnotationCreate, AnnotationResponse,
    PlanRoom, PlanRoomCreate, PlanRoomMember, PlanRoomResponse,
    Task, TaskCreate, TaskResponse, TaskUpdate,
    TimelineEntry, TimelineEntryCreate, TimelineEntryResponse,
)
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/plan-rooms", tags=["plan-rooms"])

CurrentUser = Annotated[User, Depends(get_current_user)]


async def _get_room_or_404(room_id: int, user_id: int, db: AsyncSession) -> PlanRoom:
    result = await db.execute(select(PlanRoom).where(PlanRoom.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Plan room not found")
    if room.owner_id != user_id:
        member_result = await db.execute(
            select(PlanRoomMember).where(
                PlanRoomMember.plan_room_id == room_id,
                PlanRoomMember.user_id == user_id,
            )
        )
        if not member_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Access denied")
    return room


# ─── Plan Rooms ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[PlanRoomResponse])
async def list_rooms(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    member_sub = select(PlanRoomMember.plan_room_id).where(PlanRoomMember.user_id == current_user.id)
    result = await db.execute(
        select(PlanRoom).where(
            (PlanRoom.owner_id == current_user.id) | (PlanRoom.id.in_(member_sub)),
            PlanRoom.is_archived == False,
        ).order_by(PlanRoom.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=PlanRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(body: PlanRoomCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    room = PlanRoom(
        owner_id=current_user.id,
        name=body.name,
        description=body.description,
        aoi_bbox=body.aoi_bbox,
        aoi_countries=body.aoi_countries or [],
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    db.add(PlanRoomMember(plan_room_id=room.id, user_id=current_user.id, role="owner"))
    await db.commit()
    return room


@router.get("/{room_id}", response_model=PlanRoomResponse)
async def get_room(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return await _get_room_or_404(room_id, current_user.id, db)


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    room = await _get_room_or_404(room_id, current_user.id, db)
    if room.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete a plan room")
    await db.delete(room)
    await db.commit()


# ─── Annotations ─────────────────────────────────────────────────────────────

@router.get("/{room_id}/annotations", response_model=list[AnnotationResponse])
async def list_annotations(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(Annotation).where(Annotation.plan_room_id == room_id).order_by(Annotation.created_at)
    )
    return result.scalars().all()


@router.post("/{room_id}/annotations", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    room_id: int, body: AnnotationCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    ann = Annotation(
        plan_room_id=room_id,
        created_by=current_user.id,
        annotation_type=body.annotation_type,
        label=body.label,
        notes=body.notes,
        color=body.color,
        geom_json=body.geom_json,
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return ann


@router.delete("/{room_id}/annotations/{ann_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    room_id: int, ann_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(select(Annotation).where(Annotation.id == ann_id, Annotation.plan_room_id == room_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await db.delete(ann)
    await db.commit()


# ─── Timeline ─────────────────────────────────────────────────────────────────

@router.get("/{room_id}/timeline", response_model=list[TimelineEntryResponse])
async def list_timeline(
    room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db), limit: int = 100
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(TimelineEntry)
        .where(TimelineEntry.plan_room_id == room_id)
        .order_by(TimelineEntry.entry_time.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/{room_id}/timeline", response_model=TimelineEntryResponse, status_code=status.HTTP_201_CREATED)
async def add_timeline_entry(
    room_id: int, body: TimelineEntryCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    entry = TimelineEntry(
        plan_room_id=room_id,
        created_by=current_user.id,
        title=body.title,
        body=body.body,
        source_label=body.source_label,
        entry_time=body.entry_time,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/{room_id}/timeline/auto-populate", response_model=list[TimelineEntryResponse])
async def auto_populate_timeline(
    room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db),
    hours_back: int = 24, limit: int = 20,
):
    """Auto-populate timeline with recent geo_events within the plan room's AOI bounding box."""
    room = await _get_room_or_404(room_id, current_user.id, db)
    bbox = room.aoi_bbox  # [lng_min, lat_min, lng_max, lat_max]
    if not bbox or len(bbox) != 4:
        raise HTTPException(400, "Plan room has no AOI bounding box defined")

    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    result = await db.execute(
        sa_text("""
            SELECT id, source_id, category, title, body, severity, lat, lng, event_time
            FROM geo_events
            WHERE lat >= :lat_min AND lat <= :lat_max
              AND lng >= :lng_min AND lng <= :lng_max
              AND event_time >= :since
            ORDER BY event_time DESC
            LIMIT :lim
        """),
        {
            "lat_min": bbox[1], "lat_max": bbox[3],
            "lng_min": bbox[0], "lng_max": bbox[2],
            "since": since, "lim": limit,
        },
    )
    rows = result.fetchall()

    # Deduplicate against existing auto entries
    existing = await db.execute(
        select(TimelineEntry.title)
        .where(TimelineEntry.plan_room_id == room_id, TimelineEntry.is_auto == True)
    )
    existing_titles = {r[0] for r in existing.fetchall()}

    entries = []
    for row in rows:
        if row.title in existing_titles:
            continue
        entry = TimelineEntry(
            plan_room_id=room_id,
            created_by=None,
            is_auto=True,
            title=row.title,
            body=f"[{row.severity}] {row.category} — {row.source_id}".replace("_", " "),
            source_label=row.source_id,
            entry_time=row.event_time,
        )
        db.add(entry)
        entries.append(entry)

    if entries:
        await db.commit()
        for e in entries:
            await db.refresh(e)

    return entries


# ─── Tasks ────────────────────────────────────────────────────────────────────

@router.get("/{room_id}/tasks", response_model=list[TaskResponse])
async def list_tasks(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(Task).where(Task.plan_room_id == room_id).order_by(Task.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{room_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    room_id: int, body: TaskCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    task = Task(
        plan_room_id=room_id,
        created_by=current_user.id,
        title=body.title,
        notes=body.notes,
        priority=body.priority,
        assigned_to=body.assigned_to,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{room_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    room_id: int, task_id: int, body: TaskUpdate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(select(Task).where(Task.id == task_id, Task.plan_room_id == room_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(task, field, val)
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{room_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    room_id: int, task_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(select(Task).where(Task.id == task_id, Task.plan_room_id == room_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
