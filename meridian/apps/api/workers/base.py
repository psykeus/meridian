import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from enum import Enum

from models.geo_event import FeedCategory, GeoEvent

logger = logging.getLogger(__name__)


class FeedStatus(str, Enum):
    healthy = "healthy"
    stale = "stale"
    error = "error"
    disabled = "disabled"


class FeedHealth:
    __slots__ = ("source_id", "status", "last_fetched", "last_success",
                 "last_error", "event_count_last_run", "fetch_count", "error_count", "avg_latency_ms")

    def __init__(
        self,
        source_id: str,
        status: FeedStatus,
        last_fetched: datetime | None = None,
        last_success: datetime | None = None,
        last_error: str | None = None,
        event_count_last_run: int = 0,
        fetch_count: int = 0,
        error_count: int = 0,
        avg_latency_ms: float | None = None,
    ) -> None:
        self.source_id = source_id
        self.status = status
        self.last_fetched = last_fetched
        self.last_success = last_success
        self.last_error = last_error
        self.event_count_last_run = event_count_last_run
        self.fetch_count = fetch_count
        self.error_count = error_count
        self.avg_latency_ms = avg_latency_ms


class FeedWorker(ABC):
    """
    Abstract base class for all Meridian data feed workers.

    To add a new data source, subclass FeedWorker and implement:
      - source_id: unique snake_case identifier (e.g. "usgs_earthquakes")
      - display_name: human-readable name shown in Feed Health Monitor
      - category: FeedCategory enum value
      - refresh_interval: seconds between fetches
      - fetch(): async method returning a list of GeoEvent objects

    See workers/usgs_earthquakes.py for a complete example.
    """

    source_id: str
    display_name: str
    category: FeedCategory
    refresh_interval: int = 300
    run_on_startup: bool = True  # set False for rate-sensitive live-tracking workers

    def _get_state(self, key: str, default: object = None) -> object:
        return getattr(self, f"_ws_{key}", default)

    def _set_state(self, key: str, value: object) -> None:
        setattr(self, f"_ws_{key}", value)

    @abstractmethod
    async def fetch(self) -> list[GeoEvent]:
        """Fetch new events from the data source. Return normalized GeoEvent list."""
        ...

    def health_check(self) -> FeedHealth:
        last_success: datetime | None = self._get_state("last_success")  # type: ignore[assignment]
        last_error: str | None = self._get_state("last_error")  # type: ignore[assignment]
        last_fetched: datetime | None = self._get_state("last_fetched")  # type: ignore[assignment]
        consecutive_errors: int = self._get_state("consecutive_errors", 0)  # type: ignore[assignment]
        fetch_count: int = self._get_state("fetch_count", 0)  # type: ignore[assignment]
        error_count: int = self._get_state("error_count", 0)  # type: ignore[assignment]
        total_latency: float = self._get_state("total_latency_ms", 0.0)  # type: ignore[assignment]

        status = FeedStatus.healthy
        if last_error and consecutive_errors >= 3:
            status = FeedStatus.error
        elif last_success and last_fetched:
            age = (datetime.now(timezone.utc) - last_success).total_seconds()
            if age > self.refresh_interval * 3:
                status = FeedStatus.stale

        avg_ms = (total_latency / fetch_count) if fetch_count > 0 else None
        return FeedHealth(
            source_id=self.source_id,
            status=status,
            last_fetched=last_fetched,
            last_success=last_success,
            last_error=last_error,
            fetch_count=fetch_count,
            error_count=error_count,
            avg_latency_ms=avg_ms,
        )

    async def run(self) -> list[GeoEvent]:
        """Called by the scheduler. Wraps fetch() with error handling and health tracking."""
        now = datetime.now(timezone.utc)
        self._set_state("last_fetched", now)
        start = time.monotonic()
        try:
            events = await self.fetch()
            latency_ms = (time.monotonic() - start) * 1000
            self._set_state("last_success", now)
            self._set_state("last_error", None)
            self._set_state("consecutive_errors", 0)
            self._set_state("fetch_count", self._get_state("fetch_count", 0) + 1)
            self._set_state("total_latency_ms", self._get_state("total_latency_ms", 0.0) + latency_ms)
            logger.info(
                "feed_worker_success",
                extra={"source_id": self.source_id, "event_count": len(events), "latency_ms": round(latency_ms)},
            )
            return events
        except Exception as exc:
            self._set_state("last_error", str(exc))
            self._set_state("consecutive_errors", self._get_state("consecutive_errors", 0) + 1)
            self._set_state("error_count", self._get_state("error_count", 0) + 1)
            logger.error(
                "feed_worker_error",
                extra={"source_id": self.source_id, "error": str(exc)},
                exc_info=True,
            )
            return []
