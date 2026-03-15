"""Prompt configuration — user-customizable AI system prompts."""
import re
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_MAX_PROMPT_LENGTH = 2000

from core.database import get_db
from models.prompt_config import PromptConfig
from models.user import User
from routers.auth import get_current_user

# Default prompt metadata — mirrors apps/ai/services/prompt_defaults.py
# Only label/description/temperature are needed here (the actual system_prompt
# text is served from this dict when the user has no override).
DEFAULT_PROMPTS: dict[str, dict] = {
    "chat": {
        "label": "AI Analyst Chat",
        "description": "System prompt for the interactive AI Analyst chat panel",
        "system_prompt": (
            "You are Meridian AI Analyst \u2014 an expert global intelligence analyst with access to live data feeds "
            "covering geopolitics, security, environment, aviation, maritime, cyber threats, and financial markets.\n\n"
            "You have access to real-time tools to query live event data. Always use them when asked about current events, threats, or situations.\n\n"
            "Guidelines:\n"
            "- Be concise and intelligence-analyst precise. Lead with key assessments.\n"
            "- Always cite source feeds when referencing data.\n"
            "- For geopolitical events, provide context (actors, significance, trajectory).\n"
            "- For threat events, assess severity and recommend watch items.\n"
            "- Timestamps are always UTC. Current data reflects the last 24-48 hours unless otherwise queried.\n"
            "- Never invent data. If tools return no results, say so clearly."
        ),
        "temperature": 0.2,
    },
    "brief_category": {
        "label": "Daily Brief (Category)",
        "description": "Per-category summary prompt used in the daily intelligence brief pipeline",
        "system_prompt": "You are a concise intelligence analyst. Summarize in 2-3 sentences.",
        "temperature": 0.2,
    },
    "brief_executive": {
        "label": "Daily Brief (Executive)",
        "description": "Executive summary synthesis prompt for the daily brief",
        "system_prompt": (
            "You are a senior intelligence analyst writing a daily brief for senior decision-makers. "
            "Be crisp, authoritative, and lead with the most critical developments."
        ),
        "temperature": 0.3,
    },
    "brief_personalized": {
        "label": "Personalized Brief",
        "description": "System prompt for personalized intelligence briefs based on user interests",
        "system_prompt": (
            "You are Meridian AI Analyst \u2014 an expert global intelligence analyst. "
            "Generate concise, personalized intelligence briefs tailored to the analyst's areas of interest."
        ),
        "temperature": 0.2,
    },
    "sitrep": {
        "label": "Situation Report",
        "description": "System prompt for structured situation reports on specific topics/regions",
        "system_prompt": "You are a senior intelligence analyst. Write formal, precise situation reports.",
        "temperature": 0.2,
    },
    "planroom_brief": {
        "label": "Plan Room Brief",
        "description": "System prompt for generating AI briefing summaries within Plan Rooms",
        "system_prompt": (
            "You are an intelligence analyst. Generate concise, actionable briefing summaries "
            "for Plan Room collaboration sessions."
        ),
        "temperature": 0.2,
    },
    "escalation": {
        "label": "Escalation Prediction",
        "description": "System prompt for predictive threat escalation analysis",
        "system_prompt": (
            "You are a conflict analyst specializing in escalation prediction. "
            "Assess threat trajectories and provide structured escalation predictions."
        ),
        "temperature": 0.2,
    },
    "translation": {
        "label": "Translation",
        "description": "System prompt for OSINT translation tasks",
        "system_prompt": (
            "You are a multilingual OSINT analyst. Translate text accurately, "
            "preserving intelligence-relevant terminology and context."
        ),
        "temperature": 0.2,
    },
    "anomaly_analysis": {
        "label": "AI Insight Analysis",
        "description": "System prompt for analyzing anomaly detections and their source events",
        "system_prompt": (
            "You are Meridian AI Analyst \u2014 an expert global intelligence analyst specializing in anomaly detection "
            "and pattern analysis across geopolitical, security, environmental, and financial domains.\n\n"
            "When analyzing an anomaly insight:\n"
            "- Explain why this pattern is significant and what it may indicate.\n"
            "- Cross-reference the source events to identify potential connections or causation.\n"
            "- Assess the reliability and confidence of the detection.\n"
            "- Recommend specific monitoring actions or follow-up intelligence requirements.\n"
            "- Be concise but thorough \u2014 3-5 sentences maximum."
        ),
        "temperature": 0.3,
    },
}

