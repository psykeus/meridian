"""LiteLLM function-calling tools that query live Meridian feed data via the API."""
import httpx
from typing import Any

API_BASE = "http://api:8000/api/v1"


async def _get(path: str, params: dict | None = None) -> Any:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{API_BASE}{path}", params=params or {})
        resp.raise_for_status()
        return resp.json()


TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_recent_events",
            "description": "Retrieve recent geo-events from all live feeds, optionally filtered by category, severity, or geographic bounds.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["geopolitical", "environment", "military", "humanitarian", "aviation", "maritime", "cyber", "space", "finance", "health"],
                        "description": "Filter events by category",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["info", "low", "medium", "high", "critical"],
                        "description": "Minimum severity level",
                    },
                    "hours_back": {
                        "type": "integer",
                        "description": "Number of hours to look back (default 24)",
                        "default": 24,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (default 20)",
                        "default": 20,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_events_near",
            "description": "Find geo-events within a radius of a specific geographic coordinate.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lat": {"type": "number", "description": "Latitude"},
                    "lng": {"type": "number", "description": "Longitude"},
                    "radius_km": {"type": "number", "description": "Search radius in km (default 500)", "default": 500},
                    "hours_back": {"type": "integer", "description": "Hours to look back", "default": 48},
                },
                "required": ["lat", "lng"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_feed_health",
            "description": "Check the health status of all data feed workers (last fetch time, success/failure).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "count_events_by_category",
            "description": "Get event counts grouped by category for a specified time window.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_back": {"type": "integer", "description": "Hours to look back", "default": 24},
                },
            },
        },
    },
]


async def execute_tool(name: str, args: dict) -> str:
    try:
        if name == "get_recent_events":
            params = {k: v for k, v in args.items() if v is not None}
            data = await _get("/events", params)
            events = data.get("items", data) if isinstance(data, dict) else data
            if not events:
                return "No events found matching the criteria."
            lines = [f"- [{e['severity'].upper()}] {e['title']} ({e['source_id']})" for e in events[:20]]
            return f"Found {len(events)} events:\n" + "\n".join(lines)

        if name == "get_events_near":
            data = await _get("/events/near", args)
            events = data if isinstance(data, list) else data.get("items", [])
            if not events:
                return f"No events within {args.get('radius_km', 500)}km of ({args['lat']}, {args['lng']})."
            lines = [f"- [{e['severity'].upper()}] {e['title']}" for e in events[:20]]
            return f"Found {len(events)} events nearby:\n" + "\n".join(lines)

        if name == "get_feed_health":
            data = await _get("/feeds/health")
            healthy = sum(1 for f in data.values() if f.get("status") == "healthy")
            total = len(data)
            return f"{healthy}/{total} feeds healthy. " + "; ".join(
                f"{k}: {v.get('status')}" for k, v in list(data.items())[:10]
            )

        if name == "count_events_by_category":
            hours = args.get("hours_back", 24)
            data = await _get("/events", {"hours_back": hours, "limit": 1000})
            events = data.get("items", data) if isinstance(data, dict) else data
            counts: dict[str, int] = {}
            for e in events:
                cat = e.get("category", "unknown")
                counts[cat] = counts.get(cat, 0) + 1
            sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
            return "Event counts by category:\n" + "\n".join(f"- {cat}: {n}" for cat, n in sorted_counts)

    except Exception as e:
        return f"Tool error: {e}"

    return "Unknown tool"
