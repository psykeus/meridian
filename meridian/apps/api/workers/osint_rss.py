"""OSINT RSS Aggregator — monitors open-source intelligence feeds for global events."""
import hashlib
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from workers._country_coords import COUNTRY_COORDS
from workers.base import FeedWorker

logger = logging.getLogger(__name__)

# OSINT and investigative journalism RSS feeds
# (label, url, default_lat, default_lng)
_OSINT_FEEDS = [
    ("Bellingcat", "https://www.bellingcat.com/feed/", 52.37, 4.90),
    ("The War Zone", "https://www.thedrive.com/the-war-zone/feed", 38.90, -77.04),
    ("RUSI", "https://rusi.org/rss.xml", 51.51, -0.13),
    ("Jane's Defence", "https://www.janes.com/feeds/news", 51.51, -0.13),
    ("CSIS", "https://www.csis.org/analysis/feed", 38.90, -77.04),
    ("Conflict Armament Research", "https://www.conflictarm.com/feed/", 51.51, -0.13),
    ("ACLED Analysis", "https://acleddata.com/feed/", 40.44, -79.95),
]

# Country-name to ISO alpha-2 mapping for geocoding from titles
_COUNTRY_NAMES: dict[str, str] = {
    "afghanistan": "af", "albania": "al", "algeria": "dz", "angola": "ao",
    "argentina": "ar", "armenia": "am", "australia": "au", "austria": "at",
    "azerbaijan": "az", "bahrain": "bh", "bangladesh": "bd",
    "belarus": "by", "belgium": "be", "bolivia": "bo",
    "bosnia": "ba", "brazil": "br", "bulgaria": "bg", "burkina faso": "bf",
    "burundi": "bi", "cambodia": "kh", "cameroon": "cm", "canada": "ca",
    "chad": "td", "chile": "cl", "china": "cn", "colombia": "co",
    "congo": "cd", "croatia": "hr", "cuba": "cu", "cyprus": "cy",
    "czech": "cz", "denmark": "dk", "djibouti": "dj",
    "ecuador": "ec", "egypt": "eg", "eritrea": "er", "estonia": "ee",
    "ethiopia": "et", "finland": "fi", "france": "fr",
    "georgia": "ge", "germany": "de", "ghana": "gh", "greece": "gr",
    "guatemala": "gt", "haiti": "ht", "honduras": "hn", "hungary": "hu",
    "india": "in", "indonesia": "id", "iran": "ir", "iraq": "iq",
    "ireland": "ie", "israel": "il", "italy": "it", "japan": "jp",
    "jordan": "jo", "kazakhstan": "kz", "kenya": "ke", "kuwait": "kw",
    "kyrgyzstan": "kg", "laos": "la", "latvia": "lv", "lebanon": "lb",
    "liberia": "lr", "libya": "ly", "lithuania": "lt",
    "madagascar": "mg", "malaysia": "my", "mali": "ml",
    "mexico": "mx", "moldova": "md", "mongolia": "mn", "montenegro": "me",
    "morocco": "ma", "mozambique": "mz", "myanmar": "mm",
    "namibia": "na", "nepal": "np", "netherlands": "nl", "new zealand": "nz",
    "nicaragua": "ni", "niger": "ne", "nigeria": "ng",
    "north korea": "kp", "norway": "no", "oman": "om",
    "pakistan": "pk", "palestine": "ps", "panama": "pa",
    "paraguay": "py", "peru": "pe", "philippines": "ph", "poland": "pl",
    "portugal": "pt", "qatar": "qa", "romania": "ro", "russia": "ru",
    "rwanda": "rw", "saudi arabia": "sa", "senegal": "sn", "serbia": "rs",
    "sierra leone": "sl", "somalia": "so", "south africa": "za",
    "south korea": "kr", "south sudan": "ss", "spain": "es",
    "sri lanka": "lk", "sudan": "sd", "sweden": "se",
    "switzerland": "ch", "syria": "sy", "taiwan": "tw", "tajikistan": "tj",
    "tanzania": "tz", "thailand": "th", "tunisia": "tn",
    "turkey": "tr", "turkmenistan": "tm", "uganda": "ug",
    "ukraine": "ua", "united arab emirates": "ae",
    "uk": "gb", "united kingdom": "gb",
    "usa": "us", "united states": "us",
    "uruguay": "uy", "uzbekistan": "uz", "venezuela": "ve",
    "vietnam": "vn", "yemen": "ye", "zambia": "zm", "zimbabwe": "zw",
    # Informal names
    "u.s.": "us", "u.k.": "gb", "uae": "ae",
    "gaza": "ps", "west bank": "ps",
    "crimea": "ua", "donbas": "ua", "donbass": "ua",
    "hong kong": "cn", "tibet": "cn", "xinjiang": "cn",
    "kurdistan": "iq", "kosovo": "rs",
}

