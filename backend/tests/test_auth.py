"""JWT and password auth unit tests."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from jose import jwt

from auth.jwt import create_access_token, decode_access_token
from auth.passwords import hash_password, verify_password
from config import get_settings

settings = get_settings()


def test_hash_and_verify_password():
    hashed = hash_password("secure-password-123")
    assert hashed != "secure-password-123"
    assert verify_password("secure-password-123", hashed)
    assert not verify_password("wrong-password", hashed)


def test_create_and_decode_jwt():
    user_id = uuid4()
    token = create_access_token(user_id, extra_claims={"role": "employee", "department": "HR"})
    payload = decode_access_token(token)

    assert payload["sub"] == str(user_id)
    assert payload["role"] == "employee"
    assert payload["department"] == "HR"
    assert "exp" in payload


def test_decode_invalid_jwt_raises():
    with pytest.raises(ValueError, match="Invalid or expired token"):
        decode_access_token("not.a.valid.token")


def test_jwt_uses_configured_secret():
    user_id = uuid4()
    token = create_access_token(user_id)
    decoded = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert decoded["sub"] == str(user_id)
    assert datetime.fromtimestamp(decoded["exp"], tz=UTC) > datetime.now(tz=UTC)
