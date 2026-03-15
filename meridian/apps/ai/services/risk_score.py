"""Geopolitical Risk Score — weighted composite per country (0-100)."""
import logging
from collections import defaultdict

import httpx

logger = logging.getLogger(__name__)
API_BASE = "http://api:8000/api/v1"

_SEVERITY_WEIGHTS = {
    "critical": 10.0,
    "high": 5.0,
    "medium": 2.0,
    "low": 0.5,
    "info": 0.1,
}

_CATEGORY_WEIGHTS = {
    "military": 3.0,
    "geopolitical": 2.5,
    "humanitarian": 2.0,
    "cyber": 1.8,
    "environment": 1.2,
    "aviation": 1.0,
    "maritime": 1.0,
    "finance": 0.8,
    "space": 0.3,
    "health": 1.5,
}


async def compute_risk_scores(hours: int = 168) -> list[dict]:
    """Compute risk scores for all countries with recent events."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        try:
            resp = await client.get(f"{API_BASE}/events", params={"hours_back": hours, "limit": 5000})
            if resp.status_code != 200:
                return []
            data = resp.json()
            events = data.get("items", data) if isinstance(data, dict) else data
        except Exception:
            return []

    country_scores: dict[str, float] = defaultdict(float)
    country_counts: dict[str, int] = defaultdict(int)

    for e in events:
        meta = e.get("metadata") or {}
        country = meta.get("country") or meta.get("state") or None
        if not country or len(country) > 50:
            continue

        sev_w = _SEVERITY_WEIGHTS.get(e.get("severity", "info"), 0.1)
        cat_w = _CATEGORY_WEIGHTS.get(e.get("category", "geopolitical"), 1.0)
        country_scores[country] += sev_w * cat_w
        country_counts[country] += 1

    if not country_scores:
        return []

    max_score = max(country_scores.values())

    results = []
    for country, raw_score in country_scores.items():
        normalized = min(100, round((raw_score / max_score) * 100, 1)) if max_score > 0 else 0
        tier = (
            "critical" if normalized >= 80
            else "high" if normalized >= 60
            else "medium" if normalized >= 40
            else "low" if normalized >= 20
            else "minimal"
        )
        results.append({
            "country": country,
            "score": normalized,
            "raw_score": round(raw_score, 2),
            "event_count": country_counts[country],
            "tier": tier,
        })

    return sorted(results, key=lambda x: x["score"], reverse=True)[:50]
