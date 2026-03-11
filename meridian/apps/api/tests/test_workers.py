"""
Unit tests for feed workers — all external HTTP calls are intercepted with respx.
No database or running API required.
"""
import pytest
import respx
from datetime import datetime, timezone
from httpx import Response

from models.geo_event import SeverityLevel
from workers.usgs_earthquakes import USGSEarthquakesWorker, _magnitude_to_severity
from workers.nasa_iss import NASAISSWorker
from workers.fema import FEMAWorker
from workers.gdacs import GDACSWorker
from workers.base import FeedWorker, FeedHealth, FeedStatus

pytestmark = pytest.mark.asyncio

USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
ISS_URL = "http://api.open-notify.org/iss-now.json"
ISS_CREW_URL = "http://api.open-notify.org/astros.json"
FEMA_URL = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"


# ── Helpers ───────────────────────────────────────────────────────────────────

def usgs_feature(
    event_id="ci12345",
    mag=5.5,
    place="10km NE of Test City, CA",
    lat=34.052,
    lng=-118.243,
    depth=10.0,
    ts_ms=1_717_200_000_000,
):
    return {
        "id": event_id,
        "properties": {
            "mag": mag,
            "place": place,
            "time": ts_ms,
            "url": f"https://earthquake.usgs.gov/earthquakes/eventpage/{event_id}",
        },
        "geometry": {"coordinates": [lng, lat, depth]},
    }


# ── Magnitude severity mapping ────────────────────────────────────────────────

class TestMagnitudeSeverity:
    def test_critical_at_7_plus(self):
        assert _magnitude_to_severity(7.0) == SeverityLevel.critical
        assert _magnitude_to_severity(8.5) == SeverityLevel.critical

    def test_high_at_6_to_7(self):
        assert _magnitude_to_severity(6.0) == SeverityLevel.high
        assert _magnitude_to_severity(6.9) == SeverityLevel.high

    def test_medium_at_5_to_6(self):
        assert _magnitude_to_severity(5.0) == SeverityLevel.medium
        assert _magnitude_to_severity(5.9) == SeverityLevel.medium

    def test_low_at_4_to_5(self):
        assert _magnitude_to_severity(4.0) == SeverityLevel.low
        assert _magnitude_to_severity(4.9) == SeverityLevel.low

    def test_info_below_4(self):
        assert _magnitude_to_severity(2.5) == SeverityLevel.info
        assert _magnitude_to_severity(3.9) == SeverityLevel.info


# ── USGS Earthquakes Worker ───────────────────────────────────────────────────

class TestUSGSEarthquakesWorker:
    async def test_parses_single_event(self):
        payload = {"features": [usgs_feature()]}
        with respx.mock:
            respx.get(USGS_URL).mock(return_value=Response(200, json=payload))
            events = await USGSEarthquakesWorker().fetch()

        assert len(events) == 1
        e = events[0]
        assert e.id == "ci12345"
        assert e.source_id == "usgs_earthquakes"
        assert e.lat == pytest.approx(34.052)
        assert e.lng == pytest.approx(-118.243)
        assert e.severity == SeverityLevel.medium
        assert "M5.5" in e.title

    async def test_parses_multiple_events(self):
        payload = {
            "features": [
                usgs_feature("ev1", mag=4.0, lat=35.0, lng=-120.0),
                usgs_feature("ev2", mag=7.2, lat=36.0, lng=-121.0),
                usgs_feature("ev3", mag=2.0, lat=37.0, lng=-122.0),
            ]
        }
        with respx.mock:
            respx.get(USGS_URL).mock(return_value=Response(200, json=payload))
            events = await USGSEarthquakesWorker().fetch()

        assert len(events) == 3
        severities = {e.id: e.severity for e in events}
        assert severities["ev1"] == SeverityLevel.low
        assert severities["ev2"] == SeverityLevel.critical
        assert severities["ev3"] == SeverityLevel.info

    async def test_skips_features_with_missing_coords(self):
        payload = {
            "features": [
                {
                    "id": "no_coords",
                    "properties": {"mag": 5.0, "place": "Unknown", "time": 1_000_000_000_000},
                    "geometry": {"coordinates": [None, None, None]},
                }
            ]
        }
        with respx.mock:
            respx.get(USGS_URL).mock(return_value=Response(200, json=payload))
            events = await USGSEarthquakesWorker().fetch()

        assert len(events) == 0

    async def test_returns_empty_on_empty_features(self):
        with respx.mock:
            respx.get(USGS_URL).mock(return_value=Response(200, json={"features": []}))
            events = await USGSEarthquakesWorker().fetch()
        assert events == []

    async def test_raises_on_http_error(self):
        with respx.mock:
            respx.get(USGS_URL).mock(return_value=Response(503))
            with pytest.raises(Exception):
                await USGSEarthquakesWorker().fetch()

    async def test_metadata_includes_magnitude(self):
        with respx.mock:
            respx.get(USGS_URL).mock(
                return_value=Response(200, json={"features": [usgs_feature(mag=6.3)]})
            )
            events = await USGSEarthquakesWorker().fetch()

        assert events[0].metadata["magnitude"] == pytest.approx(6.3)
        assert events[0].metadata["depth_km"] == pytest.approx(10.0)


