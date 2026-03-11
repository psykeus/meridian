"""Reddit OSINT — monitors r/worldnews and OSINT subreddits for breaking events."""
import hashlib
import logging
from datetime import datetime, timezone

import httpx

from .base import FeedWorker
from models.geo_event import FeedCategory, GeoEvent, SeverityLevel
from ._country_coords import COUNTRY_COORDS

logger = logging.getLogger(__name__)

_USER_AGENT = "Meridian/1.0 (Situational Awareness Platform)"

# Subreddit configs: (subreddit, limit, min_score)
_SUBREDDITS = [
    ("worldnews", 25, 1000),
    ("OSINT",     10,  100),
]

# Country name → ISO alpha-2 code mapping for geocoding from titles
_COUNTRY_NAMES: dict[str, str] = {
    "afghanistan": "af", "albania": "al", "algeria": "dz", "angola": "ao",
    "argentina": "ar", "armenia": "am", "australia": "au", "austria": "at",
    "azerbaijan": "az", "bahamas": "bs", "bahrain": "bh", "bangladesh": "bd",
    "belarus": "by", "belgium": "be", "belize": "bz", "benin": "bj",
    "bhutan": "bt", "bolivia": "bo", "bosnia": "ba", "botswana": "bw",
    "brazil": "br", "brunei": "bn", "bulgaria": "bg", "burkina faso": "bf",
    "burundi": "bi", "cambodia": "kh", "cameroon": "cm", "canada": "ca",
    "chad": "td", "chile": "cl", "china": "cn", "colombia": "co",
    "congo": "cd", "costa rica": "cr", "croatia": "hr", "cuba": "cu",
    "cyprus": "cy", "czech": "cz", "denmark": "dk", "djibouti": "dj",
    "dominican republic": "do", "ecuador": "ec", "egypt": "eg",
    "el salvador": "sv", "eritrea": "er", "estonia": "ee", "ethiopia": "et",
    "fiji": "fj", "finland": "fi", "france": "fr", "gabon": "ga",
    "gambia": "gm", "georgia": "ge", "germany": "de", "ghana": "gh",
    "greece": "gr", "guatemala": "gt", "guinea": "gn", "guyana": "gy",
    "haiti": "ht", "honduras": "hn", "hungary": "hu", "iceland": "is",
    "india": "in", "indonesia": "id", "iran": "ir", "iraq": "iq",
    "ireland": "ie", "israel": "il", "italy": "it", "jamaica": "jm",
    "japan": "jp", "jordan": "jo", "kazakhstan": "kz", "kenya": "ke",
    "kuwait": "kw", "kyrgyzstan": "kg", "laos": "la", "latvia": "lv",
    "lebanon": "lb", "liberia": "lr", "libya": "ly", "lithuania": "lt",
    "luxembourg": "lu", "madagascar": "mg", "malawi": "mw", "malaysia": "my",
    "mali": "ml", "malta": "mt", "mauritania": "mr", "mexico": "mx",
    "moldova": "md", "mongolia": "mn", "montenegro": "me", "morocco": "ma",
    "mozambique": "mz", "myanmar": "mm", "namibia": "na", "nepal": "np",
    "netherlands": "nl", "new zealand": "nz", "nicaragua": "ni",
    "niger": "ne", "nigeria": "ng", "north korea": "kp", "norway": "no",
    "oman": "om", "pakistan": "pk", "palestine": "ps", "panama": "pa",
    "paraguay": "py", "peru": "pe", "philippines": "ph", "poland": "pl",
    "portugal": "pt", "qatar": "qa", "romania": "ro", "russia": "ru",
    "rwanda": "rw", "saudi arabia": "sa", "senegal": "sn", "serbia": "rs",
    "sierra leone": "sl", "somalia": "so", "south africa": "za",
    "south korea": "kr", "south sudan": "ss", "spain": "es",
    "sri lanka": "lk", "sudan": "sd", "suriname": "sr", "sweden": "se",
    "switzerland": "ch", "syria": "sy", "taiwan": "tw", "tajikistan": "tj",
    "tanzania": "tz", "thailand": "th", "togo": "tg", "trinidad": "tt",
    "tunisia": "tn", "turkey": "tr", "turkmenistan": "tm", "uganda": "ug",
    "ukraine": "ua", "united arab emirates": "ae", "uk": "gb",
    "united kingdom": "gb", "usa": "us", "united states": "us",
    "uruguay": "uy", "uzbekistan": "uz", "venezuela": "ve", "vietnam": "vn",
    "yemen": "ye", "zambia": "zm", "zimbabwe": "zw",
    # Common informal / abbreviated names
    "u.s.": "us", "u.s.a.": "us", "u.k.": "gb", "uae": "ae",
    "drc": "cd", "d.r.c.": "cd",
    "gaza": "ps", "west bank": "ps",
    "crimea": "ua", "donbas": "ua", "donbass": "ua",
    "hong kong": "cn", "tibet": "cn", "xinjiang": "cn",
    "kurdistan": "iq", "kosovo": "rs",
    "somaliland": "so", "zanzibar": "tz",
}


