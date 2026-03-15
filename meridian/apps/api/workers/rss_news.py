"""Global RSS News Aggregator — 30+ international news feeds with geocoding."""
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

# Lazy-loaded translator support
try:
    from deep_translator import GoogleTranslator
    _HAS_TRANSLATOR = True
except ImportError:
    _HAS_TRANSLATOR = False
    logger.info("deep_translator not installed — non-English headlines will not be translated")

# Reusable translators keyed by source language
_translators: dict = {}


def _get_translator(source_lang: str):
    if source_lang not in _translators:
        from deep_translator import GoogleTranslator
        _translators[source_lang] = GoogleTranslator(source=source_lang, target="en")
    return _translators[source_lang]


def _translate(text: str, lang: str) -> str:
    """Translate text to English. Returns original on failure."""
    if not text or lang == "en" or not _HAS_TRANSLATOR:
        return text
    try:
        result = _get_translator(lang).translate(text)
        return result if result else text
    except Exception:
        return text

# (name, url, default_lat, default_lng, region, language)
_FEEDS = [
    # ── Wire Services ──────────────────────────────────────────────────────
    ("Reuters World", "http://feeds.reuters.com/reuters/worldNews", 0.0, 0.0, "global", "en"),
    ("AP Top News", "https://rsshub.app/apnews/topics/apf-topnews", 0.0, 0.0, "global", "en"),
    # ── Europe ─────────────────────────────────────────────────────────────
    ("BBC World", "http://feeds.bbci.co.uk/news/world/rss.xml", 51.5, -0.1, "europe", "en"),
    ("Sky News", "https://feeds.skynews.com/feeds/rss/world.xml", 51.5, -0.1, "europe", "en"),
    ("France24 (en)", "https://www.france24.com/en/rss", 48.9, 2.3, "europe", "en"),
    ("Le Monde", "https://www.lemonde.fr/international/rss_full.xml", 48.9, 2.3, "europe", "fr"),
    ("Tagesschau", "https://www.tagesschau.de/xml/rss2", 52.5, 13.4, "europe", "de"),
    ("DW World", "https://rss.dw.com/xml/rss-en-world", 52.5, 13.4, "europe", "en"),
    ("EuroNews", "https://www.euronews.com/rss?level=theme&name=news", 46.2, 6.1, "europe", "en"),
    ("The Guardian World", "https://www.theguardian.com/world/rss", 51.5, -0.1, "europe", "en"),
    # ── Russia / CIS ───────────────────────────────────────────────────────
    ("TASS (en)", "https://tass.com/rss/v2.xml", 55.8, 37.6, "russia_cis", "en"),
    # ── Middle East ────────────────────────────────────────────────────────
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", 25.3, 51.5, "middle_east", "en"),
    ("Al Arabiya (en)", "https://english.alarabiya.net/tools/rss", 25.2, 55.3, "middle_east", "en"),
    # ── Asia-Pacific ───────────────────────────────────────────────────────
    ("Xinhua (en)", "http://www.news.cn/english/rss/worldrss.xml", 39.9, 116.4, "asia_pacific", "en"),
    ("CGTN", "https://www.cgtn.com/subscribe/rss/section/world.xml", 39.9, 116.4, "asia_pacific", "en"),
    ("NHK World", "https://www3.nhk.or.jp/rss/news/cat0.xml", 35.7, 139.7, "asia_pacific", "en"),
    ("Yonhap (en)", "https://en.yna.co.kr/RSS/news.xml", 37.6, 127.0, "asia_pacific", "en"),
    ("Times of India", "https://timesofindia.indiatimes.com/rssfeeds/296589292.cms", 28.6, 77.2, "asia_pacific", "en"),
    ("NDTV World", "https://feeds.feedburner.com/ndtvnews-world-news", 28.6, 77.2, "asia_pacific", "en"),
    ("Channel News Asia", "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311", 1.3, 103.8, "asia_pacific", "en"),
    ("Kyodo News", "https://english.kyodonews.net/rss/all.xml", 35.7, 139.7, "asia_pacific", "en"),
    # ── Africa ─────────────────────────────────────────────────────────────
    ("allAfrica", "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf", 0.0, 25.0, "africa", "en"),
    # ── Latin America ──────────────────────────────────────────────────────
    ("Telesur (en)", "https://www.telesurenglish.net/xml/rss.xml", 10.5, -66.9, "latin_america", "en"),
    ("EFE (en)", "https://www.efe.com/efe/english/4/rss", 40.4, -3.7, "latin_america", "en"),
    ("Folha de S.Paulo", "https://feeds.folha.uol.com.br/mundo/rss091.xml", -23.5, -46.6, "latin_america", "pt"),
    # ── North America ──────────────────────────────────────────────────────
    ("ABC News", "https://abcnews.go.com/abcnews/internationalheadlines", 38.9, -77.0, "north_america", "en"),
    ("CBC World", "https://www.cbc.ca/cmlink/rss-world", 45.4, -75.7, "north_america", "en"),
    # ── Oceania ────────────────────────────────────────────────────────────
    ("ABC Australia", "https://www.abc.net.au/news/feed/2942460/rss.xml", -33.9, 151.2, "oceania", "en"),
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

_CRISIS_KEYWORDS = [
    ("war", SeverityLevel.critical),
    ("attack", SeverityLevel.high),
    ("killed", SeverityLevel.high),
    ("explosion", SeverityLevel.high),
    ("missile", SeverityLevel.high),
    ("earthquake", SeverityLevel.high),
    ("tsunami", SeverityLevel.critical),
    ("hurricane", SeverityLevel.high),
    ("sanction", SeverityLevel.medium),
    ("protest", SeverityLevel.medium),
    ("crisis", SeverityLevel.medium),
    ("flood", SeverityLevel.medium),
    ("fire", SeverityLevel.low),
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
    for kw, sev in _CRISIS_KEYWORDS:
        if kw in lower:
            return sev
    return SeverityLevel.info


class RSSNewsWorker(FeedWorker):
    """Global RSS news aggregator — 30+ international sources with geocoding."""

    source_id = "rss_news"
    display_name = "RSS Global News Feeds"
    category = FeedCategory.geopolitical
    refresh_interval = 300  # 5 minutes

    async def fetch(self) -> list[GeoEvent]:
        events: list[GeoEvent] = []
        async with httpx.AsyncClient(
            timeout=20, follow_redirects=True,
            headers={"User-Agent": "Meridian/1.0 (Situational Awareness Platform)"},
        ) as client:
            for feed_name, url, default_lat, default_lng, region, language in _FEEDS:
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
                            desc = (item.findtext(f"{atom_ns}summary") or "").strip()
                            pub_date = item.findtext(f"{atom_ns}updated") or ""

                        if not title:
                            continue

                        # Parse event time
                        try:
                            event_time = parsedate_to_datetime(pub_date).astimezone(timezone.utc)
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

                        item_hash = hashlib.md5(f"{feed_name}{title}".encode()).hexdigest()[:12]
                        clean_desc = desc.replace("<![CDATA[", "").replace("]]>", "").strip()[:300]

                        # Translate non-English titles and descriptions
                        original_title = title
                        if language != "en":
                            title = _translate(title, language)
                            if clean_desc:
                                clean_desc = _translate(clean_desc, language)

                        severity = _title_severity(title)

                        meta: dict = {
                            "source": feed_name,
                            "region": region,
                            "language": language,
                            "geocoded": coords is not None,
                        }
                        if language != "en" and original_title != title:
                            meta["original_title"] = original_title[:200]

                        events.append(GeoEvent(
                            id=f"rss_{item_hash}",
                            source_id=self.source_id,
                            category=self.category,
                            severity=severity,
                            title=title[:200],
                            body=clean_desc or None,
                            lat=lat,
                            lng=lng,
                            event_time=event_time,
                            url=link or None,
                            metadata=meta,
                        ))
                    except Exception:
                        continue

        return events