# ── NASA ISS Worker ───────────────────────────────────────────────────────────

class TestNASAISSWorker:
    async def test_returns_single_event(self):
        iss_resp = {"iss_position": {"latitude": "51.5", "longitude": "-0.1"}, "timestamp": 1_700_000_000}
        crew_resp = {"people": [{"name": "A", "craft": "ISS"}, {"name": "B", "craft": "ISS"}]}

        with respx.mock:
            respx.get(ISS_URL).mock(return_value=Response(200, json=iss_resp))
            respx.get(ISS_CREW_URL).mock(return_value=Response(200, json=crew_resp))
            events = await NASAISSWorker().fetch()

        assert len(events) == 1
        e = events[0]
        assert e.source_id == "nasa_iss"
        assert e.lat == pytest.approx(51.5)
        assert e.lng == pytest.approx(-0.1)
        assert e.severity == SeverityLevel.info
        assert "2 crew" in e.title

    async def test_crew_count_in_title(self):
        iss_resp = {"iss_position": {"latitude": "0.0", "longitude": "0.0"}, "timestamp": 1_700_000_000}
        crew_resp = {"people": [
            {"name": "A", "craft": "ISS"},
            {"name": "B", "craft": "ISS"},
            {"name": "C", "craft": "ISS"},
        ]}
        with respx.mock:
            respx.get(ISS_URL).mock(return_value=Response(200, json=iss_resp))
            respx.get(ISS_CREW_URL).mock(return_value=Response(200, json=crew_resp))
            events = await NASAISSWorker().fetch()

        assert "3 crew" in events[0].title

    async def test_graceful_when_crew_endpoint_fails(self):
        iss_resp = {"iss_position": {"latitude": "10.0", "longitude": "20.0"}, "timestamp": 1_700_000_000}
        with respx.mock:
            respx.get(ISS_URL).mock(return_value=Response(200, json=iss_resp))
            respx.get(ISS_CREW_URL).mock(return_value=Response(500))
            events = await NASAISSWorker().fetch()

        assert len(events) == 1
        assert "ISS" in events[0].title

    async def test_returns_empty_on_main_endpoint_failure(self):
        with respx.mock:
            respx.get(ISS_URL).mock(return_value=Response(503))
            respx.get(ISS_CREW_URL).mock(return_value=Response(200, json={"people": []}))
            events = await NASAISSWorker().fetch()

        assert events == []


# ── FEMA Worker ───────────────────────────────────────────────────────────────