# Keywords for severity detection
_SEVERITY_KEYWORDS = [
    ("war crime", SeverityLevel.critical),
    ("genocide", SeverityLevel.critical),
    ("chemical weapon", SeverityLevel.critical),
    ("nuclear", SeverityLevel.critical),
    ("mass grave", SeverityLevel.critical),
    ("airstrike", SeverityLevel.high),
    ("missile", SeverityLevel.high),
    ("attack", SeverityLevel.high),
    ("killed", SeverityLevel.high),
    ("explosion", SeverityLevel.high),
    ("military", SeverityLevel.medium),
    ("conflict", SeverityLevel.medium),
    ("weapons", SeverityLevel.medium),
    ("sanctions", SeverityLevel.medium),
    ("disinformation", SeverityLevel.low),
    ("analysis", SeverityLevel.info),
    ("report", SeverityLevel.info),
]


def _geocode_title(title: str) -> tuple[float, float] | None:
    """Find country coordinates by matching country names in the title."""
    lower = title.lower()
    for name in sorted(_COUNTRY_NAMES, key=len, reverse=True):
        if name in lower:
            cc = _COUNTRY_NAMES[name]
            coords = COUNTRY_COORDS.get(cc)
            if coords:
                return coords
    return None


def _title_severity(title: str) -> SeverityLevel:
    lower = title.lower()
    for keyword, severity in _SEVERITY_KEYWORDS:
        if keyword in lower:
            return severity
    return SeverityLevel.info


class OSINTRSSWorker(FeedWorker):
    """Aggregates multiple OSINT and investigative journalism RSS feeds.
    Geocodes articles by matching country names in titles using COUNTRY_COORDS.
    Articles that cannot be geocoded use the feed's default coordinates."""

    source_id = "osint_rss"
    display_name = "OSINT RSS Aggregator"
    category = FeedCategory.social
    refresh_interval = 600  # 10 minutes

    async def fetch(self) -> list[GeoEvent]:
        events: list[GeoEvent] = []

        async with httpx.AsyncClient(
            timeout=20, follow_redirects=True,
            headers={"User-Agent": "Meridian/1.0 (Situational Awareness Platform)"},
        ) as client:
            for feed_name, url, default_lat, default_lng in _OSINT_FEEDS:
                try:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    root = ET.fromstring(resp.text)
                except Exception:
                    continue

                # Handle both RSS and Atom feeds
                channel = root.find("channel") or root
                items = channel.findall("item")
                if not items:
                    # Try Atom format
                    atom_ns = "{http://www.w3.org/2005/Atom}"
                    items = root.findall(f"{atom_ns}entry")

                for item in items[:15]:
                    try:
                        # RSS
                        title = (item.findtext("title") or "").strip()
                        link = item.findtext("link") or ""
                        desc = (item.findtext("description") or "").strip()
                        pub_date = item.findtext("pubDate") or ""

                        # Atom fallback
                        if not title:
                            atom_ns = "{http://www.w3.org/2005/Atom}"
                            title = (item.findtext(f"{atom_ns}title") or "").strip()
                            link_el = item.find(f"{atom_ns}link")
                            if link_el is not None:
                                link = link_el.get("href", "")
                            desc = (
                                item.findtext(f"{atom_ns}summary") or ""
                            ).strip()
                            pub_date = item.findtext(f"{atom_ns}updated") or ""

                        if not title:
                            continue

                        # Parse event time
                        try:
                            event_time = parsedate_to_datetime(pub_date).astimezone(
                                timezone.utc
                            )
                        except Exception:
                            try:
                                event_time = datetime.fromisoformat(
                                    pub_date.replace("Z", "+00:00")
                                )
                            except Exception:
                                event_time = datetime.now(timezone.utc)

                        # Geocode from title; fall back to feed default coords
                        coords = _geocode_title(title)
                        if coords:
                            lat, lng = coords
                        else:
                            lat, lng = default_lat, default_lng

                        item_hash = hashlib.md5(
                            f"{feed_name}_{title}".encode()
                        ).hexdigest()[:12]
                        severity = _title_severity(title)

                        clean_desc = (
                            desc.replace("<![CDATA[", "")
                            .replace("]]>", "")
                            .strip()[:400]
                        )

                        events.append(
                            GeoEvent(
                                id=f"osint_{item_hash}",
                                source_id=self.source_id,
                                category=self.category,
                                subcategory="osint",
                                title=f"[{feed_name}] {title[:180]}",
                                body=clean_desc or None,
                                severity=severity,
                                lat=lat,
                                lng=lng,
                                event_time=event_time,
                                url=link or None,
                                metadata={
                                    "feed": feed_name,
                                    "geocoded": coords is not None,
                                },
                            )
                        )
                    except Exception:
                        continue

        return events
