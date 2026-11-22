from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import Appointment, Consultation, Reminder, User
from app.rag.indexer import index_source, remove_source
from app.schemas.core import AppointmentIn, AppointmentOut
from app.services.audit import audit

router = APIRouter(prefix="/api/appointments", tags=["appointments"])


def _owned(db: Session, user_id: int, aid: int) -> Appointment:
    a = db.scalar(select(Appointment).where(Appointment.id == aid, Appointment.owner_id == user_id))
    if not a:
        raise HTTPException(404, "Appointment not found.")
    return a


def _validate(db: Session, user_id: int, body: AppointmentIn) -> dict:
    if body.consultation_id is not None and not db.scalar(
            select(Consultation.id).where(Consultation.id == body.consultation_id, Consultation.owner_id == user_id)):
        raise HTTPException(400, "Linked consultation not found.")
    data = body.model_dump()
    if data["scheduled_at"].tzinfo:
        data["scheduled_at"] = data["scheduled_at"].astimezone().replace(tzinfo=None)
    return data


@router.get("", response_model=list[AppointmentOut])
def list_appointments(when: str = Query("all", pattern="^(all|upcoming|past)$"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Appointment).where(Appointment.owner_id == user.id)
    now = datetime.now()
    if when == "upcoming":
        stmt = stmt.where(Appointment.scheduled_at >= now).order_by(Appointment.scheduled_at)
    elif when == "past":
        stmt = stmt.where(Appointment.scheduled_at < now).order_by(Appointment.scheduled_at.desc())
    else:
        stmt = stmt.order_by(Appointment.scheduled_at)
    return db.scalars(stmt).all()


@router.post("", response_model=AppointmentOut, status_code=201)
def create_appointment(body: AppointmentIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = Appointment(owner_id=user.id, **_validate(db, user.id, body))
    db.add(a)
    db.flush()
    index_source(db, user.id, "appointment", a)
    audit(db, user.id, "appointment.create", "appointment", a.id, ip=client_ip(request))
    db.commit()
    return a


@router.get("/{aid}", response_model=AppointmentOut)
def get_appointment(aid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _owned(db, user.id, aid)


@router.put("/{aid}", response_model=AppointmentOut)
def update_appointment(aid: int, body: AppointmentIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _owned(db, user.id, aid)
    data = _validate(db, user.id, body)
    if data["scheduled_at"] != a.scheduled_at or data["reminder_minutes_before"] != a.reminder_minutes_before:
        db.execute(delete(Reminder).where(Reminder.appointment_id == a.id, Reminder.status == "pending"))
    for k, v in data.items():
        setattr(a, k, v)
    db.flush()
    index_source(db, user.id, "appointment", a)
    audit(db, user.id, "appointment.update", "appointment", a.id, ip=client_ip(request))
    db.commit()
    return a


@router.delete("/{aid}", status_code=204)
def delete_appointment(aid: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _owned(db, user.id, aid)
    remove_source(db, user.id, "appointment", a.id)
    db.delete(a)
    audit(db, user.id, "appointment.delete", "appointment", aid, ip=client_ip(request))
    db.commit()
