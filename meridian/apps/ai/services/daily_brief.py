"""Daily Intelligence Brief generator — multi-pass LLM pipeline."""
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
import litellm

from services.sanitize import sanitize_event_text as _sanitize_event_text

logger = logging.getLogger(__name__)

API_BASE = "http://api:8000/api/v1"


async def _fetch_events(category: str | None = None, hours: int = 24, limit: int = 100) -> list[dict]:
    params: dict[str, Any] = {"hours_back": hours, "limit": limit}
    if category:
        params["category"] = category
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        try:
            resp = await client.get(f"{API_BASE}/events", params=params)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return data.get("items", data) if isinstance(data, dict) else data
        except Exception:
            return []


def _summarize_events(events: list[dict], max_items: int = 20) -> str:
    lines = []
    for e in events[:max_items]:
        title = _sanitize_event_text(e.get("title", ""), 150)
        source = _sanitize_event_text(e.get("source_id", ""), 50)
        sev = _sanitize_event_text(e.get("severity", ""), 10)
        lines.append(f"- [{sev.upper()}] {title} ({source})")
    return "\n".join(lines) if lines else "No events."


async def generate_daily_brief(
    model: str,
    category_prompt: str | None = None,
    executive_prompt: str | None = None,
    category_temp: float | None = None,
    executive_temp: float | None = None,
    api_key: str | None = None,
) -> dict:
    """Generate structured daily intelligence brief — 3-phase pipeline."""
    now_utc = datetime.now(timezone.utc)
    date_str = now_utc.strftime("%A, %d %B %Y %H:%M UTC")

    # Phase 1: Gather raw data by category
    categories = ["geopolitical", "military", "environment", "cyber", "humanitarian", "aviation", "maritime"]
    raw: dict[str, list] = {}
    for cat in categories:
        raw[cat] = await _fetch_events(category=cat, hours=24, limit=30)

    # Phase 2: Per-category summaries
    category_summaries: dict[str, str] = {}
    for cat, events in raw.items():
        if not events:
            category_summaries[cat] = "No significant events."
            continue
        event_text = _summarize_events(events, 15)
        try:
            kwargs = dict(
                model=model,
                messages=[
                    {"role": "system", "content": category_prompt or "You are a concise intelligence analyst. Summarize in 2-3 sentences."},
                    {"role": "user", "content": f"Summarize these {cat} events:\n{event_text}"},
                ],
                temperature=category_temp if category_temp is not None else 0.2,
            )
            if api_key:
                kwargs["api_key"] = api_key
            resp = await litellm.acompletion(**kwargs)
            content = resp.choices[0].message.content if resp.choices else ""
            category_summaries[cat] = content or ""
        except Exception as e:
            category_summaries[cat] = f"[Summary unavailable: {e}]"

    # Phase 3: Executive summary synthesis
    cat_text = "\n".join(f"**{k.title()}**: {v}" for k, v in category_summaries.items())
    try:
        exec_kwargs = dict(
            model=model,
            messages=[
                {"role": "system", "content": executive_prompt or "You are a senior intelligence analyst writing a daily brief for senior decision-makers. Be crisp, authoritative, and lead with the most critical developments."},
                {"role": "user", "content": f"Date: {date_str}\n\nCategory summaries:\n{cat_text}\n\nWrite a 3-paragraph executive summary followed by a 5-item 'Key Watchpoints' list."},
            ],
            temperature=executive_temp if executive_temp is not None else 0.3,
        )
        if api_key:
            exec_kwargs["api_key"] = api_key
        exec_resp = await litellm.acompletion(**exec_kwargs)
        executive_summary = exec_resp.choices[0].message.content if exec_resp.choices else ""
        executive_summary = executive_summary or ""
    except Exception as e:
        executive_summary = f"[Executive summary unavailable: {e}]"

    return {
        "date": date_str,
        "generated_at": now_utc.isoformat(),
        "executive_summary": executive_summary,
        "category_summaries": category_summaries,
        "event_counts": {cat: len(events) for cat, events in raw.items()},
    }


async def _fetch_filtered_events(
    categories: list[str] | None = None,
    severities: list[str] | None = None,
    source_ids: list[str] | None = None,
    hours_back: int | None = None,
    event_ids: list[str] | None = None,
) -> list[dict]:
    """Fetch events with specific filters for custom sitreps."""
    hours = hours_back or 72
    all_events: list[dict] = []

    if categories:
        # Fetch per-category to combine results
        for cat in categories:
            all_events.extend(await _fetch_events(category=cat, hours=hours, limit=200))
    else:
        all_events = await _fetch_events(hours=hours, limit=500)

    # Apply severity filter
    if severities:
        sev_set = {s.lower() for s in severities}
        all_events = [e for e in all_events if (e.get("severity") or "").lower() in sev_set]

    # Apply source_id filter
    if source_ids:
        src_set = set(source_ids)
        all_events = [e for e in all_events if e.get("source_id") in src_set]

    # Apply explicit event ID filter
    if event_ids:
        id_set = set(event_ids)
        all_events = [e for e in all_events if e.get("id") in id_set]

    return all_events


async def generate_situation_report(
    model: str, topic: str, region: str | None = None,
    system_prompt: str | None = None, temperature: float | None = None,
    api_key: str | None = None,
    categories: list[str] | None = None,
    severities: list[str] | None = None,
    source_ids: list[str] | None = None,
    hours_back: int | None = None,
    event_ids: list[str] | None = None,
) -> dict:
    """3-phase situation report for a specific topic/region.

    When filter params are provided, events are pre-filtered before topic matching,
    producing a report focused on the user's curated event collection."""
    has_filters = any([categories, severities, source_ids, event_ids])

    if has_filters:
        events_all = await _fetch_filtered_events(
            categories=categories, severities=severities,
            source_ids=source_ids, hours_back=hours_back,
            event_ids=event_ids,
        )
    else:
        events_all = await _fetch_events(hours=hours_back or 72, limit=200)

    topic_lower = topic.lower()

    relevant = [
        e for e in events_all
        if topic_lower in (e.get("title") or "").lower()
        or topic_lower in (e.get("body") or "").lower()
        or (region and region.lower() in (e.get("title") or "").lower())
    ]

    # When user explicitly filtered events, use all of them if keyword match is sparse
    if has_filters:
        event_text = _summarize_events(relevant or events_all[:50], 50)
    else:
        event_text = _summarize_events(relevant or events_all[:30], 30)
    now_str = datetime.now(timezone.utc).strftime("%d %B %Y %H:%M UTC")

    prompt = f"""SITUATION REPORT — {topic.upper()}
Date: {now_str}
{f'Region: {region}' if region else ''}

Available event data:
{event_text}

Write a structured situation report with:
1. EXECUTIVE SUMMARY (2-3 sentences)
2. SITUATION OVERVIEW (current status, key actors, timeline)
3. THREAT ASSESSMENT (severity, trajectory, key risk factors)
4. INDICATORS TO WATCH (3-5 specific items)
5. RECOMMENDED ACTIONS (if applicable)
"""
    try:
        sitrep_kwargs = dict(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt or "You are a senior intelligence analyst. Write formal, precise situation reports."},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature if temperature is not None else 0.2,
        )
        if api_key:
            sitrep_kwargs["api_key"] = api_key
        resp = await litellm.acompletion(**sitrep_kwargs)
        report_text = resp.choices[0].message.content if resp.choices else ""
        report_text = report_text or ""
    except Exception as e:
        report_text = f"[Report generation failed: {e}]"

    return {
        "topic": topic,
        "region": region,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "report": report_text,
        "event_count": len(relevant),
    }
