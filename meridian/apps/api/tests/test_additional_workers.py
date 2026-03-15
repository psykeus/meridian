"""
Unit tests for additional feed workers — NOAA, GDACS, NASA FIRMS, ACLED, CISA KEV.
All HTTP calls intercepted with respx. No database or running API required.
"""
import pytest
import respx
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from unittest.mock import patch
from httpx import Response

from models.geo_event import SeverityLevel, FeedCategory
from workers.noaa_alerts import NOAAWeatherAlertsWorker, NOAA_ALERTS_URL
from workers.gdacs import GDACSWorker
from workers.nasa_firms import NASAFIRMSWorker, _FIRMS_URL
from workers.acled import ACLEDConflictWorker, ACLED_URL
from workers.cisa_kev import CISAKEVWorker

pytestmark = pytest.mark.asyncio


# ── NOAA Weather Alerts ─────────────────────────────────────────────────────

class TestNOAAWeatherAlertsWorker:
    def _noaa_feature(self, event="Tornado Warning", severity="Extreme",
                      lat=35.0, lng=-97.0, onset="2024-06-01T12:00:00Z"):
        return {
            "properties": {
                "id": f"noaa_{event.lower().replace(' ', '_')}",
                "event": event,
                "severity": severity,
                "onset": onset,
                "headline": f"{event} for Oklahoma",
                "description": "Take shelter immediately.",
                "certainty": "Observed",
                "urgency": "Immediate",
                "areaDesc": "Central Oklahoma",
                "senderName": "NWS Norman OK",
                "expires": "2024-06-01T14:00:00Z",
                "instruction": "Take cover now.",
                "@id": "https://api.weather.gov/alerts/test123",
            },
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat],
            },
        }

    async def test_parses_point_geometry(self):
        payload = {"features": [self._noaa_feature()]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert len(events) == 1
        assert events[0].lat == pytest.approx(35.0)
        assert events[0].lng == pytest.approx(-97.0)

    async def test_extreme_severity_maps_to_critical(self):
        payload = {"features": [self._noaa_feature(severity="Extreme")]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert events[0].severity == SeverityLevel.critical

    async def test_severe_maps_to_high(self):
        payload = {"features": [self._noaa_feature(severity="Severe", event="Winter Storm Warning")]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert events[0].severity == SeverityLevel.high

    async def test_moderate_maps_to_medium(self):
        payload = {"features": [self._noaa_feature(severity="Moderate", event="Heat Advisory")]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert events[0].severity == SeverityLevel.medium

    async def test_priority_event_boost(self):
        """Tornado Warning at Moderate severity should be boosted to high."""
        payload = {"features": [self._noaa_feature(event="Tornado Warning", severity="Moderate")]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert events[0].severity == SeverityLevel.high

    async def test_polygon_geometry_centroid(self):
        # Polygon ring: 5 points (last closes the ring = repeats first).
        # Centroid = mean of all 5 points including the closing vertex.
        # lats: [30,40,40,30,30] → mean=34.0   lngs: [-100,-100,-90,-90,-100] → mean=-96.0
        feature = {
            "properties": {
                "id": "poly_test",
                "event": "Flood Warning",
                "severity": "Moderate",
                "onset": "2024-06-01T12:00:00Z",
                "headline": "Flood Warning",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-100.0, 30.0], [-100.0, 40.0],
                    [-90.0, 40.0], [-90.0, 30.0], [-100.0, 30.0],
                ]],
            },
        }
        payload = {"features": [feature]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert len(events) == 1
        assert events[0].lat == pytest.approx(34.0, abs=0.1)
        assert events[0].lng == pytest.approx(-96.0, abs=0.1)

    async def test_skips_feature_without_geometry(self):
        feature = {
            "properties": {
                "id": "no_geom",
                "event": "Test",
                "severity": "Minor",
                "onset": "2024-06-01T12:00:00Z",
                "headline": "Test",
                "geocode": {},
            },
            "geometry": None,
        }
        payload = {"features": [feature]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert len(events) == 0

    async def test_raises_on_http_error(self):
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(503))
            with pytest.raises(Exception):
                await NOAAWeatherAlertsWorker().fetch()

    async def test_returns_empty_on_no_features(self):
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json={"features": []}))
            events = await NOAAWeatherAlertsWorker().fetch()

        assert events == []

    async def test_metadata_includes_urgency_and_certainty(self):
        payload = {"features": [self._noaa_feature()]}
        with respx.mock:
            respx.get(NOAA_ALERTS_URL).mock(return_value=Response(200, json=payload))
            events = await NOAAWeatherAlertsWorker().fetch()

        meta = events[0].metadata
        assert meta["urgency"] == "Immediate"
        assert meta["certainty"] == "Observed"
        assert meta["event"] == "Tornado Warning"

    async def test_source_id_is_correct(self):
        w = NOAAWeatherAlertsWorker()
        assert w.source_id == "noaa_weather_alerts"
        assert w.category == FeedCategory.environment


# ── NASA FIRMS ───────────────────────────────────────────────────────────────

class TestNASAFIRMSWorker:
    """NASA FIRMS worker now fetches CSV from the FIRMS API with a MAP_KEY."""

    _CSV_HEADER = "latitude,longitude,brightness,bright_ti4,acq_date,acq_time,satellite,confidence,frp,daynight"

    def _csv_row(self, lat=34.0, lng=-118.0, frp=50.0, brightness=350.0,
                 acq_date="2024-06-01", acq_time="1200"):
        return f"{lat},{lng},{brightness},{brightness},{acq_date},{acq_time},VIIRS,nominal,{frp},D"

    def _csv_payload(self, rows):
        return self._CSV_HEADER + "\n" + "\n".join(rows)

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_parses_fire_event(self, mock_cred):
        csv_text = self._csv_payload([self._csv_row()])
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(200, text=csv_text)
            )
            events = await NASAFIRMSWorker().fetch()

        assert len(events) == 1
        assert events[0].source_id == "nasa_firms"

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_frp_100_is_critical(self, mock_cred):
        csv_text = self._csv_payload([self._csv_row(frp=100)])
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(200, text=csv_text)
            )
            events = await NASAFIRMSWorker().fetch()

        assert events[0].severity == SeverityLevel.critical

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_frp_30_is_high(self, mock_cred):
        csv_text = self._csv_payload([self._csv_row(frp=30, brightness=300)])
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(200, text=csv_text)
            )
            events = await NASAFIRMSWorker().fetch()

        assert events[0].severity == SeverityLevel.high

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_frp_10_is_medium(self, mock_cred):
        csv_text = self._csv_payload([self._csv_row(frp=10, brightness=300)])
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(200, text=csv_text)
            )
            events = await NASAFIRMSWorker().fetch()

        assert events[0].severity == SeverityLevel.medium

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_low_frp_is_low(self, mock_cred):
        csv_text = self._csv_payload([self._csv_row(frp=5, brightness=300)])
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(200, text=csv_text)
            )
            events = await NASAFIRMSWorker().fetch()

        assert events[0].severity == SeverityLevel.low

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_brightness_400_is_critical(self, mock_cred):
        csv_text = self._csv_payload([self._csv_row(frp=5, brightness=400)])
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(200, text=csv_text)
            )
            events = await NASAFIRMSWorker().fetch()

        assert events[0].severity == SeverityLevel.critical

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_returns_empty_on_failure(self, mock_cred):
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(500)
            )
            events = await NASAFIRMSWorker().fetch()

        assert events == []

    @patch("workers.nasa_firms.get_credential", return_value="FAKE_MAP_KEY")
    async def test_metadata_includes_frp_and_brightness(self, mock_cred):
        csv_text = self._csv_payload([self._csv_row(frp=42.5, brightness=355.0)])
        with respx.mock:
            respx.get(f"{_FIRMS_URL}/FAKE_MAP_KEY/VIIRS_NOAA20_NRT/world/1").mock(
                return_value=Response(200, text=csv_text)
            )
            events = await NASAFIRMSWorker().fetch()

        assert events[0].metadata["frp"] == pytest.approx(42.5)
        assert events[0].metadata["brightness"] == pytest.approx(355.0)


