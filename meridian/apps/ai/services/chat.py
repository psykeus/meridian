"""AI Analyst Chat — LiteLLM with function-calling against live Meridian feeds."""
import json
import logging
from typing import AsyncGenerator

import litellm
from tools.feed_tools import TOOL_DEFINITIONS, execute_tool

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Meridian AI Analyst — an expert global intelligence analyst with access to live data feeds covering geopolitics, security, environment, aviation, maritime, cyber threats, and financial markets.

You have access to real-time tools to query live event data. Always use them when asked about current events, threats, or situations.

Guidelines:
- Be concise and intelligence-analyst precise. Lead with key assessments.
- Always cite source feeds when referencing data.
- For geopolitical events, provide context (actors, significance, trajectory).
- For threat events, assess severity and recommend watch items.
- Timestamps are always UTC. Current data reflects the last 24-48 hours unless otherwise queried.
- Never invent data. If tools return no results, say so clearly.
"""

EXAMPLE_QUERIES = [
    "What are the most critical events in the last 6 hours?",
    "Give me a threat brief for the Middle East",
    "What earthquake activity has been recorded today?",
    "Summarize active maritime incidents",
    "What cyber vulnerabilities were added to CISA KEV this week?",
    "Are there any active hurricane or tropical storm warnings?",
    "What major conflict events are trending right now?",
    "Give me a financial markets update",
    "What FEMA disaster declarations have been made in the last 30 days?",
    "Summarize today's global threat landscape in 3 bullet points",
]


async def chat_stream(
    messages: list[dict],
    model: str,
    max_tool_rounds: int = 5,
) -> AsyncGenerator[str, None]:
    """Stream an AI Analyst response with automatic tool-use loop."""
    all_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    rounds = 0

    while rounds < max_tool_rounds:
        rounds += 1
        try:
            response = await litellm.acompletion(
                model=model,
                messages=all_messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                stream=False,
                temperature=0.2,
            )
        except Exception as e:
            yield f"[AI Error: {e}]"
            return

        msg = response.choices[0].message

        if msg.tool_calls:
            all_messages.append({"role": "assistant", "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]})

            for tc in msg.tool_calls:
                fn_name = tc.function.name
                try:
                    fn_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    fn_args = {}

                yield f"[tool:{fn_name}]"
                result = await execute_tool(fn_name, fn_args)

                all_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue

        content = msg.content or ""
        yield content
        return

    yield "\n\n[Max tool rounds reached]"
