"""Anomaly detection engine — 6 detection types per §8.5 of the platform spec."""
import logging
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import numpy as np

logger = logging.getLogger(__name__)
API_BASE = "http://api:8000/api/v1"

# ---------------------------------------------------------------------------
# Known nuclear facility coordinates (lat, lng, name)
# ---------------------------------------------------------------------------
NUCLEAR_FACILITIES: list[tuple[float, float, str]] = [
    (33.2573, -89.5151, "Grand Gulf, MS"),
    (47.9706, -122.1166, "Columbia Generating, WA"),
    (30.8792, -83.6827, "Hatch, GA"),
    (48.5329, 7.7686, "Fessenheim, France"),
    (50.5023, 4.7592, "Tihange, Belgium"),
    (37.4225, 141.0328, "Fukushima Daiichi, Japan"),
    (35.3330, 136.0167, "Mihama, Japan"),
    (55.9330, 37.7667, "Balakovo, Russia"),
    (46.8418, 31.9905, "South Ukraine NPP"),
    (47.3389, 35.0954, "Zaporizhzhia, Ukraine"),
    (31.1472, 35.2040, "Dimona, Israel"),
    (29.6083, 74.8417, "Rajasthan Atomic, India"),
    (40.5350, 116.1000, "Qinshan, China"),
    (35.8400, -82.5600, "McGuire, NC"),
    (28.5326, -80.5927, "Turkey Point, FL"),
]

HAVERSINE_KM = 6371.0


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return HAVERSINE_KM * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Shared fetch helper
# ---------------------------------------------------------------------------
async def _fetch_events(hours: int = 720, limit: int = 5000, category: str | None = None) -> list[dict]:
    params: dict[str, Any] = {"hours_back": hours, "limit": limit}
    if category:
        params["category"] = category
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        try:
            resp = await client.get(f"{API_BASE}/events", params=params)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return data.get("items", data) if isinstance(data, dict) else data
        except Exception:
            return []