# ── GDACS ────────────────────────────────────────────────────────────────────

class TestGDACSWorker:
    def _gdacs_rss(self, items=None):
        """Build a minimal GDACS RSS XML string."""
        if items is None:
            items = [self._gdacs_item()]

        items_xml = "\n".join(items)
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:gdacs="http://www.gdacs.org"
     xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>GDACS</title>
    {items_xml}
  </channel>
</rss>"""

    def _gdacs_item(self, title="Red alert: Earthquake", lat="35.0", lng="-97.0",
                    alert_color="Red", event_type="EQ", event_id="12345",
                    country="Turkey"):
        return f"""<item>
      <title>{title}</title>
      <link>https://www.gdacs.org/report.aspx?eventid={event_id}</link>
      <description>Major earthquake</description>
      <pubDate>Mon, 01 Jun 2024 12:00:00 GMT</pubDate>
      <gdacs:alertlevel>{alert_color}</gdacs:alertlevel>
      <gdacs:eventtype>{event_type}</gdacs:eventtype>
      <gdacs:eventid>{event_id}</gdacs:eventid>
      <gdacs:country>{country}</gdacs:country>
      <geo:lat>{lat}</geo:lat>
      <geo:long>{lng}</geo:long>
    </item>"""

    async def test_parses_red_alert_as_critical(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text=self._gdacs_rss())
            )
            events = await GDACSWorker().fetch()

        assert len(events) == 1
        assert events[0].severity == SeverityLevel.critical

    async def test_orange_alert_is_high(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text=self._gdacs_rss([
                    self._gdacs_item(alert_color="Orange")
                ]))
            )
            events = await GDACSWorker().fetch()

        assert events[0].severity == SeverityLevel.high

    async def test_green_alert_is_medium(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text=self._gdacs_rss([
                    self._gdacs_item(alert_color="Green")
                ]))
            )
            events = await GDACSWorker().fetch()

        assert events[0].severity == SeverityLevel.medium

    async def test_lat_lng_parsed_correctly(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text=self._gdacs_rss([
                    self._gdacs_item(lat="10.5", lng="20.3")
                ]))
            )
            events = await GDACSWorker().fetch()

        assert events[0].lat == pytest.approx(10.5)
        assert events[0].lng == pytest.approx(20.3)

    async def test_event_id_includes_type_and_id(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text=self._gdacs_rss([
                    self._gdacs_item(event_type="TC", event_id="99999")
                ]))
            )
            events = await GDACSWorker().fetch()

        assert events[0].id == "gdacs_TC_99999"

    async def test_returns_empty_on_http_failure(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(return_value=Response(500))
            events = await GDACSWorker().fetch()

        assert events == []

    async def test_returns_empty_on_invalid_xml(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text="not xml at all")
            )
            events = await GDACSWorker().fetch()

        assert events == []

    async def test_skips_items_without_coordinates(self):
        item = """<item>
          <title>No coords</title>
          <gdacs:alertlevel xmlns:gdacs="http://www.gdacs.org">Red</gdacs:alertlevel>
        </item>"""
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text=self._gdacs_rss([item]))
            )
            events = await GDACSWorker().fetch()

        assert len(events) == 0

    async def test_metadata_includes_event_type_and_country(self):
        with respx.mock:
            respx.get(GDACSWorker._RSS_URL).mock(
                return_value=Response(200, text=self._gdacs_rss([
                    self._gdacs_item(event_type="FL", country="India")
                ]))
            )
            events = await GDACSWorker().fetch()

        assert events[0].metadata["event_type"] == "FL"
        assert events[0].metadata["country"] == "India"


# ── CISA KEV ─────────────────────────────────────────────────────────────────

class TestCISAKEVWorker:
    def _kev_payload(self, vulns=None):
        if vulns is None:
            vulns = [self._vuln()]
        return {"vulnerabilities": vulns}

    def _vuln(self, cve="CVE-2024-1234", vendor="Apache", product="HTTP Server",
              date_added=None, ransomware="Unknown"):
        if date_added is None:
            date_added = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return {
            "cveID": cve,
            "vendorProject": vendor,
            "product": product,
            "vulnerabilityName": f"{vendor} {product} RCE",
            "shortDescription": "A remote code execution vulnerability.",
            "dateAdded": date_added,
            "dueDate": "2024-12-31",
            "knownRansomwareCampaignUse": ransomware,
        }

    async def test_parses_recent_vulnerability(self):
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(
                return_value=Response(200, json=self._kev_payload())
            )
            events = await CISAKEVWorker().fetch()

        assert len(events) == 1
        assert events[0].source_id == "cisa_kev"
        assert "CVE-2024-1234" in events[0].title

    async def test_ransomware_known_is_critical(self):
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(
                return_value=Response(200, json=self._kev_payload([
                    self._vuln(ransomware="Known")
                ]))
            )
            events = await CISAKEVWorker().fetch()

        assert events[0].severity == SeverityLevel.critical

    async def test_no_ransomware_is_high(self):
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(
                return_value=Response(200, json=self._kev_payload([
                    self._vuln(ransomware="Unknown")
                ]))
            )
            events = await CISAKEVWorker().fetch()

        assert events[0].severity == SeverityLevel.high

    async def test_old_vulns_are_filtered_out(self):
        """Vulnerabilities added > 30 days ago should be excluded."""
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(
                return_value=Response(200, json=self._kev_payload([
                    self._vuln(date_added="2020-01-01")
                ]))
            )
            events = await CISAKEVWorker().fetch()

        assert len(events) == 0

    async def test_returns_empty_on_failure(self):
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(return_value=Response(500))
            events = await CISAKEVWorker().fetch()

        assert events == []

    async def test_event_id_includes_cve(self):
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(
                return_value=Response(200, json=self._kev_payload([
                    self._vuln(cve="CVE-2024-9999")
                ]))
            )
            events = await CISAKEVWorker().fetch()

        assert events[0].id == "cisa_kev_CVE-2024-9999"

    async def test_lat_lng_is_washington_dc(self):
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(
                return_value=Response(200, json=self._kev_payload())
            )
            events = await CISAKEVWorker().fetch()

        assert events[0].lat == pytest.approx(38.9072)
        assert events[0].lng == pytest.approx(-77.0369)

    async def test_metadata_includes_cve_and_vendor(self):
        with respx.mock:
            respx.get(CISAKEVWorker._URL).mock(
                return_value=Response(200, json=self._kev_payload([
                    self._vuln(cve="CVE-2024-5678", vendor="Microsoft", product="Exchange")
                ]))
            )
            events = await CISAKEVWorker().fetch()

        meta = events[0].metadata
        assert meta["cve_id"] == "CVE-2024-5678"
        assert meta["vendor"] == "Microsoft"
        assert meta["product"] == "Exchange"


# ── ACLED Conflict Worker ────────────────────────────────────────────────────

class TestACLEDConflictWorker:
    def _acled_payload(self, data=None):
        if data is None:
            data = [self._acled_row()]
        return {"data": data}

    def _acled_row(self, event_type="Battles", fatalities=5, lat="10.5",
                   lng="30.2", actor1="Group A", country="Sudan",
                   event_id="SUD12345", date="2024-06-01"):
        return {
            "event_id_cnty": event_id,
            "event_date": date,
            "event_type": event_type,
            "sub_event_type": "Armed clash",
            "actor1": actor1,
            "actor2": "Group B",
            "country": country,
            "location": "Test City",
            "latitude": lat,
            "longitude": lng,
            "fatalities": str(fatalities),
            "notes": "Brief description of the event.",
            "source": "Source Agency",
        }

    async def test_returns_empty_when_no_api_key(self):
        """ACLED requires an API key — should return [] without one."""
        worker = ACLEDConflictWorker()
        # Default settings have empty acled_api_key
        events = await worker.fetch()
        assert events == []

    def _mock_creds(self, key):
        return {"ACLED_API_KEY": "test_key", "ACLED_EMAIL": "test@test.com"}.get(key, "")

    @patch("workers.acled.get_credential")
    async def test_battle_maps_to_high(self, mock_cred):
        mock_cred.side_effect = self._mock_creds
        with respx.mock:
            respx.get(ACLED_URL).mock(
                return_value=Response(200, json=self._acled_payload([
                    self._acled_row(event_type="Battles", fatalities=0)
                ]))
            )
            events = await ACLEDConflictWorker().fetch()

        assert events[0].severity == SeverityLevel.high

    @patch("workers.acled.get_credential")
    async def test_protests_maps_to_low(self, mock_cred):
        mock_cred.side_effect = self._mock_creds
        with respx.mock:
            respx.get(ACLED_URL).mock(
                return_value=Response(200, json=self._acled_payload([
                    self._acled_row(event_type="Protests", fatalities=0)
                ]))
            )
            events = await ACLEDConflictWorker().fetch()

        assert events[0].severity == SeverityLevel.low

    @patch("workers.acled.get_credential")
    async def test_fatalities_50_boosts_to_critical(self, mock_cred):
        mock_cred.side_effect = self._mock_creds
        with respx.mock:
            respx.get(ACLED_URL).mock(
                return_value=Response(200, json=self._acled_payload([
                    self._acled_row(event_type="Protests", fatalities=50)
                ]))
            )
            events = await ACLEDConflictWorker().fetch()

        assert events[0].severity == SeverityLevel.critical

    @patch("workers.acled.get_credential")
    async def test_fatalities_10_boosts_to_high(self, mock_cred):
        mock_cred.side_effect = self._mock_creds
        with respx.mock:
            respx.get(ACLED_URL).mock(
                return_value=Response(200, json=self._acled_payload([
                    self._acled_row(event_type="Protests", fatalities=10)
                ]))
            )
            events = await ACLEDConflictWorker().fetch()

        assert events[0].severity == SeverityLevel.high

    @patch("workers.acled.get_credential")
    async def test_skips_entries_with_invalid_coordinates(self, mock_cred):
        mock_cred.side_effect = self._mock_creds
        row = self._acled_row()
        row["latitude"] = "invalid"
        row["longitude"] = "invalid"

        with respx.mock:
            respx.get(ACLED_URL).mock(
                return_value=Response(200, json=self._acled_payload([row]))
            )
            events = await ACLEDConflictWorker().fetch()

        assert len(events) == 0

    @patch("workers.acled.get_credential")
    async def test_event_id_format(self, mock_cred):
        mock_cred.side_effect = self._mock_creds
        with respx.mock:
            respx.get(ACLED_URL).mock(
                return_value=Response(200, json=self._acled_payload([
                    self._acled_row(event_id="ETH98765")
                ]))
            )
            events = await ACLEDConflictWorker().fetch()

        assert events[0].id == "acled_ETH98765"
