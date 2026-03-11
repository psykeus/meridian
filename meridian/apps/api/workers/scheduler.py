import asyncio
import json
import logging

import orjson
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import text as sa_text

from core.database import AsyncSessionLocal
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
# Phase 4 workers
from workers.nvd_cve import NVDCVEWorker
from workers.cloudflare_radar import CloudflareRadarWorker
from workers.malwarebazaar import MalwareBazaarWorker
from workers.eia_grid import EIAGridWorker
from workers.entso_e import ENTSOEWorker
from workers.eurdep import EURDEPWorker
from workers.nasa_neo import NASANEOWorker
from workers.space_devs import SpaceDevsWorker
from workers.open_sanctions import OpenSanctionsWorker
from workers.us_travel_advisory import USTravelAdvisoryWorker
from workers.fews_net import FEWSNETWorker
from workers.coingecko import CoinGeckoWorker
from workers.fred_economics import FREDWorker
from workers.adsb_lol import ADSBLolWorker
from workers.ooni import OONIWorker
from workers.faa_notam import FAANotamWorker
from workers.uscg_maritime import USCGMaritimeWorker
from workers.baker_hughes import BakerHughesWorker
from workers.telegram_osint import TelegramOSINTWorker
from workers.emergency_squawks import EmergencySquawksWorker
from workers.finnhub_markets import FinnhubMarketsWorker
from workers.reddit_osint import RedditOSINTWorker
from workers.ripe_bgp import RIPEBGPWorker
from workers.ioda_outages import IODAOutagesWorker
from workers.spacetrack_satellites import SpaceTrackSatellitesWorker
from workers.rainviewer_radar import RainViewerRadarWorker
from workers.unhcr_displacement import UNHCRDisplacementWorker
from workers.fema_ipaws import FEMAIPAWSWorker
from workers.fema_shelters import FEMASheltersWorker
# Phase 5 workers — nuclear monitoring
from workers.iaea_pris import IAEAPRISWorker
from workers.nrc_events import NRCEventsWorker
from workers.safecast_radiation import SafecastRadiationWorker
from workers.tsunami_warnings import TsunamiWarningsWorker
from workers.cisa_advisories import CISAAdvisoriesWorker
# Phase 6 workers — military/maritime/aviation/finance/space/OSINT
from workers.gtd_terrorism import GTDTerrorismWorker
from workers.piracy_imb import PiracyIMBWorker
from workers.baltic_dry import BalticDryWorker
from workers.celestrak_tle import CelestrakTLEWorker
from workers.osint_rss import OSINTRSSWorker
from workers.airstrikes_derived import AirstrikesDerivedWorker
from workers.naval_mmsi import NavalMMSIWorker
from workers.vip_aircraft import VIPAircraftWorker
from workers.bomber_isr import BomberISRWorker

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None

WORKERS: list[FeedWorker] = [
    # Phase 1 & 2 workers
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
    # Phase 4 workers — batch 1 (cyber/infrastructure)
    NVDCVEWorker(),
    CloudflareRadarWorker(),
    MalwareBazaarWorker(),
    EIAGridWorker(),
    ENTSOEWorker(),
    EURDEPWorker(),
    # Phase 4 workers — batch 2 (space/geopolitical/economics)
    NASANEOWorker(),
    SpaceDevsWorker(),
    OpenSanctionsWorker(),
    USTravelAdvisoryWorker(),
    FEWSNETWorker(),
    CoinGeckoWorker(),
    FREDWorker(),
    # Phase 4 workers — batch 3 (aviation/maritime/OSINT)
    ADSBLolWorker(),
    OONIWorker(),
    FAANotamWorker(),
    USCGMaritimeWorker(),
    BakerHughesWorker(),
    TelegramOSINTWorker(),
    # Phase 5 workers — BGP & internet outage monitoring
    RIPEBGPWorker(),
    IODAOutagesWorker(),
    # Phase 5 workers — space & weather overlays
    SpaceTrackSatellitesWorker(),
    RainViewerRadarWorker(),
    # Phase 5 workers — humanitarian feeds
    UNHCRDisplacementWorker(),
    FEMAIPAWSWorker(),
    FEMASheltersWorker(),
    # Phase 5 workers — aviation safety, finance, social OSINT
    EmergencySquawksWorker(),
    FinnhubMarketsWorker(),
    RedditOSINTWorker(),
    # Phase 5 workers — nuclear monitoring
    IAEAPRISWorker(),
    NRCEventsWorker(),
    SafecastRadiationWorker(),
    # Phase 5 workers — tsunami & cyber advisories
    TsunamiWarningsWorker(),
    CISAAdvisoriesWorker(),
    # Phase 6 workers — military/maritime/aviation/finance/space/OSINT
    GTDTerrorismWorker(),
    PiracyIMBWorker(),
    BalticDryWorker(),
    CelestrakTLEWorker(),
    OSINTRSSWorker(),
    AirstrikesDerivedWorker(),
    NavalMMSIWorker(),
    VIPAircraftWorker(),
    BomberISRWorker(),
]