def _parse_time(event: dict) -> datetime | None:
    try:
        return datetime.fromisoformat(event["event_time"].replace("Z", "+00:00"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Type 1: Statistical volume spike per category (Z-score vs 30-day baseline)
# ---------------------------------------------------------------------------
def _bucket_events_by_hour(events: list[dict]) -> dict[str, dict[int, int]]:
    now = datetime.now(timezone.utc)
    buckets: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for e in events:
        t = _parse_time(e)
        if t is None:
            continue
        hour_offset = int((now - t).total_seconds() // 3600)
        cat = e.get("category", "unknown")
        buckets[cat][hour_offset] += 1
    return buckets


def _detect_volume_spikes(buckets: dict[str, dict[int, int]], events: list[dict], z_threshold: float = 2.5) -> list[dict]:
    now = datetime.now(timezone.utc)
    anomalies = []
    for category, hour_counts in buckets.items():
        baseline_counts = [hour_counts.get(h, 0) for h in range(2, 720)]
        if len(baseline_counts) < 24:
            continue
        arr = np.array(baseline_counts, dtype=float)
        mean = float(np.mean(arr))
        std = float(np.std(arr))
        if std < 0.1:
            continue
        recent_count = hour_counts.get(0, 0) + hour_counts.get(1, 0)
        z_score = (recent_count - mean) / std
        if abs(z_score) >= z_threshold:
            # Collect event IDs from the 2h window for this category
            event_ids = [
                e.get("id") for e in events
                if e.get("category") == category and e.get("id")
                and (t := _parse_time(e)) is not None
                and (now - t).total_seconds() <= 7200
            ][:20]
            anomalies.append({
                "type": "volume_spike",
                "category": category,
                "recent_count": recent_count,
                "baseline_mean": round(mean, 2),
                "baseline_std": round(std, 2),
                "z_score": round(z_score, 2),
                "direction": "spike" if z_score > 0 else "lull",
                "severity": "critical" if abs(z_score) >= 4.0 else "high" if abs(z_score) >= 3.0 else "medium",
                "title": f"{category.title()} Volume {'Spike' if z_score > 0 else 'Drop'}",
                "description": (
                    f"{category.title()} events {'spiked' if z_score > 0 else 'dropped'} "
                    f"to {recent_count} in last 2h (30-day avg: {mean:.1f}, z={z_score:.1f})"
                ),
                "event_ids": event_ids,
                "detected_at": now.isoformat(),
            })
    return sorted(anomalies, key=lambda x: abs(x["z_score"]), reverse=True)


# ---------------------------------------------------------------------------
# Type 2: Vessel clustering anomaly (dense concentration in a 1° grid cell)
# ---------------------------------------------------------------------------
def _detect_vessel_clustering(events: list[dict], min_vessels: int = 8) -> list[dict]:
    maritime = [
        e for e in events
        if e.get("category") == "maritime" and e.get("lat") is not None and e.get("lng") is not None
    ]
    grid: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for e in maritime:
        cell = (int(e["lat"]), int(e["lng"]))
        grid[cell].append(e)

    now = datetime.now(timezone.utc)
    anomalies = []
    for (lat_cell, lng_cell), cell_events in grid.items():
        if len(cell_events) >= min_vessels:
            center_lat = lat_cell + 0.5
            center_lng = lng_cell + 0.5
            event_ids = [e.get("id") for e in cell_events if e.get("id")][:20]
            anomalies.append({
                "type": "vessel_clustering",
                "category": "maritime",
                "lat": center_lat,
                "lng": center_lng,
                "vessel_count": len(cell_events),
                "severity": "high" if len(cell_events) >= 15 else "medium",
                "title": f"Vessel Cluster ({len(cell_events)} ships)",
                "description": (
                    f"Unusual vessel concentration: {len(cell_events)} vessels "
                    f"clustered near {center_lat:.1f}°, {center_lng:.1f}°"
                ),
                "event_ids": event_ids,
                "detected_at": now.isoformat(),
            })
    return sorted(anomalies, key=lambda x: x["vessel_count"], reverse=True)[:5]


# ---------------------------------------------------------------------------
# Type 3: Earthquake near nuclear facility (M4.5+, within 250 km)
# ---------------------------------------------------------------------------
def _detect_quake_near_nuclear(events: list[dict], radius_km: float = 250.0, min_magnitude: float = 4.5) -> list[dict]:
    quakes = [
        e for e in events
        if e.get("category") == "environment"
        and "earthquake" in (e.get("title") or "").lower()
        and e.get("lat") is not None
        and e.get("lng") is not None
    ]
    now = datetime.now(timezone.utc)
    anomalies = []
    for q in quakes:
        for fac_lat, fac_lng, fac_name in NUCLEAR_FACILITIES:
            dist = _haversine(q["lat"], q["lng"], fac_lat, fac_lng)
            if dist <= radius_km:
                mag_str = ""
                meta = q.get("metadata") or {}
                if "magnitude" in meta:
                    mag_str = f" (M{meta['magnitude']})"
                anomalies.append({
                    "type": "quake_near_nuclear",
                    "category": "environment",
                    "event_id": q.get("id"),
                    "event_ids": [q.get("id")] if q.get("id") else [],
                    "lat": q["lat"],
                    "lng": q["lng"],
                    "facility": fac_name,
                    "distance_km": round(dist, 1),
                    "severity": "critical" if dist < 50 else "high" if dist < 150 else "medium",
                    "title": f"Earthquake Near {fac_name}",
                    "description": (
                        f"Earthquake{mag_str} detected {dist:.0f} km from {fac_name}. "
                        f"Seismic monitoring recommended."
                    ),
                    "detected_at": now.isoformat(),
                })
    return sorted(anomalies, key=lambda x: x["distance_km"])[:5]


# ---------------------------------------------------------------------------
# Type 4: OSINT post cluster (3+ sources, same region, within 30 min)
# ---------------------------------------------------------------------------
def _detect_osint_cluster(events: list[dict], time_window_min: int = 30, min_sources: int = 3) -> list[dict]:
    now = datetime.now(timezone.utc)
    recent = [
        e for e in events
        if e.get("lat") is not None and e.get("lng") is not None
        and (t := _parse_time(e)) is not None
        and (now - t).total_seconds() <= time_window_min * 60
    ]

    grid: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for e in recent:
        cell = (round(e["lat"] / 2) * 2, round(e["lng"] / 2) * 2)
        grid[cell].append(e)

    now = datetime.now(timezone.utc)
    anomalies = []
    for (lat_cell, lng_cell), cell_events in grid.items():
        sources = {e.get("source_id") for e in cell_events}
        if len(sources) >= min_sources:
            event_ids = [e.get("id") for e in cell_events if e.get("id")][:20]
            anomalies.append({
                "type": "osint_cluster",
                "category": "geopolitical",
                "lat": float(lat_cell),
                "lng": float(lng_cell),
                "event_count": len(cell_events),
                "source_count": len(sources),
                "sources": list(sources)[:6],
                "severity": "high" if len(sources) >= 5 else "medium",
                "title": f"Multi-Source Cluster ({len(sources)} sources)",
                "description": (
                    f"{len(sources)} independent sources reporting activity "
                    f"near {lat_cell}°, {lng_cell}° within the last 30 minutes."
                ),
                "event_ids": event_ids,
                "detected_at": now.isoformat(),
            })
    return sorted(anomalies, key=lambda x: x["source_count"], reverse=True)[:5]


# ---------------------------------------------------------------------------
# Type 5: Commodity + conflict temporal correlation (±6h window)
# ---------------------------------------------------------------------------
def _detect_commodity_conflict_correlation(events: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc)
    window_h = 6

    commodity_events = [
        e for e in events
        if e.get("category") in ("finance", "energy") or e.get("source_id") == "alpha_vantage"
    ]
    conflict_events = [
        e for e in events
        if e.get("category") in ("military", "geopolitical")
        and e.get("severity") in ("critical", "high")
    ]

    if not commodity_events or not conflict_events:
        return []

    anomalies = []
    for c_event in commodity_events[:20]:
        c_time = _parse_time(c_event)
        if c_time is None:
            continue
        correlated = [
            m for m in conflict_events
            if (t := _parse_time(m)) and abs((c_time - t).total_seconds()) <= window_h * 3600
        ]
        if len(correlated) >= 3:
            event_ids = [c_event.get("id")] if c_event.get("id") else []
            event_ids += [e.get("id") for e in correlated if e.get("id")][:19]
            anomalies.append({
                "type": "commodity_conflict_correlation",
                "category": "finance",
                "event_count": len(correlated) + 1,
                "severity": "high",
                "title": "Commodity-Conflict Correlation",
                "description": (
                    f"Commodity market event ('{c_event.get('title', '')[:60]}') "
                    f"correlates with {len(correlated)} high-severity conflict events within ±6h. "
                    f"Possible market impact from escalation."
                ),
                "event_ids": event_ids,
                "detected_at": now.isoformat(),
            })
    return anomalies[:3]


# ---------------------------------------------------------------------------
# Type 6: BGP hijack + concurrent advisory (RIPE + CISA/ICS)
# ---------------------------------------------------------------------------
def _detect_bgp_advisory_concurrent(events: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc)
    window_h = 2

    cyber_events = [
        e for e in events
        if e.get("category") == "cyber" and _parse_time(e) is not None
    ]
    bgp_events = [
        e for e in cyber_events
        if any(kw in (e.get("title") or "").lower() for kw in ["bgp", "hijack", "route leak", "ripe"])
    ]
    advisory_events = [
        e for e in cyber_events
        if any(kw in (e.get("source_id") or "").lower() for kw in ["cisa", "ics"])
        or any(kw in (e.get("title") or "").lower() for kw in ["advisory", "vulnerability", "exploit"])
    ]

    if not bgp_events or not advisory_events:
        return []

    anomalies = []
    for bgp in bgp_events[:5]:
        bgp_time = _parse_time(bgp)
        concurrent = [
            a for a in advisory_events
            if (t := _parse_time(a)) and abs((bgp_time - t).total_seconds()) <= window_h * 3600  # type: ignore[operator]
        ]
        if concurrent:
            event_ids = [bgp.get("id")] if bgp.get("id") else []
            event_ids += [e.get("id") for e in concurrent if e.get("id")][:19]
            anomalies.append({
                "type": "bgp_advisory_concurrent",
                "category": "cyber",
                "event_count": 1 + len(concurrent),
                "severity": "critical",
                "title": "BGP + Advisory Concurrent",
                "description": (
                    f"BGP routing anomaly ('{bgp.get('title', '')[:60]}') detected concurrently "
                    f"with {len(concurrent)} cyber advisory/KEV events. "
                    f"Potential coordinated infrastructure attack."
                ),
                "event_ids": event_ids,
                "detected_at": now.isoformat(),
            })
    return anomalies[:3]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
async def run_anomaly_detection() -> list[dict]:
    """Run all 6 anomaly detection types and return merged, prioritised results."""
    events = await _fetch_events(hours=720, limit=5000)
    if not events:
        return []

    all_anomalies: list[dict] = []

    # Type 1: Volume spikes
    buckets = _bucket_events_by_hour(events)
    all_anomalies.extend(_detect_volume_spikes(buckets, events))

    # Recent events (last 24h) for the remaining detectors
    now = datetime.now(timezone.utc)
    recent_24h = [e for e in events if (t := _parse_time(e)) and (now - t).total_seconds() <= 86400]

    # Type 2: Vessel clustering
    all_anomalies.extend(_detect_vessel_clustering(recent_24h))

    # Type 3: Earthquake near nuclear facility
    all_anomalies.extend(_detect_quake_near_nuclear(recent_24h))

    # Type 4: OSINT post cluster (last 30 min)
    all_anomalies.extend(_detect_osint_cluster(events))

    # Type 5: Commodity + conflict correlation
    all_anomalies.extend(_detect_commodity_conflict_correlation(recent_24h))

    # Type 6: BGP hijack + advisory
    all_anomalies.extend(_detect_bgp_advisory_concurrent(recent_24h))

    # Sort: critical first, then by type for grouping
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_anomalies.sort(key=lambda x: severity_order.get(x.get("severity", "low"), 3))

    return all_anomalies
