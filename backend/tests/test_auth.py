"""Tests for JWT creation and verification."""

import time
from shared.auth import create_jwt, verify_jwt


def test_create_and_verify_jwt():
    token = create_jwt("user_123", "local", "test@test.com")
    payload = verify_jwt(token)
    assert payload is not None
    assert payload["sub"] == "user_123"
    assert payload["provider"] == "local"
    assert payload["email"] == "test@test.com"


def test_verify_invalid_jwt():
    result = verify_jwt("invalid.token.here")
    assert result is None


def test_verify_empty_jwt():
    result = verify_jwt("")
    assert result is None


def test_jwt_contains_required_claims():
    token = create_jwt("user_abc", "google", "abc@gmail.com")
    payload = verify_jwt(token)
    assert "sub" in payload
    assert "provider" in payload
    assert "email" in payload
    assert "iat" in payload
    assert "exp" in payload
