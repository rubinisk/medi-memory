from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings

PASSWORD_RULES = (
    "Password must be at least 8 characters and include an uppercase letter, "
    "a lowercase letter and a number."
)


def validate_password_strength(password: str) -> str:
    if (
        len(password) < 8
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"\d", password)
    ):
        raise ValueError(PASSWORD_RULES)
    if len(password.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes long.")
    return password


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_access_token(user_id: int) -> tuple[str, str, datetime]:
    jti = uuid.uuid4().hex
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    token = jwt.encode(
        {"sub": str(user_id), "jti": jti, "exp": expires, "iat": datetime.now(timezone.utc)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, jti, expires.replace(tzinfo=None)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
