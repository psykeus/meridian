from fastapi import APIRouter

from workers.scheduler import get_all_workers

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
        }
    return result
