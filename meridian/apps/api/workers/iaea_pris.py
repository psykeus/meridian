"""IAEA PRIS — Power Reactor Information System global nuclear reactor database."""
import hashlib
from datetime import datetime, timezone

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers.base import FeedWorker

# Curated list of ~50 major nuclear reactor sites worldwide.
# Each entry: (name, country, lat, lng, reactor_type, capacity_mw, status)
_REACTOR_SITES: list[tuple[str, str, float, float, str, int, str]] = [
    # --- United States ---
    ("Palo Verde", "USA", 33.3881, -112.8622, "PWR", 3937, "Operating"),
    ("South Texas Project", "USA", 28.7950, -96.0489, "PWR", 2708, "Operating"),
    ("Vogtle", "USA", 33.1414, -81.7590, "PWR", 4540, "Operating"),
    ("Watts Bar", "USA", 35.6031, -84.7914, "PWR", 2330, "Operating"),
    ("Diablo Canyon", "USA", 35.2119, -120.8544, "PWR", 2256, "Operating"),
    ("Braidwood", "USA", 41.2425, -88.2264, "PWR", 2386, "Operating"),
    ("Byron", "USA", 42.0756, -89.2817, "PWR", 2346, "Operating"),
    ("Catawba", "USA", 35.0517, -81.0700, "PWR", 2258, "Operating"),
    ("McGuire", "USA", 35.4322, -80.9486, "PWR", 2258, "Operating"),
    ("Peach Bottom", "USA", 39.7589, -76.2689, "BWR", 2770, "Operating"),
    # --- France ---
    ("Gravelines", "France", 51.0153, 2.1064, "PWR", 5460, "Operating"),
    ("Paluel", "France", 49.8589, 0.6331, "PWR", 5320, "Operating"),
    ("Cattenom", "France", 49.4067, 6.2197, "PWR", 5448, "Operating"),
    ("Saint-Alban", "France", 45.4069, 4.7544, "PWR", 2670, "Operating"),
    ("Flamanville", "France", 49.5375, -1.8814, "PWR", 2660, "Operating"),
    ("Tricastin", "France", 44.3325, 4.7319, "PWR", 3660, "Operating"),
    # --- China ---
    ("Taishan", "China", 21.9089, 112.9806, "EPR", 3460, "Operating"),
    ("Yangjiang", "China", 21.7081, 111.9744, "PWR", 6000, "Operating"),
    ("Hongyanhe", "China", 39.7928, 121.4767, "PWR", 6710, "Operating"),
    ("Fuqing", "China", 25.4406, 119.4464, "PWR", 5990, "Operating"),
    ("Daya Bay", "China", 22.5964, 114.5444, "PWR", 1968, "Operating"),
    ("Tianwan", "China", 34.6867, 119.4553, "VVER", 6260, "Operating"),
    # --- Russia ---
    ("Leningrad II", "Russia", 59.8331, 29.0339, "VVER", 2350, "Operating"),
    ("Novovoronezh II", "Russia", 51.2744, 39.2142, "VVER", 2400, "Operating"),
    ("Kursk", "Russia", 51.6744, 35.6064, "RBMK", 4000, "Operating"),
    ("Kalinin", "Russia", 57.7658, 35.0922, "VVER", 4000, "Operating"),
    ("Balakovo", "Russia", 52.0897, 47.9567, "VVER", 4000, "Operating"),
    # --- Japan ---
    ("Kashiwazaki-Kariwa", "Japan", 37.4264, 138.5972, "BWR/ABWR", 8212, "Idle"),
    ("Ohi", "Japan", 35.5414, 135.6567, "PWR", 4710, "Operating"),
    ("Takahama", "Japan", 35.5222, 135.5028, "PWR", 3392, "Operating"),
    ("Sendai", "Japan", 31.8350, 130.1892, "PWR", 1780, "Operating"),
    ("Ikata", "Japan", 33.4906, 132.3133, "PWR", 890, "Operating"),
    # --- South Korea ---
    ("Shin-Kori", "South Korea", 35.3208, 129.2853, "APR-1400", 5600, "Operating"),
    ("Hanbit", "South Korea", 35.4128, 126.4253, "PWR", 5875, "Operating"),
    ("Hanul", "South Korea", 37.0928, 129.3833, "PWR", 5881, "Operating"),
    ("Wolsong", "South Korea", 35.7114, 129.4756, "PHWR/PWR", 3479, "Operating"),
    # --- India ---
    ("Kudankulam", "India", 8.1703, 77.7114, "VVER", 2000, "Operating"),
    ("Tarapur", "India", 19.8314, 72.6547, "BWR/PHWR", 1400, "Operating"),
    ("Kakrapar", "India", 21.2361, 73.3506, "PHWR", 1480, "Operating"),
    ("Rajasthan", "India", 24.8794, 75.5778, "PHWR", 1180, "Operating"),
    # --- United Kingdom ---
    ("Hinkley Point C", "UK", 51.2080, -3.1303, "EPR", 3260, "Under Construction"),
    ("Sizewell B", "UK", 52.2156, 1.6197, "PWR", 1198, "Operating"),
    ("Torness", "UK", 55.9694, -2.3978, "AGR", 1185, "Operating"),
    # --- Canada ---
    ("Bruce", "Canada", 44.3253, -81.5997, "PHWR", 6384, "Operating"),
    ("Darlington", "Canada", 43.8750, -78.7200, "PHWR", 3512, "Operating"),
    ("Pickering", "Canada", 43.8114, -79.0656, "PHWR", 3094, "Operating"),
    # --- Other notable ---
    ("Zaporizhzhia", "Ukraine", 47.5069, 34.5886, "VVER", 5700, "Shutdown (conflict)"),
    ("Barakah", "UAE", 23.9589, 52.2583, "APR-1400", 5600, "Operating"),
    ("Akkuyu", "Turkey", 36.1444, 33.5300, "VVER", 4800, "Under Construction"),
    ("Olkiluoto", "Finland", 61.2353, 21.4472, "BWR/EPR", 2860, "Operating"),
    ("Forsmark", "Sweden", 60.4081, 18.1681, "BWR", 3210, "Operating"),
]


