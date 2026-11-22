from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database.session import get_db
from app.models import RevokedToken, User

bearer = HTTPBearer(auto_error=False)


def _unauthorized(msg: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=msg, headers={"WWW-Authenticate": "Bearer"})


def get_token_payload(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> dict:
    if creds is None or not creds.credentials:
        raise _unauthorized()
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Session expired. Please log in again.")
    except jwt.PyJWTError:
        raise _unauthorized("Invalid authentication token.")
    if db.get(RevokedToken, payload.get("jti", "")):
        raise _unauthorized("Session has been logged out.")
    return payload


def get_current_user(payload: dict = Depends(get_token_payload), db: Session = Depends(get_db)) -> User:
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise _unauthorized("Account not found or inactive.")
    return user


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None
