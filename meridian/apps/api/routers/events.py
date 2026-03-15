import math
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import ORJSONResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.geo_event import FeedCategory, GeoEventFilter, GeoEventResponse, SeverityLevel
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/events", tags=["events"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _sanitize_value(val: object) -> object:
    """Recursively replace NaN/Inf float values with None."""
    if isinstance(val, float) and not math.isfinite(val):
        return None
    if isinstance(val, dict):
        return {k: _sanitize_value(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_sanitize_value(v) for v in val]
    return val


def _sanitize_row(row: dict) -> dict:
    """Replace NaN/Inf float values with None to prevent JSON serialization errors."""
    return {k: _sanitize_value(v) for k, v in row.items()}

_MAX_REPLAY_DAYS = 3650  # ~10 years


@router.get("/", response_model=list[GeoEventResponse])
async def list_events(
    category: FeedCategory | None = Query(None),
    severity: SeverityLevel | None = Query(None),
    source_id: str | None = Query(None),
    hours_back: int = Query(default=24, ge=1, le=720),
    lat_min: float | None = Query(None),
    lat_max: float | None = Query(None),
    lng_min: float | None = Query(None),
    lng_max: float | None = Query(None),
    limit: int = Query(default=500, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[GeoEventResponse]:
    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    conditions = ["ingested_at >= :since", "lat = lat", "lng = lng"]  # lat=lat filters NaN
    params: dict = {"since": since, "limit": limit, "offset": offset}

    if category:
        conditions.append("category = :category")
        params["category"] = category.value

    if severity:
        conditions.append("severity = :severity")
        params["severity"] = severity.value

    if source_id:
        conditions.append("source_id = :source_id")
        params["source_id"] = source_id

    if lat_min is not None:
        conditions.append("lat >= :lat_min")
        params["lat_min"] = lat_min

    if lat_max is not None:
        conditions.append("lat <= :lat_max")
        params["lat_max"] = lat_max

    if lng_min is not None:
        conditions.append("lng >= :lng_min")
        params["lng_min"] = lng_min

    if lng_max is not None:
        conditions.append("lng <= :lng_max")
        params["lng_max"] = lng_max

    where_clause = " AND ".join(conditions)
    sql = text(
        f"""
        SELECT id, source_id, category, subcategory, title, body,
               severity, lat, lng, metadata, url, event_time, ingested_at
        FROM geo_events
        WHERE {where_clause}
        ORDER BY event_time DESC
        LIMIT :limit OFFSET :offset
        """
    )

    result = await db.execute(sql, params)
    rows = result.mappings().all()

    return [GeoEventResponse(**_sanitize_row(dict(row))) for row in rows]


@router.get("/hydrate", response_model=list[GeoEventResponse])
async def hydrate_events(
    hours_back: int = Query(default=48, ge=1, le=720),
    per_source: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[GeoEventResponse]:
    """Return the most recent events per source_id for balanced map hydration."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    # Use LATERAL join for efficient per-source sampling in a single query
    sql = text(
        """
        SELECT e.id, e.source_id, e.category, e.subcategory, e.title, e.body,
               e.severity, e.lat, e.lng, e.metadata, e.url, e.event_time, e.ingested_at
        FROM (SELECT DISTINCT source_id FROM geo_events WHERE ingested_at >= :since) s,
        LATERAL (
            SELECT *
            FROM geo_events g
            WHERE g.source_id = s.source_id AND g.ingested_at >= :since
              AND g.lat = g.lat AND g.lng = g.lng
            ORDER BY g.event_time DESC
            LIMIT :per_source
        ) e
        ORDER BY e.event_time DESC
        """
    )
    result = await db.execute(sql, {"since": since, "per_source": per_source})
    rows = result.mappings().all()
    return [GeoEventResponse(**_sanitize_row(dict(row))) for row in rows]


@router.get("/near", response_model=list[GeoEventResponse])
async def events_near(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=100, ge=1, le=5000),
    hours_back: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[GeoEventResponse]:
    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    radius_m = radius_km * 1000

    sql = text(
        """
        SELECT id, source_id, category, subcategory, title, body,
               severity, lat, lng, metadata, url, event_time, ingested_at
        FROM geo_events
        WHERE ingested_at >= :since AND lat = lat AND lng = lng
          AND ST_DWithin(
              geom::geography,
              ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
              :radius_m
          )
        ORDER BY event_time DESC
        LIMIT :limit
        """
    )

    result = await db.execute(
        sql, {"since": since, "lat": lat, "lng": lng, "radius_m": radius_m, "limit": limit}
    )
    rows = result.mappings().all()
    return [GeoEventResponse(**_sanitize_row(dict(row))) for row in rows]


@router.get("/replay", response_model=list[GeoEventResponse])
async def replay_events(
    start_time: datetime = Query(..., description="ISO 8601 start datetime (UTC)"),
    end_time: datetime = Query(..., description="ISO 8601 end datetime (UTC)"),
    category: FeedCategory | None = Query(None),
    source_id: str | None = Query(None),
    severity: SeverityLevel | None = Query(None),
    lat_min: float | None = Query(None),
    lat_max: float | None = Query(None),
    lng_min: float | None = Query(None),
    lng_max: float | None = Query(None),
    limit: int = Query(default=1000, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
) -> list[GeoEventResponse]:
    """Historical event replay — up to 180 days. Supports absolute time windows."""
    now = datetime.now(timezone.utc)
    oldest_allowed = now - timedelta(days=_MAX_REPLAY_DAYS)

    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    if start_time < oldest_allowed:
        raise HTTPException(status_code=400, detail=f"start_time exceeds {_MAX_REPLAY_DAYS}-day retention window")
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")
    if (end_time - start_time).total_seconds() > 86400 * 30:
        raise HTTPException(status_code=400, detail="Replay window cannot exceed 30 days per request")

    conditions = ["event_time >= :start_time", "event_time <= :end_time"]
    params: dict = {"start_time": start_time, "end_time": end_time, "limit": limit}

    if category:
        conditions.append("category = :category")
        params["category"] = category.value
    if source_id:
        conditions.append("source_id = :source_id")
        params["source_id"] = source_id
    if severity:
        conditions.append("severity = :severity")
        params["severity"] = severity.value
    if lat_min is not None:
        conditions.append("lat >= :lat_min"); params["lat_min"] = lat_min
    if lat_max is not None:
        conditions.append("lat <= :lat_max"); params["lat_max"] = lat_max
    if lng_min is not None:
        conditions.append("lng >= :lng_min"); params["lng_min"] = lng_min
    if lng_max is not None:
        conditions.append("lng <= :lng_max"); params["lng_max"] = lng_max

    sql = text(
        f"""
        SELECT id, source_id, category, subcategory, title, body,
               severity, lat, lng, metadata, url, event_time, ingested_at
        FROM geo_events
        WHERE {" AND ".join(conditions)}
        ORDER BY event_time ASC
        LIMIT :limit
        """
    )
    result = await db.execute(sql, params)
    return [GeoEventResponse(**_sanitize_row(dict(row))) for row in result.mappings().all()]


@router.get("/satellites/{event_id}/track")
async def satellite_track(
    event_id: str,
    current_user: CurrentUser,
    minutes_back: int = Query(default=45, ge=5, le=180),
    minutes_forward: int = Query(default=45, ge=5, le=180),
    step_sec: int = Query(default=60, ge=10, le=300),
    db: AsyncSession = Depends(get_db),
):
    """Compute ground track for a satellite using SGP4 propagation from stored TLE data."""
    from workers._orbit_propagation import propagate_tle, compute_ground_track

    sql = text(
        "SELECT metadata FROM geo_events WHERE id = :event_id ORDER BY ingested_at DESC LIMIT 1"
    )
    result = await db.execute(sql, {"event_id": event_id})
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")

    metadata = row["metadata"]
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="Event has no metadata")

    tle_line1 = metadata.get("tle_line1", "")
    tle_line2 = metadata.get("tle_line2", "")
    if not tle_line1 or not tle_line2:
        raise HTTPException(status_code=400, detail="Event has no TLE data for propagation")

    now = datetime.now(timezone.utc)
    current_pos = propagate_tle(tle_line1, tle_line2, now)
    track = compute_ground_track(tle_line1, tle_line2, minutes_back, minutes_forward, step_sec, now)

    return {
        "event_id": event_id,
        "current_position": list(current_pos) if current_pos else None,
        "track": track,
        "minutes_back": minutes_back,
        "minutes_forward": minutes_forward,
        "step_sec": step_sec,
    }


@router.get("/aircraft/{icao24}/track")
async def aircraft_track(icao24: str):
    """Fetch recent flight track for an aircraft from OpenSky Network.

    Returns an array of waypoints: [time, lat, lng, altitude, heading, on_ground].
    Falls back to adsb.lol if OpenSky is unavailable.
    """
    import httpx
    from core.credential_store import get_credential

    icao24 = icao24.strip().lower()
    if not icao24 or len(icao24) > 6:
        raise HTTPException(400, "Invalid ICAO24 address")

    waypoints: list[dict] = []

    # ── Try OpenSky track API ──────────────────────────────────────────────
    opensky_user = get_credential("OPENSKY_CLIENT_ID")
    opensky_pass = get_credential("OPENSKY_CLIENT_SECRET")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            params = {"icao24": icao24, "time": 0}
            auth = (opensky_user, opensky_pass) if opensky_user and opensky_pass else None
            resp = await client.get(
                "https://opensky-network.org/api/tracks/all",
                params=params,
                auth=auth,
            )
            if resp.status_code == 200:
                data = resp.json()
                path = data.get("path", [])
                for wp in path:
                    # path format: [time, lat, lng, baro_altitude, true_track, on_ground]
                    if len(wp) >= 5 and wp[1] is not None and wp[2] is not None:
                        waypoints.append({
                            "time": wp[0],
                            "lat": wp[1],
                            "lng": wp[2],
                            "altitude": wp[3],
                            "heading": wp[4],
                            "on_ground": wp[5] if len(wp) > 5 else False,
                        })
    except Exception:
        pass  # fall through to adsb.lol

    # ── Fallback: adsb.lol trace API ───────────────────────────────────────
    if not waypoints:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"https://api.adsb.lol/v2/icao/{icao24}"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for ac in data.get("ac", []):
                        lat = ac.get("lat")
                        lon = ac.get("lon")
                        if lat is not None and lon is not None:
                            waypoints.append({
                                "time": ac.get("now", 0),
                                "lat": lat,
                                "lng": lon,
                                "altitude": ac.get("alt_baro"),
                                "heading": ac.get("track"),
                                "on_ground": ac.get("alt_baro") == "ground",
                            })
        except Exception:
            pass

    if not waypoints:
        raise HTTPException(404, f"No track data found for {icao24}")

    return {
        "icao24": icao24,
        "waypoints": waypoints,
        "count": len(waypoints),
    }


@router.get("/aircraft/{callsign}/route")
async def aircraft_route(callsign: str):
    """Look up flight route (origin/destination airports) from OpenSky Network.

    Uses the OpenSky ``/api/routes?callsign=`` endpoint which returns the
    airport ICAO codes for the route.  We then resolve those codes to names
    and coordinates via the OpenSky ``/api/airports/?icao=`` endpoint so the
    frontend can draw a destination line on the map.
    """
    import httpx
    from core.credential_store import get_credential

    callsign = callsign.strip().upper()
    if not callsign or len(callsign) > 10:
        raise HTTPException(400, "Invalid callsign")

    opensky_user = get_credential("OPENSKY_CLIENT_ID")
    opensky_pass = get_credential("OPENSKY_CLIENT_SECRET")
    auth = (opensky_user, opensky_pass) if opensky_user and opensky_pass else None

    route_airports: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://opensky-network.org/api/routes",
                params={"callsign": callsign},
                auth=auth,
            )
            if resp.status_code == 200:
                data = resp.json()
                route_airports = data.get("route", [])
    except Exception:
        pass

    if not route_airports:
        return {"callsign": callsign, "route": [], "airports": [], "origin": None, "destination": None}

    # Resolve airport ICAO codes to names + coordinates
    airports: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for icao in route_airports:
                if not icao or not isinstance(icao, str):
                    continue
                icao = icao.strip()
                if not icao:
                    continue
                try:
                    resp = await client.get(
                        "https://opensky-network.org/api/airports/",
                        params={"icao": icao},
                        auth=auth,
                    )
                    if resp.status_code == 200:
                        info = resp.json()
                        airports.append({
                            "icao": icao,
                            "name": info.get("name", icao),
                            "city": info.get("city", ""),
                            "country": info.get("country", ""),
                            "lat": info.get("position", {}).get("latitude"),
                            "lng": info.get("position", {}).get("longitude"),
                        })
                    else:
                        airports.append({"icao": icao, "name": icao})
                except Exception:
                    airports.append({"icao": icao, "name": icao})
    except Exception:
        airports = [{"icao": code, "name": code} for code in route_airports if code]

    return {
        "callsign": callsign,
        "route": route_airports,
        "airports": airports,
        "origin": airports[0] if len(airports) > 0 else None,
        "destination": airports[-1] if len(airports) > 1 else None,
    }


@router.get("/csv")
async def export_events_csv(
    current_user: CurrentUser,
    category: FeedCategory | None = Query(None),
    hours_back: int = Query(default=24, ge=1, le=4320),
    limit: int = Query(default=5000, ge=1, le=10000),
    db: AsyncSession = Depends(get_db),
):
    """Export GeoEvents to CSV."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    conditions = ["ingested_at >= :since"]
    params: dict = {"since": since, "limit": limit}
    if category:
        conditions.append("category = :category")
        params["category"] = category.value

    sql = text(
        f"""
        SELECT id, source_id, category, title, body, severity, lat, lng, url, event_time
        FROM geo_events
        WHERE {" AND ".join(conditions)}
        ORDER BY event_time DESC
        LIMIT :limit
        """
    )
    result = await db.execute(sql, params)
    rows = result.mappings().all()

    output = io.StringIO()
    fieldnames = ["id", "source_id", "category", "title", "body", "severity", "lat", "lng", "url", "event_time"]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(dict(row))

    output.seek(0)
    filename = f"meridian_events_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
