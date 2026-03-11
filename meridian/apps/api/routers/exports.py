"""Plan Room exports — JSON data pack, GeoJSON, KML, and shareable read-only links."""
import io
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.collab import ShareableLink, ShareableLinkCreate, ShareableLinkResponse
from models.plan_room import Annotation, PlanRoom, TimelineEntry, Task
from models.watch_list import IntelNote, WatchListEntity
from models.user import User
from routers.auth import get_current_user
from routers.plan_rooms import _get_room_or_404

router = APIRouter(prefix="/plan-rooms", tags=["exports"])
CurrentUser = Annotated[User, Depends(get_current_user)]


# ─── JSON Data Pack ───────────────────────────────────────────────────────────

@router.get("/{room_id}/export/json")
async def export_json(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    room = await _get_room_or_404(room_id, current_user.id, db)
    pack = await _build_data_pack(room, room_id, db)
    content = json.dumps(pack, indent=2, default=str).encode()
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="room_{room_id}.json"'},
    )


# ─── GeoJSON ─────────────────────────────────────────────────────────────────

@router.get("/{room_id}/export/geojson")
async def export_geojson(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await _get_room_or_404(room_id, current_user.id, db)
    annotations = (await db.execute(
        select(Annotation).where(Annotation.plan_room_id == room_id)
    )).scalars().all()

    features = []
    for ann in annotations:
        geom = ann.geom_json or {}
        features.append({
            "type": "Feature",
            "geometry": geom.get("geometry") or geom,
            "properties": {
                "id": ann.id,
                "type": ann.annotation_type,
                "label": ann.label,
                "notes": ann.notes,
                "color": ann.color,
                "is_locked": ann.is_locked,
                "created_at": ann.created_at.isoformat() if ann.created_at else None,
            },
        })

    geojson = {"type": "FeatureCollection", "features": features}
    content = json.dumps(geojson, indent=2).encode()
    return Response(
        content=content,
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="room_{room_id}.geojson"'},
    )


# ─── KML ─────────────────────────────────────────────────────────────────────

@router.get("/{room_id}/export/kml")
async def export_kml(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    room = await _get_room_or_404(room_id, current_user.id, db)
    annotations = (await db.execute(
        select(Annotation).where(Annotation.plan_room_id == room_id)
    )).scalars().all()

    placemarks = []
    for ann in annotations:
        geom = ann.geom_json or {}
        coords = ""
        coords_data = geom.get("coordinates") or geom.get("geometry", {}).get("coordinates", [])
        if isinstance(coords_data, list) and coords_data:
            if isinstance(coords_data[0], (int, float)):
                coords = f"{coords_data[0]},{coords_data[1]},0"
            elif isinstance(coords_data[0], list):
                coords = " ".join(f"{c[0]},{c[1]},0" for c in coords_data if len(c) >= 2)

        label = ann.label or ann.annotation_type
        desc = ann.notes or ""
        placemarks.append(
            f"  <Placemark>\n"
            f"    <name>{_xml_escape(label)}</name>\n"
            f"    <description>{_xml_escape(desc)}</description>\n"
            f"    <Point><coordinates>{coords}</coordinates></Point>\n"
            f"  </Placemark>"
        )

    kml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2">\n'
        f'<Document>\n<name>{_xml_escape(room.name)}</name>\n'
        + "\n".join(placemarks)
        + "\n</Document>\n</kml>"
    )
    return Response(
        content=kml.encode(),
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": f'attachment; filename="room_{room_id}.kml"'},
    )


# ─── Shareable Read-Only Links ────────────────────────────────────────────────

@router.post("/{room_id}/share", response_model=ShareableLinkResponse, status_code=201)
async def create_share_link(
    room_id: int, body: ShareableLinkCreate, current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    expires_at = None
    if body.expires_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_days)

    link = ShareableLink(
        plan_room_id=room_id,
        created_by=current_user.id,
        token=secrets.token_urlsafe(32),
        label=body.label,
        expires_at=expires_at,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.get("/{room_id}/share", response_model=list[ShareableLinkResponse])
async def list_share_links(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(ShareableLink).where(ShareableLink.plan_room_id == room_id)
        .order_by(ShareableLink.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{room_id}/share/{link_id}", status_code=204)
async def revoke_share_link(
    room_id: int, link_id: int, current_user: CurrentUser,
    db: AsyncSession = Depends(get_db)
):
    await _get_room_or_404(room_id, current_user.id, db)
    result = await db.execute(
        select(ShareableLink).where(ShareableLink.id == link_id, ShareableLink.plan_room_id == room_id)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Link not found")
    await db.execute(update(ShareableLink).where(ShareableLink.id == link_id).values(is_active=False))
    await db.commit()


@router.get("/view/{token}")
async def view_shared_room(token: str, db: AsyncSession = Depends(get_db)):
    """Public read-only endpoint — no auth required."""
    result = await db.execute(
        select(ShareableLink).where(ShareableLink.token == token, ShareableLink.is_active == True)  # noqa: E712
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Link not found or revoked")
    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(410, "Link has expired")

    await db.execute(
        update(ShareableLink).where(ShareableLink.id == link.id)
        .values(view_count=link.view_count + 1)
    )
    await db.commit()

    pack = await _build_data_pack(None, link.plan_room_id, db)
    return pack


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _build_data_pack(room: PlanRoom | None, room_id: int, db: AsyncSession) -> dict:
    if room is None:
        r = await db.execute(select(PlanRoom).where(PlanRoom.id == room_id))
        room = r.scalar_one_or_none()

    annotations = (await db.execute(
        select(Annotation).where(Annotation.plan_room_id == room_id)
    )).scalars().all()
    timeline = (await db.execute(
        select(TimelineEntry).where(TimelineEntry.plan_room_id == room_id)
        .order_by(TimelineEntry.entry_time)
    )).scalars().all()
    tasks = (await db.execute(
        select(Task).where(Task.plan_room_id == room_id)
    )).scalars().all()
    watch = (await db.execute(
        select(WatchListEntity).where(WatchListEntity.plan_room_id == room_id)
    )).scalars().all()
    intel = (await db.execute(
        select(IntelNote).where(IntelNote.plan_room_id == room_id)
        .order_by(IntelNote.is_pinned.desc())
    )).scalars().all()

    def _ser(obj) -> dict:
        return {c.key: getattr(obj, c.key) for c in obj.__table__.columns}

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "room": _ser(room) if room else {},
        "annotations": [_ser(a) for a in annotations],
        "timeline": [_ser(t) for t in timeline],
        "tasks": [_ser(t) for t in tasks],
        "watch_list": [_ser(w) for w in watch],
        "intel_notes": [_ser(i) for i in intel],
    }


def _xml_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
