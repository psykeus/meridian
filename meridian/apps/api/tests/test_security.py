"""
Tests for core/security.py — JWT token creation, decoding, and password hashing.
Validates token claims, expiry, algorithm handling, and bcrypt round-trips.
"""
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from jose import jwt

from core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from core.config import get_settings

settings = get_settings()

# passlib + bcrypt >= 4.1 incompatibility on Python 3.13: skip password tests if broken
_bcrypt_works = True
try:
    hash_password("probe")
except (ValueError, RuntimeError):
    _bcrypt_works = False

needs_bcrypt = pytest.mark.skipif(not _bcrypt_works, reason="passlib/bcrypt incompatible in this env")


# ── Password hashing ────────────────────────────────────────────────────────

class TestPasswordHashing:
    @needs_bcrypt
    def test_hash_returns_bcrypt_string(self):
        hashed = hash_password("mypassword")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    @needs_bcrypt
    def test_hash_is_not_plaintext(self):
        assert hash_password("secret") != "secret"

    @needs_bcrypt
    def test_verify_correct_password(self):
        hashed = hash_password("correct-horse")
        assert verify_password("correct-horse", hashed) is True

    @needs_bcrypt
    def test_verify_wrong_password(self):
        hashed = hash_password("correct-horse")
        assert verify_password("wrong-horse", hashed) is False

    @needs_bcrypt
    def test_different_inputs_produce_different_hashes(self):
        h1 = hash_password("password1")
        h2 = hash_password("password2")
        assert h1 != h2

    @needs_bcrypt
    def test_same_input_produces_different_hashes_due_to_salt(self):
        h1 = hash_password("same-password")
        h2 = hash_password("same-password")
        assert h1 != h2  # bcrypt salts each hash differently

    @needs_bcrypt
    def test_empty_password_can_be_hashed_and_verified(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False


# ── Access token ─────────────────────────────────────────────────────────────

class TestAccessToken:
    def test_creates_valid_jwt(self):
        token = create_access_token(42, "user@example.com")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        assert payload["sub"] == "42"
        assert payload["email"] == "user@example.com"
        assert payload["type"] == "access"

    def test_has_exp_claim(self):
        token = create_access_token(1, "a@b.com")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        assert "exp" in payload

    def test_has_iat_claim(self):
        token = create_access_token(1, "a@b.com")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        assert "iat" in payload

    def test_exp_is_in_the_future(self):
        token = create_access_token(1, "a@b.com")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        assert payload["exp"] > datetime.now(timezone.utc).timestamp()

    def test_sub_is_string_of_user_id(self):
        token = create_access_token(999, "x@y.com")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        assert payload["sub"] == "999"
        assert isinstance(payload["sub"], str)


# ── Refresh token ────────────────────────────────────────────────────────────

class TestRefreshToken:
    def test_creates_valid_jwt(self):
        token = create_refresh_token(42)
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        assert payload["sub"] == "42"
        assert payload["type"] == "refresh"

    def test_does_not_contain_email(self):
        token = create_refresh_token(42)
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        assert "email" not in payload

    def test_refresh_has_longer_expiry_than_access(self):
        access = create_access_token(1, "a@b.com")
        refresh = create_refresh_token(1)
        a_payload = jwt.decode(access, settings.secret_key, algorithms=[settings.algorithm])
        r_payload = jwt.decode(refresh, settings.secret_key, algorithms=[settings.algorithm])
        assert r_payload["exp"] > a_payload["exp"]


# ── Token decoding ───────────────────────────────────────────────────────────

class TestDecodeToken:
    def test_decodes_valid_access_token(self):
        token = create_access_token(7, "test@test.com")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "7"
        assert payload["email"] == "test@test.com"

    def test_decodes_valid_refresh_token(self):
        token = create_refresh_token(7)
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "refresh"

    def test_returns_none_for_garbage_token(self):
        assert decode_token("not.a.jwt") is None

    def test_returns_none_for_empty_string(self):
        assert decode_token("") is None

    def test_returns_none_for_wrong_secret(self):
        token = jwt.encode(
            {"sub": "1", "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "wrong-secret",
            algorithm="HS256",
        )
        assert decode_token(token) is None

    def test_returns_none_for_expired_token(self):
        token = jwt.encode(
            {"sub": "1", "type": "access", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
            settings.secret_key,
            algorithm=settings.algorithm,
        )
        assert decode_token(token) is None

    def test_returns_none_for_wrong_algorithm(self):
        # Create token with HS384 but config expects HS256
        token = jwt.encode(
            {"sub": "1", "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            settings.secret_key,
            algorithm="HS384",
        )
        # decode_token uses [settings.algorithm] which is HS256, so HS384 should fail
        assert decode_token(token) is None
