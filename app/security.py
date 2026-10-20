"""Password hashing (bcrypt) and JWT (PyJWT) utilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings

# bcrypt silently refuses passwords longer than 72 bytes — truncate explicitly.
BCRYPT_MAX_BYTES = 72


class TokenError(Exception):
    """Raised when a JWT cannot be decoded or is invalid."""


def hash_password(password: str) -> str:
    """Hash a plaintext password with a per-password salt (cost factor 12)."""
    password_bytes = password.encode("utf-8")[:BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time password check against a bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:BCRYPT_MAX_BYTES],
            hashed_password.encode("utf-8"),
        )
    except ValueError:
        # Corrupt/legacy hash formats must never crash authentication.
        return False


def create_access_token(*, subject: int, username: str, role: str) -> str:
    """Issue a signed HS256 access token with standard registered claims."""
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "username": username,
        "role": role,
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=settings.access_token_expire_minutes),
        "iss": settings.app_name,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT, raising TokenError on any failure."""
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            issuer=settings.app_name,
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid token") from exc
