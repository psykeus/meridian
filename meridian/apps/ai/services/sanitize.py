"""Shared sanitization utilities for AI service inputs and outputs."""
import re

# Patterns commonly used in prompt injection attempts
_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(all\s+)?previous\s+instructions"
    r"|system\s*:"
    r"|ADMIN\s*:"
    r"|<\|im_start\|>"
    r"|<\|im_end\|>"
    r"|<\|system\|>"
    r"|```\s*system"
    r"|you\s+are\s+now\s+in\s+developer\s+mode"
    r"|override\s+all\s+safety)",
    re.IGNORECASE,
)

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_HTML_TAGS = re.compile(r"<[^>]+>")


def sanitize_event_text(text: str, max_len: int = 200) -> str:
    """Sanitize external event text before injecting into LLM prompts.

    Strips common prompt-injection patterns and truncates to prevent
    context stuffing. This is a defense-in-depth measure — the system
    prompt boundary is the primary defense.
    """
    if not text:
        return ""
    text = _CONTROL_CHARS.sub("", text)
    text = _HTML_TAGS.sub("", text)
    return text[:max_len]


def sanitize_user_input(text: str, max_len: int = 4000) -> str:
    """Sanitize user-provided message content before passing to LLM."""
    if not text:
        return ""
    text = _CONTROL_CHARS.sub("", text)
    text = _HTML_TAGS.sub("", text)
    return text[:max_len]


def sanitize_tool_result(text: str, max_len: int = 5000) -> str:
    """Sanitize tool call results before appending to LLM context."""
    if not text:
        return ""
    text = _CONTROL_CHARS.sub("", text)
    text = _HTML_TAGS.sub("", text)
    return text[:max_len]


def validate_system_prompt(text: str, max_len: int = 2000) -> str:
    """Validate and sanitize a user-provided system prompt override.

    Raises ValueError if the prompt exceeds length limits or contains
    suspicious injection patterns.
    """
    if not text:
        return ""
    if len(text) > max_len:
        raise ValueError(f"System prompt exceeds maximum length of {max_len} characters")
    text = _CONTROL_CHARS.sub("", text)
    if _INJECTION_PATTERNS.search(text):
        raise ValueError("System prompt contains disallowed patterns")
    return text
