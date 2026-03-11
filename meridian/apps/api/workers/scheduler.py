import asyncio
import logging

import orjson
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from core.redis_client import publish_event
from workers.base import FeedWorker
from workers.usgs_earthquakes import USGSEarthquakesWorker
from workers.noaa_alerts import NOAAWeatherAlertsWorker
from workers.acled import ACLEDConflictWorker
from workers.nasa_firms import NASAFIRMSWorker
from workers.gdacs import GDACSWorker
from workers.opensky import OpenSkyWorker
from workers.cisa_kev import CISAKEVWorker
from workers.gdelt import GDELTWorker
from workers.alpha_vantage import AlphaVantageWorker
from workers.rss_news import RSSNewsWorker
from workers.nasa_iss import NASAISSWorker
from workers.noaa_nhc import NOAANHCWorker
from workers.fema import FEMAWorker
from workers.aishub import AISHubWorker
from workers.usgs_water import USGSWaterWorker
from workers.reliefweb import ReliefWebWorker
from workers.nasa_eonet import NASAEONETWorker
from workers.who_outbreaks import WHOOutbreaksWorker
from workers.emsc_earthquakes import EMSCEarthquakesWorker
from workers.volcano_discovery import VolcanoDiscoveryWorker
from workers.promed_rss import ProMEDRSSWorker
from workers.iaea_news import IAEANewsWorker
from workers.openaq import OpenAQWorker
from workers.noaa_space_weather import NOAASpaceWeatherWorker
from workers.acaps import ACAPSWorker

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None

WORKERS: list[FeedWorker] = [
    USGSEarthquakesWorker(min_magnitude=2.5),
    NOAAWeatherAlertsWorker(),
    ACLEDConflictWorker(),
    NASAFIRMSWorker(),
    GDACSWorker(),
    OpenSkyWorker(),
    CISAKEVWorker(),
    GDELTWorker(),
    AlphaVantageWorker(),
    RSSNewsWorker(),
    NASAISSWorker(),
    NOAANHCWorker(),
    FEMAWorker(),
    AISHubWorker(),
    USGSWaterWorker(),
    ReliefWebWorker(),
    NASAEONETWorker(),
    WHOOutbreaksWorker(),
    EMSCEarthquakesWorker(),
    VolcanoDiscoveryWorker(),
    ProMEDRSSWorker(),
    IAEANewsWorker(),
    OpenAQWorker(),
    NOAASpaceWeatherWorker(),
    ACAPSWorker(),
]


async def _run_worker(worker: FeedWorker) -> None:
    events = await worker.run()
    if not events:
        return

    pipeline_payloads = [
        orjson.dumps({
            "type": "geo_event",
            "source_id": worker.source_id,
            "category": worker.category,
            "data": e.model_dump(mode="json"),
        }).decode()
        for e in events
    ]

    for payload in pipeline_payloads:
        await publish_event("meridian:events", payload)

    logger.info(
        "worker_published",
        extra={"source_id": worker.source_id, "count": len(events)},
    )


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")

        for worker in WORKERS:
            _scheduler.add_job(
                _run_worker,
                trigger=IntervalTrigger(seconds=worker.refresh_interval),
                args=[worker],
                id=worker.source_id,
                name=worker.display_name,
                max_instances=1,
                replace_existing=True,
                misfire_grace_time=30,
            )
            logger.info(
                "worker_registered",
                extra={
                    "source_id": worker.source_id,
                    "interval_s": worker.refresh_interval,
                },
            )

    return _scheduler


async def run_all_workers_once() -> None:
    """Run every worker immediately on startup to pre-populate data."""
    tasks = [_run_worker(w) for w in WORKERS]
    await asyncio.gather(*tasks, return_exceptions=True)


def get_all_workers() -> list[FeedWorker]:
    return WORKERS
