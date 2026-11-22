from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import Consultation, Medication, MedicationSchedule, Reminder, User, utcnow
from app.rag.indexer import index_source, remove_source
from app.schemas.core import MedicationIn, MedicationOut, ReminderAction, ReminderOut
from app.services.audit import audit
from app.services.reminders import day_reminders, describe, ensure_reminders

router = APIRouter(prefix="/api", tags=["medications"])


def _owned(db: Session, user_id: int, mid: int) -> Medication:
    m = db.scalar(select(Medication).options(selectinload(Medication.schedules))
                  .where(Medication.id == mid, Medication.owner_id == user_id))
    if not m:
        raise HTTPException(404, "Medication not found.")
    return m


def _check_consultation(db: Session, user_id: int, cid: int | None) -> None:
    if cid is not None and not db.scalar(select(Consultation.id).where(Consultation.id == cid, Consultation.owner_id == user_id)):
        raise HTTPException(400, "Linked consultation not found.")


def _reindex_related(db: Session, user_id: int, m: Medication, old_consultation_id: int | None = None) -> None:
    index_source(db, user_id, "medication", m)
    for cid in {m.consultation_id, old_consultation_id} - {None}:
        c = db.get(Consultation, cid)
        if c and c.owner_id == user_id:
            db.refresh(c)
            index_source(db, user_id, "consultation", c)


@router.get("/medications", response_model=list[MedicationOut])
def list_medications(active: bool | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Medication).options(selectinload(Medication.schedules)).where(Medication.owner_id == user.id)
    if active is not None:
        stmt = stmt.where(Medication.is_active == active)
    return db.scalars(stmt.order_by(Medication.is_active.desc(), Medication.name)).all()


@router.post("/medications", response_model=MedicationOut, status_code=201)
def create_medication(body: MedicationIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_consultation(db, user.id, body.consultation_id)
    m = Medication(owner_id=user.id, status="confirmed", **body.model_dump(exclude={"schedules"}))
    m.schedules = [MedicationSchedule(**s.model_dump()) for s in body.schedules]
    db.add(m)
    db.flush()
    _reindex_related(db, user.id, m)
    audit(db, user.id, "medication.create", "medication", m.id, ip=client_ip(request))
    db.commit()
    return _owned(db, user.id, m.id)


@router.get("/medications/{mid}", response_model=MedicationOut)
def get_medication(mid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _owned(db, user.id, mid)


@router.put("/medications/{mid}", response_model=MedicationOut)
def update_medication(mid: int, body: MedicationIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = _owned(db, user.id, mid)
    _check_consultation(db, user.id, body.consultation_id)
    old_cid = m.consultation_id
    for k, v in body.model_dump(exclude={"schedules"}).items():
        setattr(m, k, v)
    new_times = [(s.time_of_day, s.label, s.days_of_week or None) for s in body.schedules]
    if new_times != [(s.time_of_day, s.label, s.days_of_week or None) for s in m.schedules]:
        # drop future pending reminders of removed schedules; keep history
        m.schedules.clear()
        db.flush()
        m.schedules.extend(MedicationSchedule(**s.model_dump()) for s in body.schedules)
    m.status = "confirmed"
    db.flush()
    _reindex_related(db, user.id, m, old_cid)
    audit(db, user.id, "medication.update", "medication", m.id, ip=client_ip(request))
    db.commit()
    return _owned(db, user.id, mid)


@router.delete("/medications/{mid}", status_code=204)
def delete_medication(mid: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = _owned(db, user.id, mid)
    cid = m.consultation_id
    remove_source(db, user.id, "medication", m.id)
    db.delete(m)
    db.flush()
    if cid:
        c = db.get(Consultation, cid)
        if c:
            db.refresh(c)
            index_source(db, user.id, "consultation", c)
    audit(db, user.id, "medication.delete", "medication", mid, ip=client_ip(request))
    db.commit()


# ------------------------------------------------------------------ reminders
@router.get("/reminders/today", response_model=list[ReminderOut])
def reminders_for_day(day: date | None = Query(None), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = day_reminders(db, user.id, day or date.today())
    db.commit()
    return out


@router.get("/reminders/due", response_model=list[ReminderOut])
def due_reminders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Pending reminders that are due now (within the last 2 hours). Polled by the web app for in-app notifications."""
    if user.profile and not user.profile.reminders_enabled:
        return []
    now = datetime.now()
    ensure_reminders(db, user.id, now.date())
    rows = db.scalars(select(Reminder).where(
        Reminder.owner_id == user.id, Reminder.status == "pending",
        Reminder.due_at <= now, Reminder.due_at >= now - timedelta(hours=2)).order_by(Reminder.due_at)).all()
    db.commit()
    return [d for d in (describe(db, r) for r in rows) if d["title"]]


@router.patch("/reminders/{rid}", response_model=ReminderOut)
def act_on_reminder(rid: int, body: ReminderAction, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(Reminder).where(Reminder.id == rid, Reminder.owner_id == user.id))
    if not r:
        raise HTTPException(404, "Reminder not found.")
    r.status = body.status
    r.acted_at = utcnow() if body.status != "pending" else None
    audit(db, user.id, f"reminder.{body.status}", "reminder", r.id, ip=client_ip(request))
    db.commit()
    return describe(db, r)


@router.get("/reminders/history")
def reminder_history(days: int = Query(7, ge=1, le=60), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Per-day counts of medication doses marked taken / missed / not recorded (from the patient's own logs)."""
    today = date.today()
    out = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        items = [r for r in day_reminders(db, user.id, d) if r["kind"] == "medication"]
        past = [r for r in items if r["due_at"] <= datetime.now()]
        out.append({
            "date": d.isoformat(),
            "taken": sum(r["status"] == "taken" for r in items),
            "missed": sum(r["status"] == "missed" for r in items),
            "not_recorded": sum(r["status"] == "pending" for r in past),
            "scheduled": len(items),
        })
    db.commit()
    return out