_UPSERT_SQL = sa_text("""
    INSERT INTO geo_events
        (id, source_id, category, subcategory, title, body, severity,
         lat, lng, metadata, url, event_time)
    VALUES
        (:id, :source_id, :category, :subcategory, :title, :body, :severity,
         :lat, :lng, CAST(:metadata AS jsonb), :url, :event_time)
    ON CONFLICT (id) DO UPDATE SET
        lat        = EXCLUDED.lat,
        lng        = EXCLUDED.lng,
        event_time = EXCLUDED.event_time,
        title      = EXCLUDED.title,
        body       = EXCLUDED.body,
        metadata   = EXCLUDED.metadata,
        severity   = EXCLUDED.severity
""")


async def _persist_events(events: list) -> None:
    """Bulk-upsert GeoEvents into geo_events table."""
    if not events:
        return
    rows = [
        {
            "id": e.id,
            "source_id": e.source_id,
            "category": e.category if isinstance(e.category, str) else e.category.value,
            "subcategory": e.subcategory,
            "title": e.title,
            "body": e.body,
            "severity": e.severity if isinstance(e.severity, str) else e.severity.value,
            "lat": float(e.lat),
            "lng": float(e.lng),
            "metadata": json.dumps(e.metadata or {}),  # CAST AS jsonb handles string→jsonb
            "url": e.url,
            "event_time": e.event_time,
        }
        for e in events
    ]
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(_UPSERT_SQL, rows)
            await session.commit()
    except Exception as exc:
        logger.warning("db_persist_failed", extra={"error": str(exc)})


async def _run_worker(worker: FeedWorker) -> None:
    events = await worker.run()
    if not events:
        return

    # Persist to DB first so HTTP hydration always has data
    await _persist_events(events)

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

        # Feed health monitor — runs every 5 minutes
        _scheduler.add_job(
            _check_feed_health,
            trigger=IntervalTrigger(seconds=300),
            id="feed_health_monitor",
            name="Feed Health Monitor",
            max_instances=1,
            replace_existing=True,
        )

    return _scheduler


async def run_all_workers_once() -> None:
    """Run eligible workers immediately on startup to pre-populate data.
    Workers with run_on_startup=False are skipped to avoid rate-limiting."""
    tasks = [_run_worker(w) for w in WORKERS if w.run_on_startup]
    await asyncio.gather(*tasks, return_exceptions=True)


async def _check_feed_health() -> None:
    """Periodic health check — publish alerts for unhealthy workers."""
    from workers.base import FeedStatus
    unhealthy = []
    for worker in WORKERS:
        h = worker.health_check()
        if h.status in (FeedStatus.error, FeedStatus.stale):
            unhealthy.append({
                "source_id": worker.source_id,
                "display_name": worker.display_name,
                "status": h.status.value,
                "last_error": h.last_error,
                "error_count": h.error_count,
            })
    if unhealthy:
        payload = orjson.dumps({
            "type": "feed_health_alert",
            "unhealthy_count": len(unhealthy),
            "feeds": unhealthy,
        }).decode()
        await publish_event("meridian:events", payload)
        logger.warning(
            "feed_health_alert",
            extra={"unhealthy_count": len(unhealthy),
                   "feeds": [f["source_id"] for f in unhealthy]},
        )


def get_all_workers() -> list[FeedWorker]:
    return WORKERS