def _status_to_severity(status: str) -> SeverityLevel:
    """Map reactor operational status to severity level."""
    s = status.lower()
    if "conflict" in s or "accident" in s:
        return SeverityLevel.critical
    if "shutdown" in s or "decommission" in s:
        return SeverityLevel.medium
    if "construction" in s:
        return SeverityLevel.low
    if "idle" in s or "suspended" in s:
        return SeverityLevel.low
    return SeverityLevel.info


class IAEAPRISWorker(FeedWorker):
    """Curated global nuclear reactor site database based on IAEA PRIS data."""

    source_id = "iaea_pris"
    display_name = "IAEA Nuclear Reactors"
    category = FeedCategory.nuclear
    refresh_interval = 86400  # daily — static dataset

    async def fetch(self) -> list[GeoEvent]:
        now = datetime.now(timezone.utc)
        events: list[GeoEvent] = []

        for name, country, lat, lng, reactor_type, capacity_mw, status in _REACTOR_SITES:
            site_hash = hashlib.md5(f"{name}_{country}".encode()).hexdigest()[:12]
            severity = _status_to_severity(status)

            events.append(
                GeoEvent(
                    id=f"iaea_pris_{site_hash}",
                    source_id=self.source_id,
                    category=self.category,
                    subcategory="nuclear_reactor",
                    title=f"{name} Nuclear Power Plant — {country}",
                    body=(
                        f"{name} ({country}): {reactor_type} reactor site, "
                        f"{capacity_mw} MW capacity. Status: {status}."
                    ),
                    severity=severity,
                    lat=lat,
                    lng=lng,
                    event_time=now,
                    url="https://pris.iaea.org/PRIS/home.aspx",
                    metadata={
                        "plant_name": name,
                        "country": country,
                        "reactor_type": reactor_type,
                        "capacity_mw": capacity_mw,
                        "status": status,
                    },
                )
            )

        return events