def _geocode_title(title: str) -> tuple[float, float] | None:
    """Attempt to find country coordinates by matching country names in the title."""
    lower = title.lower()
    # Try longer names first to avoid partial matches (e.g. "south korea" before "korea")
    for name in sorted(_COUNTRY_NAMES, key=len, reverse=True):
        if name in lower:
            cc = _COUNTRY_NAMES[name]
            coords = COUNTRY_COORDS.get(cc)
            if coords:
                return coords
    return None


def _score_to_severity(score: int, upvote_ratio: float) -> SeverityLevel:
    """Derive severity from Reddit score and upvote ratio."""
    if score >= 50000 and upvote_ratio >= 0.90:
        return SeverityLevel.critical
    if score >= 20000:
        return SeverityLevel.high
    if score >= 5000:
        return SeverityLevel.medium
    return SeverityLevel.low


class RedditOSINTWorker(FeedWorker):
    """Monitors r/worldnews and r/OSINT for high-engagement posts that may
    indicate breaking global events. Geocodes posts by matching country
    names in the title; posts that cannot be geocoded are skipped."""

    source_id = "reddit_osint"
    display_name = "Reddit OSINT Monitor"
    category = FeedCategory.social
    refresh_interval = 600  # 10 minutes

    async def fetch(self) -> list[GeoEvent]:
        events: list[GeoEvent] = []
        headers = {"User-Agent": _USER_AGENT}

        async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as client:
            for subreddit, limit, min_score in _SUBREDDITS:
                try:
                    url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}"
                    resp = await client.get(url)
                    resp.raise_for_status()
                    listing = resp.json()
                except Exception:
                    continue

                children = listing.get("data", {}).get("children", [])
                for child in children:
                    try:
                        post = child.get("data", {})
                        title = (post.get("title") or "").strip()
                        score = post.get("score", 0)
                        upvote_ratio = post.get("upvote_ratio", 0.0)

                        if not title or score < min_score:
                            continue

                        # Attempt geocoding — skip posts we cannot locate
                        coords = _geocode_title(title)
                        if coords is None:
                            continue

                        post_id = post.get("id", "")
                        permalink = post.get("permalink", "")
                        selftext = (post.get("selftext") or "")[:400]
                        created_utc = post.get("created_utc", 0)
                        author = post.get("author", "")
                        num_comments = post.get("num_comments", 0)

                        event_time = (
                            datetime.fromtimestamp(created_utc, tz=timezone.utc)
                            if created_utc
                            else datetime.now(timezone.utc)
                        )
                        severity = _score_to_severity(score, upvote_ratio)

                        # Deduplicate using a hash of subreddit + post id
                        event_id = f"reddit_{subreddit}_{post_id}" if post_id else (
                            f"reddit_{hashlib.md5(title.encode()).hexdigest()[:12]}"
                        )

                        events.append(GeoEvent(
                            id=event_id,
                            source_id=self.source_id,
                            category=self.category,
                            severity=severity,
                            title=f"r/{subreddit}: {title[:180]}",
                            body=selftext or None,
                            lat=coords[0],
                            lng=coords[1],
                            event_time=event_time,
                            url=f"https://www.reddit.com{permalink}" if permalink else None,
                            metadata={
                                "subreddit": subreddit,
                                "score": score,
                                "upvote_ratio": upvote_ratio,
                                "num_comments": num_comments,
                                "author": author,
                                "post_id": post_id,
                            },
                        ))
                    except Exception:
                        continue

        return events
