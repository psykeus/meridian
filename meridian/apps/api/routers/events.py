from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.geo_event import FeedCategory, GeoEventFilter, GeoEventResponse, SeverityLevel

router = APIRouter(prefix="/events", tags=["events"])


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
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[GeoEventResponse]:
    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    conditions = ["ingested_at >= :since"]
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

    return [GeoEventResponse(**dict(row)) for row in rows]


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
        WHERE ingested_at >= :since
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
    return [GeoEventResponse(**dict(row)) for row in rows]
