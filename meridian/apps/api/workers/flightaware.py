"""FlightAware AeroAPI — enriched flight tracking data.

Uses the AeroAPI v4 endpoint to fetch live flight positions with
route, aircraft type, and operator information that OpenSky doesn't provide.

Free (Personal) tier: 500 API calls/month, 10 req/min.
Worker runs every 2 hours to stay well within limits (~360 calls/month).
"""

import logging
from datetime import datetime, timezone
from typing import List

import httpx

from core.credential_store import get_credential
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel

from .base import FeedWorker

logger = logging.getLogger(__name__)

_BASE_URL = "https://aeroapi.flightaware.com/aeroapi"

# Interesting search queries for situational awareness
# Each costs 1 API call; rotate through them to spread budget
_SEARCH_QUERIES = [
    # High-altitude traffic (FL410+)
    {"query": "-aboveAltitude 410 -belowAltitude 650"},
    # Major airline traffic samples
    {"query": "-airline UAL"},
    {"query": "-destination KJFK"},
    {"query": "-aboveAltitude 100"},
]

_MAX_FLIGHTS = 200


class FlightAwareWorker(FeedWorker):
    """FlightAware AeroAPI — enriched flight data with routes and operators.

    Provides flight data that complements OpenSky/adsb.lol:
      - Aircraft type and operator information
      - Origin/destination airports with codes
      - More reliable altitude and speed data

    Requires FLIGHTAWARE_API_KEY credential (Personal/Free tier supported).
    """

    source_id = "flightaware"
    display_name = "FlightAware AeroAPI"
    category = FeedCategory.aviation
    refresh_interval = 28800  # 8 hours — ~3 calls/day × $0.05 = ~$4.50/month (within $5 free tier)
    run_on_startup = True

    def __init__(self) -> None:
        super().__init__()
        self._query_index = 0

    async def fetch(self) -> List[GeoEvent]:
        api_key = get_credential("FLIGHTAWARE_API_KEY")
        if not api_key:
            logger.warning("flightaware: no FLIGHTAWARE_API_KEY configured — skipping")
            return []

        headers = {
            "x-apikey": api_key,
            "Accept": "application/json",
        }

        # Rotate through search queries to spread API budget
        query_params = _SEARCH_QUERIES[self._query_index % len(_SEARCH_QUERIES)]
        self._query_index += 1

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(
                    f"{_BASE_URL}/flights/search",
                    params=query_params,
                    headers=headers,
                )
                if resp.status_code == 401:
                    logger.error("flightaware: invalid API key (401)")
                    return []
                if resp.status_code == 429:
                    logger.warning("flightaware: rate limited (429) — backing off")
                    self.refresh_interval = min(self.refresh_interval * 2, 14400)
                    return []
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                logger.warning(f"flightaware: HTTP {exc.response.status_code}")
                return []
            except Exception as exc:
                logger.warning(f"flightaware: request failed: {exc}")
                return []

        flights = data.get("flights") or []
        events: List[GeoEvent] = []
        now = datetime.now(timezone.utc)

        for flight in flights[:_MAX_FLIGHTS]:
            try:
                last_pos = flight.get("last_position") or {}
                lat = last_pos.get("latitude")
                lng = last_pos.get("longitude")

                if lat is None or lng is None:
                    continue
                if not (-90 <= float(lat) <= 90) or not (-180 <= float(lng) <= 180):
                    continue

                ident = (flight.get("ident") or "").strip()
                fa_flight_id = flight.get("fa_flight_id", "")
                aircraft_type = flight.get("aircraft_type") or ""
                operator = flight.get("operator") or ""

                origin = flight.get("origin") or {}
                dest = flight.get("destination") or {}
                origin_icao = origin.get("code_icao") or origin.get("code") or ""
                dest_icao = dest.get("code_icao") or dest.get("code") or ""
                origin_name = origin.get("name") or origin_icao
                dest_name = dest.get("name") or dest_icao

                alt_ft = int(last_pos.get("altitude", 0) or 0) * 100  # API returns flight levels (hundreds of feet)
                groundspeed = last_pos.get("groundspeed", 0) or 0
                heading = last_pos.get("heading")

                route_str = ""
                if origin_icao and dest_icao:
                    route_str = f"{origin_icao} → {dest_icao}"

                title = f"{ident or fa_flight_id}"
                if aircraft_type:
                    title += f" [{aircraft_type}]"

                body_parts = []
                if route_str:
                    body_parts.append(route_str)
                if operator:
                    body_parts.append(f"Op: {operator}")
                body_parts.append(f"Alt {alt_ft:,}ft · {groundspeed}kt")
                body = " · ".join(body_parts)

                severity = SeverityLevel.info

                event_id = f"fa_{ident}_{fa_flight_id}".replace("/", "_")

                events.append(GeoEvent(
                    id=event_id,
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=title,
                    body=body,
                    lat=float(lat),
                    lng=float(lng),
                    event_time=now,
                    url=f"https://www.flightaware.com/live/flight/{ident}" if ident else None,
                    metadata={
                        "ident": ident,
                        "fa_flight_id": fa_flight_id,
                        "aircraft_type": aircraft_type,
                        "operator": operator,
                        "origin_icao": origin_icao,
                        "origin_name": origin_name,
                        "destination_icao": dest_icao,
                        "destination_name": dest_name,
                        "altitude_ft": alt_ft,
                        "groundspeed": groundspeed,
                        "heading": heading,
                        "callsign": ident,
                    },
                ))
            except Exception:
                continue

        # Reset refresh interval on success
        self.refresh_interval = 28800
        return events