class TestFEMAWorker:
    def _fema_payload(self, declarations):
        return {"DisasterDeclarationsSummaries": declarations}

    def _declaration(self, num=4800, incident="Hurricane", state="FL", date="2024-09-10T00:00:00Z"):
        return {
            "disasterNumber": num,
            "incidentType": incident,
            "stateCode": state,
            "declarationTitle": incident,
            "declarationDate": date,
        }

    async def test_parses_hurricane_as_critical(self):
        payload = self._fema_payload([self._declaration(incident="Hurricane")])
        with respx.mock:
            respx.get(FEMA_URL).mock(return_value=Response(200, json=payload))
            events = await FEMAWorker().fetch()

        assert len(events) == 1
        assert events[0].severity == SeverityLevel.critical

    async def test_parses_drought_as_low(self):
        payload = self._fema_payload([self._declaration(incident="Drought")])
        with respx.mock:
            respx.get(FEMA_URL).mock(return_value=Response(200, json=payload))
            events = await FEMAWorker().fetch()

        assert events[0].severity == SeverityLevel.low

    async def test_lat_lng_from_state_code(self):
        payload = self._fema_payload([self._declaration(state="TX")])
        with respx.mock:
            respx.get(FEMA_URL).mock(return_value=Response(200, json=payload))
            events = await FEMAWorker().fetch()

        assert events[0].lat == pytest.approx(31.0)
        assert events[0].lng == pytest.approx(-100.0)

    async def test_event_id_includes_disaster_number(self):
        payload = self._fema_payload([self._declaration(num=5000)])
        with respx.mock:
            respx.get(FEMA_URL).mock(return_value=Response(200, json=payload))
            events = await FEMAWorker().fetch()

        assert events[0].id == "fema_5000"

    async def test_returns_empty_on_api_failure(self):
        with respx.mock:
            respx.get(FEMA_URL).mock(return_value=Response(500))
            events = await FEMAWorker().fetch()

        assert events == []

    async def test_handles_multiple_declarations(self):
        payload = self._fema_payload([
            self._declaration(num=4800, incident="Hurricane", state="FL"),
            self._declaration(num=4801, incident="Fire", state="CA"),
            self._declaration(num=4802, incident="Flood", state="TX"),
        ])
        with respx.mock:
            respx.get(FEMA_URL).mock(return_value=Response(200, json=payload))
            events = await FEMAWorker().fetch()

        assert len(events) == 3
        assert {e.id for e in events} == {"fema_4800", "fema_4801", "fema_4802"}


# ── FeedWorker base health tracking ──────────────────────────────────────────

class TestFeedWorkerHealthTracking:
    def _worker(self):
        class DummyWorker(FeedWorker):
            source_id = "dummy"
            display_name = "Dummy"
            category = "environment"
            refresh_interval = 60

            async def fetch(self):
                return []

        return DummyWorker()

    def test_initial_status_is_healthy(self):
        w = self._worker()
        health = w.health_check()
        assert health.status == FeedStatus.healthy

    def test_initial_fetch_count_is_zero(self):
        w = self._worker()
        assert w.health_check().fetch_count == 0

    def test_initial_avg_latency_is_none(self):
        w = self._worker()
        assert w.health_check().avg_latency_ms is None

    async def test_run_increments_fetch_count(self):
        w = self._worker()
        await w.run()
        assert w.health_check().fetch_count == 1

    async def test_run_records_last_success(self):
        w = self._worker()
        await w.run()
        assert w.health_check().last_success is not None

    async def test_error_increments_error_count(self):
        class FailingWorker(FeedWorker):
            source_id = "failing"
            display_name = "Failing"
            category = "environment"
            refresh_interval = 60

            async def fetch(self):
                raise RuntimeError("Simulated failure")

        w = FailingWorker()
        await w.run()
        assert w.health_check().error_count == 1
        assert w.health_check().last_error == "Simulated failure"

    async def test_three_consecutive_errors_sets_error_status(self):
        class FailingWorker(FeedWorker):
            source_id = "failing"
            display_name = "Failing"
            category = "environment"
            refresh_interval = 60

            async def fetch(self):
                raise RuntimeError("fail")

        w = FailingWorker()
        for _ in range(3):
            await w.run()

        assert w.health_check().status == FeedStatus.error
