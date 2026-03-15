"""AI Analyst Chat — LiteLLM with function-calling against live Meridian feeds."""
import json
import logging
from typing import AsyncGenerator

import litellm
from tools.feed_tools import TOOL_DEFINITIONS, execute_tool
from services.prompt_defaults import DEFAULT_PROMPTS
from services.sanitize import sanitize_user_input, sanitize_tool_result

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = DEFAULT_PROMPTS["chat"]["system_prompt"]

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
    system_prompt: str | None = None,
    temperature: float | None = None,
    api_key: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream an AI Analyst response with automatic tool-use loop."""
    prompt = system_prompt if system_prompt is not None else SYSTEM_PROMPT
    temp = temperature if temperature is not None else 0.2
    # Sanitize user message content
    sanitized_messages = []
    for m in messages:
        content = sanitize_user_input(m.get("content", "")) if m.get("role") == "user" else m.get("content", "")
        sanitized_messages.append({"role": m["role"], "content": content})
    all_messages = [{"role": "system", "content": prompt}] + sanitized_messages
    rounds = 0

    while rounds < max_tool_rounds:
        rounds += 1
        try:
            kwargs = dict(
                model=model,
                messages=all_messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                stream=False,
                temperature=temp,
            )
            if api_key:
                kwargs["api_key"] = api_key
            response = await litellm.acompletion(**kwargs)
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
                result = sanitize_tool_result(await execute_tool(fn_name, fn_args))

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
