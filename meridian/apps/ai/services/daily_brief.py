"""Daily Intelligence Brief generator — multi-pass LLM pipeline."""
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
import litellm

logger = logging.getLogger(__name__)

API_BASE = "http://api:8000/api/v1"


async def _fetch_events(category: str | None = None, hours: int = 24, limit: int = 100) -> list[dict]:
    params: dict[str, Any] = {"hours_back": hours, "limit": limit}
    if category:
        params["category"] = category
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.get(f"{API_BASE}/events", params=params)
            data = resp.json()
            return data.get("items", data) if isinstance(data, dict) else data
        except Exception:
            return []


def _summarize_events(events: list[dict], max_items: int = 20) -> str:
    lines = []
    for e in events[:max_items]:
        lines.append(f"- [{e.get('severity', '').upper()}] {e.get('title', '')} ({e.get('source_id', '')})")
    return "\n".join(lines) if lines else "No events."


async def generate_daily_brief(model: str) -> dict:
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
            resp = await litellm.acompletion(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a concise intelligence analyst. Summarize in 2-3 sentences."},
                    {"role": "user", "content": f"Summarize these {cat} events:\n{event_text}"},
                ],
                temperature=0.2,
            )
            category_summaries[cat] = resp.choices[0].message.content or ""
        except Exception as e:
            category_summaries[cat] = f"[Summary unavailable: {e}]"

    # Phase 3: Executive summary synthesis
    cat_text = "\n".join(f"**{k.title()}**: {v}" for k, v in category_summaries.items())
    try:
        exec_resp = await litellm.acompletion(
            model=model,
            messages=[
                {"role": "system", "content": "You are a senior intelligence analyst writing a daily brief for senior decision-makers. Be crisp, authoritative, and lead with the most critical developments."},
                {"role": "user", "content": f"Date: {date_str}\n\nCategory summaries:\n{cat_text}\n\nWrite a 3-paragraph executive summary followed by a 5-item 'Key Watchpoints' list."},
            ],
            temperature=0.3,
        )
        executive_summary = exec_resp.choices[0].message.content or ""
    except Exception as e:
        executive_summary = f"[Executive summary unavailable: {e}]"

    return {
        "date": date_str,
        "generated_at": now_utc.isoformat(),
        "executive_summary": executive_summary,
        "category_summaries": category_summaries,
        "event_counts": {cat: len(events) for cat, events in raw.items()},
    }


async def generate_situation_report(model: str, topic: str, region: str | None = None) -> dict:
    """3-phase situation report for a specific topic/region."""
    events_all = await _fetch_events(hours=72, limit=200)
    topic_lower = topic.lower()

    relevant = [
        e for e in events_all
        if topic_lower in (e.get("title") or "").lower()
        or topic_lower in (e.get("body") or "").lower()
        or (region and region.lower() in (e.get("title") or "").lower())
    ]

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
        resp = await litellm.acompletion(
            model=model,
            messages=[
                {"role": "system", "content": "You are a senior intelligence analyst. Write formal, precise situation reports."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        report_text = resp.choices[0].message.content or ""
    except Exception as e:
        report_text = f"[Report generation failed: {e}]"

    return {
        "topic": topic,
        "region": region,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "report": report_text,
        "event_count": len(relevant),
    }
