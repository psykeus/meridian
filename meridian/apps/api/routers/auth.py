import logging
import secrets
from datetime import datetime, timezone
from typing import Annotated

import httpx
import starlette.requests
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.database import get_db
from core.security import (
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    get_totp_uri,
    hash_password,
    verify_password,
    verify_totp,
)
from models.user import TokenData, TokenResponse, User, UserCreate, UserLogin, UserResponse

logger = logging.getLogger(__name__)

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: "starlette.requests.Request",
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    raw = credentials.credentials

    # Try JWT first
    payload = decode_token(raw)
    if payload and payload.get("type") == "access":
        user_id = int(payload.get("sub", 0))
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return user

    # Fall back to API token
    from routers.tokens import get_user_by_api_token
    required_scope = "write" if request.method in ("POST", "PUT", "PATCH", "DELETE") else None
    user = await get_user_by_api_token(raw, db, required_scope=required_scope)
    if user and user.is_active:
        return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ─── Per-IP rate limiting for sensitive auth endpoints ──────────────────────
# Simple in-memory sliding window — limits brute-force and enumeration.

_auth_rate_cache: dict[str, list[float]] = {}
_AUTH_WINDOW = 300  # 5 minutes
_AUTH_MAX_ATTEMPTS = 10  # max attempts per window


_auth_rate_prune_time: float = 0
_AUTH_PRUNE_INTERVAL = 60  # seconds between full cache prunes


async def _check_auth_rate_limit(request: starlette.requests.Request) -> None:
    import time
    global _auth_rate_prune_time
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Periodically prune stale IPs to prevent unbounded memory growth
    if now - _auth_rate_prune_time > _AUTH_PRUNE_INTERVAL:
        _auth_rate_prune_time = now
        stale_ips = [
            k for k, v in _auth_rate_cache.items()
            if not v or now - v[-1] > _AUTH_WINDOW
        ]
        for k in stale_ips:
            del _auth_rate_cache[k]

    attempts = _auth_rate_cache.get(ip, [])
    # Remove expired entries
    attempts = [t for t in attempts if now - t < _AUTH_WINDOW]
    if len(attempts) >= _AUTH_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please try again later.",
        )
    attempts.append(now)
    _auth_rate_cache[ip] = attempts


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_check_auth_rate_limit)])
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # TODO: send verification email via SendGrid (token never logged for security)
    # verification_token = create_email_verification_token(user.id, user.email)
    logger.info(f"User registered: {user.email} (id={user.id})")

    return TokenResponse(
        access_token=create_access_token(user.id, user.email),
        refresh_token=create_refresh_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.post("/login", dependencies=[Depends(_check_auth_rate_limit)])
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # 2FA check: if TOTP is enabled, require a valid code
    if user.totp_enabled:
        if not body.totp_code:
            return {"requires_2fa": True}
        if not user.totp_secret or not verify_totp(user.totp_secret, body.totp_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid TOTP code",
            )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, user.email),
        refresh_token=create_refresh_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = int(payload.get("sub", 0))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id, user.email),
        refresh_token=create_refresh_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


# ─── TOTP 2FA endpoints ─────────────────────────────────────────────────────


@router.post("/2fa/setup")
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a TOTP secret and return it with a provisioning URI for QR code scanning."""
    secret = generate_totp_secret()
    current_user.totp_secret = secret
    await db.commit()

    uri = get_totp_uri(secret, current_user.email)
    return {"secret": secret, "uri": uri}


class TOTPCodeBody(BaseModel):
    code: str


@router.post("/2fa/verify")
async def verify_2fa(
    body: TOTPCodeBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify a TOTP code and enable 2FA for the user."""
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP not set up. Call /2fa/setup first.",
        )

    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid TOTP code",
        )

    current_user.totp_enabled = True
    await db.commit()
    return {"message": "2FA enabled successfully"}


@router.post("/2fa/disable")
async def disable_2fa(
    body: TOTPCodeBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable 2FA after verifying the current TOTP code."""
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled",
        )

    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid TOTP code",
        )

    current_user.totp_enabled = False
    current_user.totp_secret = None
    await db.commit()
    return {"message": "2FA disabled successfully"}


# ─── Password reset endpoints ───────────────────────────────────────────────


class ForgotPasswordBody(BaseModel):
    email: EmailStr


@router.post("/forgot-password", dependencies=[Depends(_check_auth_rate_limit)])
async def forgot_password(body: ForgotPasswordBody, db: AsyncSession = Depends(get_db)):
    """Generate a password reset token. Always returns success to avoid leaking email existence."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user:
        token = create_password_reset_token(user.id, user.email, pw_hash=user.hashed_password)
        # TODO: deliver via SendGrid — never log tokens
        logger.info(f"Password reset requested for user_id={user.id}")

    return {"message": "If that email exists, a reset link has been sent."}


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password")
async def reset_password(body: ResetPasswordBody, db: AsyncSession = Depends(get_db)):
    """Reset the user's password using a valid reset token."""
    payload = decode_token(body.token)
    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user_id = int(payload.get("sub", 0))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Prevent token replay: if the password has already been changed since
    # this token was issued, the token's pw_hash won't match.
    token_pw_hash = payload.get("pw_hash")
    if token_pw_hash and token_pw_hash != user.hashed_password[:16]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has already been used",
        )

    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password has been reset successfully"}


# ─── Email verification endpoints ────────────────────────────────────────────


@router.post("/send-verification")
async def send_verification(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and log an email verification token."""
    if current_user.is_verified:
        return {"message": "Email already verified"}

    token = create_email_verification_token(current_user.id, current_user.email)
    # TODO: deliver via SendGrid — never log tokens
    logger.info(f"Verification email requested for user_id={current_user.id}")
    return {"message": "Verification email sent"}


class VerifyEmailBody(BaseModel):
    token: str


@router.post("/verify-email")
async def verify_email(body: VerifyEmailBody, db: AsyncSession = Depends(get_db)):
    """Verify the user's email using a valid verification token."""
    payload = decode_token(body.token)
    if not payload or payload.get("type") != "email_verify":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    user_id = int(payload.get("sub", 0))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    user.is_verified = True
    await db.commit()
    return {"message": "Email verified successfully"}


@router.post("/google", response_model=TokenResponse)
async def google_sso(code: str, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Exchange a Google OAuth authorization code for Meridian tokens."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google SSO not configured")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": f"{settings.app_url}/auth/google/callback",
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(400, "Failed to exchange Google code")

        google_token = token_resp.json().get("access_token")
        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {google_token}"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(400, "Failed to fetch Google user info")

    google_user = user_resp.json()
    email = google_user.get("email", "").lower()
    full_name = google_user.get("name")
    avatar_url = google_user.get("picture")

    if not email:
        raise HTTPException(400, "No email returned from Google")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            full_name=full_name,
            avatar_url=avatar_url,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        user.last_login = datetime.now(timezone.utc)
        await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, user.email),
        refresh_token=create_refresh_token(user.id),
        user=UserResponse.model_validate(user),
    )
