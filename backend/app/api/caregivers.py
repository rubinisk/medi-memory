"""Caregiver sharing: consent-based, scope-limited, view-only, revocable, logged."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import (Appointment, CaregiverAccessLog, CaregiverInvitation, CaregiverPermission, Consultation,
                        MedicalDocument, Medication, User, utcnow)
from app.schemas.core import AcceptInviteIn, InvitationOut, InviteIn, UpdatePermissionsIn
from app.services.audit import audit

router = APIRouter(prefix="/api", tags=["caregivers"])
INVITE_DAYS = 7


def _active_perms(db: Session, patient_id: int, caregiver_id: int) -> list[CaregiverPermission]:
    return list(db.scalars(select(CaregiverPermission).where(
        CaregiverPermission.patient_id == patient_id, CaregiverPermission.caregiver_id == caregiver_id,
        CaregiverPermission.revoked_at.is_(None))))


def _set_scopes(db: Session, patient_id: int, caregiver_id: int, scopes: set[str], invitation_id: int | None) -> None:
    existing = {p.scope: p for p in db.scalars(select(CaregiverPermission).where(
        CaregiverPermission.patient_id == patient_id, CaregiverPermission.caregiver_id == caregiver_id))}
    for scope, perm in existing.items():
        if scope not in scopes and perm.revoked_at is None:
            perm.revoked_at = utcnow()
    for scope in scopes:
        perm = existing.get(scope)
        if perm is None:
            db.add(CaregiverPermission(patient_id=patient_id, caregiver_id=caregiver_id, scope=scope,
                                       invitation_id=invitation_id, access_level="view"))
        elif perm.revoked_at is not None:
            perm.revoked_at, perm.granted_at = None, utcnow()


# ------------------------------------------------------------------ patient side
@router.post("/caregivers/invitations", response_model=InvitationOut, status_code=201)
def invite(body: InviteIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    email = body.caregiver_email.lower()
    if email == user.email.lower():
        raise HTTPException(400, "You can't invite yourself as a caregiver.")
    inv = CaregiverInvitation(patient_id=user.id, caregiver_email=email, caregiver_name=body.caregiver_name,
                              relationship_label=body.relationship_label, token=secrets.token_urlsafe(24),
                              permissions=sorted(set(body.permissions)), consent_given=True,
                              expires_at=utcnow() + timedelta(days=INVITE_DAYS))
    db.add(inv)
    db.flush()
    audit(db, user.id, "caregiver.invite", "caregiver_invitation", inv.id,
          detail=f"{email}; scopes={','.join(inv.permissions)}; consent=yes", ip=client_ip(request))
    db.commit()
    return inv


@router.get("/caregivers/invitations", response_model=list[InvitationOut])
def list_invitations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(CaregiverInvitation).where(CaregiverInvitation.patient_id == user.id)
                      .order_by(CaregiverInvitation.created_at.desc())).all()
    now = utcnow()
    for r in rows:
        if r.status == "pending" and r.expires_at < now:
            r.status = "expired"
    db.commit()
    return rows


@router.delete("/caregivers/invitations/{iid}", status_code=204)
def revoke_invitation(iid: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.scalar(select(CaregiverInvitation).where(CaregiverInvitation.id == iid, CaregiverInvitation.patient_id == user.id))
    if not inv:
        raise HTTPException(404, "Invitation not found.")
    inv.status = "revoked"
    if inv.caregiver_user_id:
        _set_scopes(db, user.id, inv.caregiver_user_id, set(), inv.id)
    audit(db, user.id, "caregiver.revoke_invitation", "caregiver_invitation", inv.id, ip=client_ip(request))
    db.commit()


@router.get("/caregivers")
def list_caregivers(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    perms = db.scalars(select(CaregiverPermission).where(CaregiverPermission.patient_id == user.id)).all()
    out: dict[int, dict] = {}
    for p in perms:
        cg = db.get(User, p.caregiver_id)
        entry = out.setdefault(p.caregiver_id, {"caregiver_id": p.caregiver_id, "name": cg.full_name if cg else "Unknown",
                                                "email": cg.email if cg else "", "scopes": [], "granted_at": p.granted_at})
        if p.revoked_at is None:
            entry["scopes"].append(p.scope)
    return [e for e in out.values() if e["scopes"]]


@router.put("/caregivers/{caregiver_id}/permissions")
def update_permissions(caregiver_id: int, body: UpdatePermissionsIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.scalar(select(CaregiverPermission.id).where(CaregiverPermission.patient_id == user.id,
                                                          CaregiverPermission.caregiver_id == caregiver_id)):
        raise HTTPException(404, "Caregiver not found.")
    _set_scopes(db, user.id, caregiver_id, set(body.permissions), None)
    audit(db, user.id, "caregiver.update_permissions", "user", caregiver_id, detail=",".join(sorted(body.permissions)), ip=client_ip(request))
    db.commit()
    return {"caregiver_id": caregiver_id, "scopes": sorted(body.permissions)}


@router.delete("/caregivers/{caregiver_id}", status_code=204)
def revoke_caregiver(caregiver_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _set_scopes(db, user.id, caregiver_id, set(), None)
    for inv in db.scalars(select(CaregiverInvitation).where(CaregiverInvitation.patient_id == user.id,
                                                            CaregiverInvitation.caregiver_user_id == caregiver_id)):
        inv.status = "revoked"
    audit(db, user.id, "caregiver.revoke_all", "user", caregiver_id, ip=client_ip(request))
    db.commit()


@router.get("/caregivers/access-log")
def access_log(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(CaregiverAccessLog).where(CaregiverAccessLog.patient_id == user.id)
                      .order_by(CaregiverAccessLog.created_at.desc()).limit(100)).all()
    names = {}
    out = []
    for r in rows:
        if r.caregiver_id not in names:
            cg = db.get(User, r.caregiver_id)
            names[r.caregiver_id] = cg.full_name if cg else "Unknown"
        out.append({"id": r.id, "caregiver": names[r.caregiver_id], "scope": r.scope, "action": r.action,
                    "created_at": r.created_at.isoformat()})
    return out


# ------------------------------------------------------------------ caregiver side
@router.post("/caregiving/accept")
def accept_invitation(body: AcceptInviteIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.scalar(select(CaregiverInvitation).where(CaregiverInvitation.token == body.token.strip()))
    if not inv or inv.status in ("revoked",):
        raise HTTPException(404, "This invitation is not valid.")
    if inv.status == "accepted":
        raise HTTPException(409, "This invitation has already been used.")
    if inv.expires_at < utcnow():
        inv.status = "expired"
        db.commit()
        raise HTTPException(410, "This invitation has expired. Ask the patient to send a new one.")
    if inv.patient_id == user.id:
        raise HTTPException(400, "You can't accept your own invitation.")
    if inv.caregiver_email.lower() != user.email.lower():
        raise HTTPException(403, "This invitation was sent to a different email address. Log in with that account to accept it.")
    inv.status, inv.accepted_at, inv.caregiver_user_id = "accepted", utcnow(), user.id
    current = {p.scope for p in _active_perms(db, inv.patient_id, user.id)}
    _set_scopes(db, inv.patient_id, user.id, current | set(inv.permissions), inv.id)
    audit(db, user.id, "caregiver.accept", "caregiver_invitation", inv.id, ip=client_ip(request))
    audit(db, inv.patient_id, "caregiver.accepted_by", "user", user.id, detail=user.email, ip=client_ip(request))
    db.commit()
    patient = db.get(User, inv.patient_id)
    return {"patient_id": inv.patient_id, "patient_name": patient.full_name if patient else "", "scopes": inv.permissions}


@router.get("/caregiving/patients")
def my_patients(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    perms = db.scalars(select(CaregiverPermission).where(CaregiverPermission.caregiver_id == user.id,
                                                         CaregiverPermission.revoked_at.is_(None))).all()
    out: dict[int, dict] = {}
    for p in perms:
        pt = db.get(User, p.patient_id)
        out.setdefault(p.patient_id, {"patient_id": p.patient_id, "name": pt.full_name if pt else "", "scopes": []})["scopes"].append(p.scope)
    return list(out.values())


@router.get("/caregiving/patients/{patient_id}/{scope}")
def view_patient_scope(patient_id: int, scope: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """View-only, scope-limited access. Enforced server-side on every request."""
    if scope not in ("medications", "appointments", "consultations", "documents"):
        raise HTTPException(404, "Unknown section.")
    if scope not in {p.scope for p in _active_perms(db, patient_id, user.id)}:
        raise HTTPException(403, "You don't have permission to view this section.")
    db.add(CaregiverAccessLog(patient_id=patient_id, caregiver_id=user.id, scope=scope, action="view"))
    db.commit()
    if scope == "medications":
        rows = db.scalars(select(Medication).options(selectinload(Medication.schedules))
                          .where(Medication.owner_id == patient_id, Medication.status == "confirmed")).all()
        return [{"id": m.id, "name": m.name, "dosage": m.dosage, "frequency": m.frequency, "instructions": m.instructions,
                 "is_active": m.is_active, "times": [s.time_of_day for s in m.schedules]} for m in rows]
    if scope == "appointments":
        rows = db.scalars(select(Appointment).where(Appointment.owner_id == patient_id,
                                                    Appointment.scheduled_at >= datetime.now() - timedelta(days=30))
                          .order_by(Appointment.scheduled_at)).all()
        return [{"id": a.id, "title": a.title, "doctor_name": a.doctor_name, "hospital": a.hospital,
                 "scheduled_at": a.scheduled_at.isoformat(), "status": a.status} for a in rows]
    if scope == "consultations":
        rows = db.scalars(select(Consultation).options(selectinload(Consultation.instructions))
                          .where(Consultation.owner_id == patient_id, Consultation.status == "confirmed")
                          .order_by(Consultation.consultation_date.desc())).all()
        return [{"id": c.id, "doctor_name": c.doctor_name, "specialty": c.specialty,
                 "consultation_date": c.consultation_date.isoformat(), "follow_up_date": c.follow_up_date.isoformat() if c.follow_up_date else None,
                 "instructions": [i.text for i in c.instructions]} for c in rows]
    rows = db.scalars(select(MedicalDocument).where(MedicalDocument.owner_id == patient_id, MedicalDocument.status == "confirmed")
                      .order_by(MedicalDocument.created_at.desc())).all()
    return [{"id": d.id, "title": d.title, "doc_type": d.doc_type,
             "document_date": d.document_date.isoformat() if d.document_date else None} for d in rows]
