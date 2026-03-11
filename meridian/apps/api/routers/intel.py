from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.watch_list import (
    IntelNote, IntelNoteCreate, IntelNoteResponse, IntelNoteUpdate,
    WatchListEntity, WatchListEntityCreate, WatchListEntityResponse,
)
from models.user import User
from routers.auth import get_current_user
from routers.plan_rooms import _get_room_or_404

router = APIRouter(prefix="/plan-rooms", tags=["intel"])

CurrentUser = Annotated[User, Depends(get_current_user)]


# ─── Watch List ───────────────────────────────────────────────────────────────

@router.get("/{room_id}/watch-list", response_model=list[WatchListEntityResponse])
async def list_watch_entities(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(WatchListEntity).where(WatchListEntity.plan_room_id == room_id).order_by(WatchListEntity.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{room_id}/watch-list", response_model=WatchListEntityResponse, status_code=status.HTTP_201_CREATED)
async def add_watch_entity(
    room_id: int, body: WatchListEntityCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    entity = WatchListEntity(
        plan_room_id=room_id,
        added_by=current_user.id,
        entity_type=body.entity_type,
        label=body.label,
        identifier=body.identifier,
        radius_meters=body.radius_meters,
        lat=body.lat,
        lng=body.lng,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.delete("/{room_id}/watch-list/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_watch_entity(
    room_id: int, entity_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(WatchListEntity).where(WatchListEntity.id == entity_id, WatchListEntity.plan_room_id == room_id)
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Watch entity not found")
    await db.delete(entity)
    await db.commit()


# ─── Intel Notes ─────────────────────────────────────────────────────────────

@router.get("/{room_id}/intel", response_model=list[IntelNoteResponse])
async def list_intel_notes(
    room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db), pinned_only: bool = False
):
    await _get_room_or_404(room_id, current_user.id, db)
    q = select(IntelNote).where(IntelNote.plan_room_id == room_id)
    if pinned_only:
        q = q.where(IntelNote.is_pinned == True)
    q = q.order_by(IntelNote.is_pinned.desc(), IntelNote.created_at.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/{room_id}/intel", response_model=IntelNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_intel_note(
    room_id: int, body: IntelNoteCreate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    note = IntelNote(
        plan_room_id=room_id,
        created_by=current_user.id,
        title=body.title,
        body=body.body,
        classification=body.classification,
        tags=body.tags,
        is_pinned=body.is_pinned,
        linked_event_id=body.linked_event_id,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch("/{room_id}/intel/{note_id}", response_model=IntelNoteResponse)
async def update_intel_note(
    room_id: int, note_id: int, body: IntelNoteUpdate, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(select(IntelNote).where(IntelNote.id == note_id, IntelNote.plan_room_id == room_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Intel note not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(note, field, val)
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/{room_id}/intel/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_intel_note(
    room_id: int, note_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(select(IntelNote).where(IntelNote.id == note_id, IntelNote.plan_room_id == room_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Intel note not found")
    await db.delete(note)
    await db.commit()
