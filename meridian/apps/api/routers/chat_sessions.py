"""Chat session persistence — CRUD for AI Analyst conversation history."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.chat import ChatMessage, ChatSession, UserReadingHistory
from routers.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/chat", tags=["chat"])


class SessionCreate(BaseModel):
    title: str | None = None
    model: str = "gpt-4o"


class MessageCreate(BaseModel):
    role: str
    content: str
    tokens_used: int | None = None


class ReadingHistoryCreate(BaseModel):
    event_id: str
    category: str | None = None
    source_id: str | None = None


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.user_id == current_user.id).order_by(ChatSession.updated_at.desc()).limit(50)
    )
    sessions = result.scalars().all()
    return [{"id": s.id, "title": s.title, "model": s.model, "created_at": s.created_at, "updated_at": s.updated_at} for s in sessions]


@router.post("/sessions", status_code=201)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ChatSession(user_id=current_user.id, title=body.title, model=body.model)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title, "model": session.model}


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
    await db.delete(session)
    await db.commit()


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    msgs = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()))
    messages = msgs.scalars().all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at} for m in messages]


@router.post("/sessions/{session_id}/messages", status_code=201)
async def add_message(
    session_id: int,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.title is None and body.role == "user":
        session.title = body.content[:80]

    msg = ChatMessage(session_id=session_id, role=body.role, content=body.content, tokens_used=body.tokens_used)
    db.add(msg)
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    return {"id": msg.id, "role": msg.role, "content": msg.content}


@router.post("/reading-history", status_code=201)
async def track_reading(
    body: ReadingHistoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = UserReadingHistory(user_id=current_user.id, event_id=body.event_id, category=body.category, source_id=body.source_id)
    db.add(entry)
    await db.commit()
    return {"tracked": True}


@router.get("/reading-history/top-categories")
async def top_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func, text
    result = await db.execute(
        select(UserReadingHistory.category, func.count().label("cnt"))
        .where(UserReadingHistory.user_id == current_user.id, UserReadingHistory.category.isnot(None))
        .group_by(UserReadingHistory.category)
        .order_by(func.count().desc())
        .limit(5)
    )
    return [{"category": r[0], "count": r[1]} for r in result.all()]
