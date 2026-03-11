"""Stripe billing — subscription management and webhook handler."""
import hashlib
import hmac
import logging
import os
from typing import Annotated

import httpx
import orjson
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.database import get_db
from models.org import Organization
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/billing", tags=["billing"])
CurrentUser = Annotated[User, Depends(get_current_user)]
logger = logging.getLogger(__name__)

settings = get_settings()

STRIPE_API = "https://api.stripe.com/v1"
PRICE_MAP = {
    "analyst":      os.getenv("STRIPE_PRICE_ANALYST", ""),
    "team_starter": os.getenv("STRIPE_PRICE_TEAM_STARTER", ""),
    "team_pro":     os.getenv("STRIPE_PRICE_TEAM_PRO", ""),
}


async def _stripe_post(path: str, data: dict) -> dict:
    key = settings.stripe_secret_key
    if not key:
        raise HTTPException(503, "Stripe not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{STRIPE_API}{path}",
            data=data,
            headers={"Authorization": f"Bearer {key}"},
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, resp.json().get("error", {}).get("message", "Stripe error"))
    return resp.json()


async def _stripe_get(path: str) -> dict:
    key = settings.stripe_secret_key
    if not key:
        raise HTTPException(503, "Stripe not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{STRIPE_API}{path}",
            headers={"Authorization": f"Bearer {key}"},
        )
    return resp.json()


@router.post("/checkout")
async def create_checkout(
    tier: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    price_id = PRICE_MAP.get(tier)
    if not price_id:
        raise HTTPException(400, f"Unknown tier: {tier}")

    session = await _stripe_post("/checkout/sessions", {
        "mode": "subscription",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "customer_email": current_user.email,
        "success_url": f"{os.getenv('APP_URL', 'http://localhost:5173')}/settings?checkout=success",
        "cancel_url": f"{os.getenv('APP_URL', 'http://localhost:5173')}/settings?checkout=cancel",
        "metadata[user_id]": str(current_user.id),
        "metadata[tier]": tier,
    })
    return {"checkout_url": session["url"]}


@router.post("/portal")
async def billing_portal(current_user: CurrentUser, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(Organization).where(Organization.owner_id == current_user.id)
    )
    org = result.scalars().first()
    if not org or not org.stripe_customer_id:
        raise HTTPException(404, "No billing account found")

    session = await _stripe_post("/billing_portal/sessions", {
        "customer": org.stripe_customer_id,
        "return_url": f"{os.getenv('APP_URL', 'http://localhost:5173')}/settings",
    })
    return {"portal_url": session["url"]}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    if webhook_secret:
        try:
            _verify_stripe_signature(payload, sig, webhook_secret)
        except ValueError:
            raise HTTPException(400, "Invalid signature")

    event = orjson.loads(payload)
    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        user_id = int(data.get("metadata", {}).get("user_id", 0))
        tier = data.get("metadata", {}).get("tier", "analyst")
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.tier = tier
            await db.commit()

        org_result = await db.execute(select(Organization).where(Organization.owner_id == user_id))
        org = org_result.scalars().first()
        if org:
            org.stripe_customer_id = customer_id
            org.stripe_subscription_id = subscription_id
            org.subscription_status = "active"
            org.tier = tier
            await db.commit()

        logger.info(f"checkout_completed user={user_id} tier={tier}")

    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        status_val = data.get("status", "canceled")
        sub_id = data.get("id")
        org_result = await db.execute(
            select(Organization).where(Organization.stripe_subscription_id == sub_id)
        )
        org = org_result.scalars().first()
        if org:
            org.subscription_status = status_val
            if status_val == "canceled":
                org.tier = "free"
            await db.commit()
        logger.info(f"subscription_{event_type.split('.')[-1]} sub={sub_id} status={status_val}")

    return {"received": True}


def _verify_stripe_signature(payload: bytes, sig_header: str, secret: str) -> None:
    parts = {p.split("=")[0]: p.split("=")[1] for p in sig_header.split(",") if "=" in p}
    timestamp = parts.get("t", "")
    v1 = parts.get("v1", "")
    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise ValueError("Signature mismatch")
