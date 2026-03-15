from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from workers.scheduler import get_all_workers, get_scheduler

router = APIRouter(prefix="/feeds", tags=["feeds"])


@router.get("/status")
async def feed_status() -> list[dict]:
    """Return health status list for all registered feed workers."""
    workers = get_all_workers()
    results = []
    for worker in workers:
        health = worker.health_check()
        results.append({
            "source_id": worker.source_id,
            "display_name": worker.display_name,
            "category": worker.category,
            "refresh_interval_seconds": worker.refresh_interval,
            "status": health.status,
            "last_fetched": health.last_fetched.isoformat() if health.last_fetched else None,
            "last_success": health.last_success.isoformat() if health.last_success else None,
            "last_error": health.last_error,
        })
    return results


@router.get("/health")
async def feed_health() -> dict:
    """Return health dict keyed by source_id for the FeedHealthPage."""
    workers = get_all_workers()
    result: dict = {}
    for worker in workers:
        h = worker.health_check()
        result[worker.source_id] = {
            "name": worker.display_name,
            "status": h.status,
            "last_success": h.last_success.isoformat() if h.last_success else None,
            "last_error": h.last_error,
            "fetch_count": h.fetch_count,
            "error_count": h.error_count,
            "avg_latency_ms": h.avg_latency_ms,
            "refresh_interval": worker.refresh_interval,
        }
    return result


class FeedConfigUpdate(BaseModel):
    refresh_interval: int | None = None  # seconds


@router.put("/{source_id}/config")
async def update_feed_config(source_id: str, body: FeedConfigUpdate) -> dict:
    """Update a worker's configuration (e.g. refresh interval)."""
    workers = get_all_workers()
    worker = next((w for w in workers if w.source_id == source_id), None)
    if not worker:
        raise HTTPException(404, f"Worker '{source_id}' not found")

    if body.refresh_interval is not None:
        if body.refresh_interval < 60:
            raise HTTPException(400, "Minimum refresh interval is 60 seconds")
        if body.refresh_interval > 86400:
            raise HTTPException(400, "Maximum refresh interval is 86400 seconds (24h)")
        worker.refresh_interval = body.refresh_interval

        # Update the scheduler job trigger
        sched = get_scheduler()
        try:
            from apscheduler.triggers.interval import IntervalTrigger
            sched.reschedule_job(
                source_id,
                trigger=IntervalTrigger(seconds=body.refresh_interval),
            )
        except Exception:
            pass  # job may not exist yet

    return {
        "source_id": source_id,
        "refresh_interval": worker.refresh_interval,
    }
