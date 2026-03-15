"""Plan Room exports — JSON data pack, GeoJSON, KML, PDF, and shareable read-only links."""
import io
import json
import secrets
import zlib
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


# ─── PDF Report ──────────────────────────────────────────────────────────────

@router.get("/{room_id}/export/pdf")
async def export_pdf(room_id: int, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    room = await _get_room_or_404(room_id, current_user.id, db)
    pack = await _build_data_pack(room, room_id, db)
    pdf_bytes = _generate_pdf_report(pack)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="room_{room_id}.pdf"'},
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
        .values(view_count=ShareableLink.view_count + 1)
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
        out = {}
        for c in obj.__table__.columns:
            val = getattr(obj, c.key)
            out[c.key] = val.isoformat() if hasattr(val, "isoformat") else val
        return out

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


def _pdf_escape(text: str) -> str:
    """Escape special PDF string characters."""
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _generate_pdf_report(pack: dict) -> bytes:
    """Generate a minimal valid PDF 1.4 document with text-only content.

    Uses raw PDF syntax — no external libraries required.  The approach:
    build a single content stream of text-drawing operators, wrap it in the
    required PDF object graph (catalog, pages, page, font, stream), and
    emit a correct cross-reference table + trailer.
    """

    room = pack.get("room", {})
    room_name = str(room.get("name", "Untitled Plan Room"))
    room_desc = str(room.get("description", "") or "")
    exported_at = pack.get("exported_at", datetime.now(timezone.utc).isoformat())

    # ── Build text lines ──────────────────────────────────────────────────
    PAGE_WIDTH = 612   # US Letter
    PAGE_HEIGHT = 792
    MARGIN = 50
    USABLE_WIDTH = PAGE_WIDTH - 2 * MARGIN
    LINE_HEIGHT_BODY = 14
    LINE_HEIGHT_HEADING = 20

    lines: list[tuple[str, float, str]] = []  # (text, font_size, style)

    def _add_heading(text: str) -> None:
        lines.append(("", 8, "body"))  # spacer
        lines.append((text, 14, "bold"))
        lines.append(("", 4, "body"))  # small gap

    def _add_line(text: str, size: float = 10) -> None:
        lines.append((text, size, "body"))

    def _add_separator() -> None:
        lines.append(("---", 6, "body"))

    def _wrap(text: str, max_chars: int = 90) -> list[str]:
        """Word-wrap a string into lines of at most max_chars."""
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        result: list[str] = []
        for paragraph in text.split("\n"):
            if not paragraph.strip():
                result.append("")
                continue
            words = paragraph.split()
            cur = ""
            for w in words:
                if cur and len(cur) + 1 + len(w) > max_chars:
                    result.append(cur)
                    cur = w
                else:
                    cur = f"{cur} {w}" if cur else w
            if cur:
                result.append(cur)
        return result

    # Title page content
    _add_line(room_name, 18)
    if room_desc:
        for wl in _wrap(room_desc, 80):
            _add_line(wl, 10)
    _add_line(f"Exported: {exported_at}", 9)
    _add_separator()

    # Annotations
    annotations = pack.get("annotations", [])
    _add_heading(f"ANNOTATIONS ({len(annotations)})")
    if not annotations:
        _add_line("  No annotations.")
    for ann in annotations:
        label = str(ann.get("label") or ann.get("annotation_type", ""))
        atype = str(ann.get("annotation_type", ""))
        notes = str(ann.get("notes") or "")
        _add_line(f"  [{atype}] {label}")
        if notes:
            for wl in _wrap(notes, 85):
                _add_line(f"    {wl}", 9)

    # Timeline
    timeline = pack.get("timeline", [])
    _add_heading(f"TIMELINE ({len(timeline)})")
    if not timeline:
        _add_line("  No timeline entries.")
    for entry in timeline:
        title = str(entry.get("title", ""))
        etime = str(entry.get("entry_time", ""))
        body = str(entry.get("body") or "")
        source = str(entry.get("source_label") or "")
        prefix = f"  [{source}] " if source else "  "
        _add_line(f"{prefix}{title}  ({etime})")
        if body:
            for wl in _wrap(body, 85):
                _add_line(f"    {wl}", 9)

    # Tasks
    tasks = pack.get("tasks", [])
    _add_heading(f"TASKS ({len(tasks)})")
    if not tasks:
        _add_line("  No tasks.")
    for task in tasks:
        title = str(task.get("title", ""))
        task_status = str(task.get("status", ""))
        priority = str(task.get("priority", ""))
        notes = str(task.get("notes") or "")
        _add_line(f"  [{task_status.upper()}] [{priority.upper()}] {title}")
        if notes:
            for wl in _wrap(notes, 85):
                _add_line(f"    {wl}", 9)

    # Watch list
    watch = pack.get("watch_list", [])
    if watch:
        _add_heading(f"WATCH LIST ({len(watch)})")
        for w in watch:
            wname = str(w.get("name") or w.get("entity_name", ""))
            wtype = str(w.get("entity_type", ""))
            _add_line(f"  [{wtype}] {wname}")

    # Intel notes
    intel = pack.get("intel_notes", [])
    if intel:
        _add_heading(f"INTEL NOTES ({len(intel)})")
        for note in intel:
            ntitle = str(note.get("title", ""))
            classification = str(note.get("classification", ""))
            nbody = str(note.get("body") or "")
            pinned = "PINNED " if note.get("is_pinned") else ""
            _add_line(f"  {pinned}[{classification.upper()}] {ntitle}")
            if nbody:
                for wl in _wrap(nbody, 85):
                    _add_line(f"    {wl}", 9)

    # ── Paginate lines ────────────────────────────────────────────────────
    max_y = PAGE_HEIGHT - MARGIN
    min_y = MARGIN
    # Each entry: (text, x, y, font_size, style)
    pages_content: list[list[tuple[str, float, float, float, str]]] = []
    current_page: list[tuple[str, float, float, float, str]] = []
    y = max_y - 20  # start below top margin

    for text, size, style in lines:
        line_h = LINE_HEIGHT_HEADING if style == "bold" else LINE_HEIGHT_BODY
        if size >= 16:
            line_h = 24
        y -= line_h
        if y < min_y:
            pages_content.append(current_page)
            current_page = []
            y = max_y - 20 - line_h
        current_page.append((text, MARGIN, y, size, style))

    if current_page:
        pages_content.append(current_page)
    if not pages_content:
        pages_content.append([("(empty report)", MARGIN, max_y - 40, 10.0, "body")])

    # ── Build PDF objects ──────────────────────────────────────────────────
    objects: list[bytes] = []  # 1-indexed (objects[0] is obj 1)

    def _obj(content: str) -> int:
        idx = len(objects) + 1
        objects.append(f"{idx} 0 obj\n{content}\nendobj\n".encode("latin-1"))
        return idx

    def _stream_obj(stream_bytes: bytes, extra_dict: str = "") -> int:
        idx = len(objects) + 1
        compressed = zlib.compress(stream_bytes)
        header = (
            f"{idx} 0 obj\n<< /Length {len(compressed)} "
            f"/Filter /FlateDecode {extra_dict}>>\nstream\n"
        )
        objects.append(
            header.encode("latin-1") + compressed + b"\nendstream\nendobj\n"
        )
        return idx

    # Obj 1: Catalog
    catalog_id = _obj("<< /Type /Catalog /Pages 2 0 R >>")

    # Reserve obj 2 for Pages (we'll fill page refs after creating pages)
    objects.append(b"")  # placeholder for obj 2
    pages_obj_id = 2

    # Obj 3: Font (Helvetica)
    font_regular_id = _obj(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
    font_bold_id = _obj(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )

    page_obj_ids: list[int] = []
    for page_lines in pages_content:
        # Build content stream
        stream_parts: list[str] = ["BT\n"]
        for text, x, y_pos, font_size, style in page_lines:
            if text == "---":
                # Draw a separator line via stroke (end text, draw, restart text)
                stream_parts.append("ET\n")
                stream_parts.append(
                    f"0.6 0.6 0.6 RG\n"
                    f"0.5 w\n"
                    f"{MARGIN} {y_pos + 4} m {MARGIN + USABLE_WIDTH} {y_pos + 4} l S\n"
                )
                stream_parts.append("BT\n")
                continue
            font_ref = "/F2" if style == "bold" else "/F1"
            escaped = _pdf_escape(text)
            stream_parts.append(
                f"{font_ref} {font_size} Tf\n{x} {y_pos} Td\n({escaped}) Tj\n0 0 Td\n"
            )
        stream_parts.append("ET\n")
        stream_data = "".join(stream_parts).encode("latin-1", errors="replace")

        content_id = _stream_obj(stream_data)

        # Page object
        page_id = _obj(
            f"<< /Type /Page /Parent {pages_obj_id} 0 R "
            f"/MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Contents {content_id} 0 R "
            f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> >>"
        )
        page_obj_ids.append(page_id)

    # Fill in Pages object (obj 2)
    kids = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
    objects[1] = (
        f"2 0 obj\n<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_ids)} >>\nendobj\n"
    ).encode("latin-1")

    # ── Serialize ─────────────────────────────────────────────────────────
    buf = io.BytesIO()
    buf.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")  # header + binary comment

    offsets: list[int] = []
    for obj_bytes in objects:
        offsets.append(buf.tell())
        buf.write(obj_bytes)

    xref_start = buf.tell()
    buf.write(b"xref\n")
    buf.write(f"0 {len(objects) + 1}\n".encode())
    buf.write(b"0000000000 65535 f \n")
    for offset in offsets:
        buf.write(f"{offset:010d} 00000 n \n".encode())

    buf.write(b"trailer\n")
    buf.write(f"<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n".encode())
    buf.write(b"startxref\n")
    buf.write(f"{xref_start}\n".encode())
    buf.write(b"%%EOF\n")

    return buf.getvalue()
