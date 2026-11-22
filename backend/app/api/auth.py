from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, get_current_user, get_token_payload
from app.core.security import create_access_token, hash_password, verify_password
from app.database.session import get_db
from app.models import PatientProfile, RevokedToken, User
from app.schemas.core import ChangePasswordIn, LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserOut
from app.services.audit import audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_response(user: User) -> TokenOut:
    token, _, exp = create_access_token(user.id)
    return TokenOut(access_token=token, expires_at=exp, user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "An account with this email already exists.")
    user = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password))
    user.profile = PatientProfile()
    db.add(user)
    db.flush()
    audit(db, user.id, "auth.register", "user", user.id, ip=client_ip(request))
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        audit(db, user.id if user else None, "auth.login_failed", "user", user.id if user else None,
              detail=body.email.lower(), ip=client_ip(request))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(403, "This account is disabled.")
    if user.profile is None:
        user.profile = PatientProfile()
    audit(db, user.id, "auth.login", "user", user.id, ip=client_ip(request))
    db.commit()
    return _token_response(user)


@router.post("/logout", status_code=204)
def logout(request: Request, payload: dict = Depends(get_token_payload), db: Session = Depends(get_db)):
    """Invalidates the current token server-side (it cannot be reused)."""
    db.add(RevokedToken(jti=payload["jti"], user_id=int(payload["sub"]),
                        expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc).replace(tzinfo=None)))
    audit(db, int(payload["sub"]), "auth.logout", "user", payload["sub"], ip=client_ip(request))
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if "full_name" in data and data["full_name"]:
        user.full_name = data.pop("full_name").strip()
    else:
        data.pop("full_name", None)
    if user.profile is None:
        user.profile = PatientProfile()
    consent_changed = "ai_data_consent" in data and data["ai_data_consent"] != user.profile.ai_data_consent
    for k, v in data.items():
        if k in {"preferred_language"} and v is None:
            continue
        setattr(user.profile, k, v)
    audit(db, user.id, "profile.update", "user", user.id, detail=",".join(sorted(data.keys())), ip=client_ip(request))
    if consent_changed:
        audit(db, user.id, "consent.ai_data", "user", user.id, detail=f"granted={data['ai_data_consent']}", ip=client_ip(request))
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    audit(db, user.id, "auth.password_change", "user", user.id, ip=client_ip(request))
    db.commit()