VALID_KEYS = set(DEFAULT_PROMPTS.keys())

router = APIRouter(prefix="/prompt-configs", tags=["prompt-configs"])
CurrentUser = Annotated[User, Depends(get_current_user)]


class PromptConfigResponse(BaseModel):
    key: str
    label: str
    description: str
    system_prompt: str
    temperature: float
    model_override: str | None = None
    is_default: bool = True


class PromptConfigUpdate(BaseModel):
    system_prompt: str | None = None
    model_override: str | None = Field(None, max_length=100)
    temperature: float | None = Field(None, ge=0.0, le=2.0)


@router.get("", response_model=list[PromptConfigResponse])
async def list_prompt_configs(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return all 8 prompt areas merged with user overrides."""
    result = await db.execute(
        select(PromptConfig).where(PromptConfig.user_id == current_user.id)
    )
    overrides = {row.prompt_key: row for row in result.scalars().all()}

    configs = []
    for key, defaults in DEFAULT_PROMPTS.items():
        override = overrides.get(key)
        configs.append(PromptConfigResponse(
            key=key,
            label=defaults["label"],
            description=defaults["description"],
            system_prompt=override.system_prompt if override else defaults["system_prompt"],
            temperature=override.temperature if override and override.temperature is not None else defaults["temperature"],
            model_override=override.model_override if override else None,
            is_default=override is None,
        ))
    return configs


@router.put("/{key}", response_model=PromptConfigResponse)
async def upsert_prompt_config(
    key: str,
    body: PromptConfigUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Create or update a custom prompt configuration."""
    if key not in VALID_KEYS:
        raise HTTPException(400, f"Invalid prompt key: {key}")

    # Validate and sanitize system prompt
    if body.system_prompt is not None:
        body.system_prompt = _CONTROL_CHARS.sub("", body.system_prompt)
        if len(body.system_prompt) > _MAX_PROMPT_LENGTH:
            raise HTTPException(400, f"System prompt exceeds maximum length of {_MAX_PROMPT_LENGTH} characters")

    defaults = DEFAULT_PROMPTS[key]

    result = await db.execute(
        select(PromptConfig).where(
            PromptConfig.user_id == current_user.id,
            PromptConfig.prompt_key == key,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        if body.system_prompt is not None:
            existing.system_prompt = body.system_prompt
        if body.model_override is not None:
            existing.model_override = body.model_override
        if body.temperature is not None:
            existing.temperature = body.temperature
        existing.updated_at = datetime.now(timezone.utc)
    else:
        existing = PromptConfig(
            user_id=current_user.id,
            prompt_key=key,
            system_prompt=body.system_prompt or defaults["system_prompt"],
            model_override=body.model_override,
            temperature=body.temperature,
        )
        db.add(existing)

    await db.commit()
    await db.refresh(existing)

    return PromptConfigResponse(
        key=key,
        label=defaults["label"],
        description=defaults["description"],
        system_prompt=existing.system_prompt,
        temperature=existing.temperature if existing.temperature is not None else defaults["temperature"],
        model_override=existing.model_override,
        is_default=False,
    )


@router.delete("/{key}", status_code=204)
async def reset_prompt_config(
    key: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete user override — resets to default."""
    if key not in VALID_KEYS:
        raise HTTPException(400, f"Invalid prompt key: {key}")

    await db.execute(
        delete(PromptConfig).where(
            PromptConfig.user_id == current_user.id,
            PromptConfig.prompt_key == key,
        )
    )
    await db.commit()
