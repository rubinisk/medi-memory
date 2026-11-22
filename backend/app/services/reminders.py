"""Generates concrete reminder occurrences from confirmed medication schedules and appointments."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Appointment, Medication, MedicationSchedule, Reminder


def _med_applies(m: Medication, day: date) -> bool:
    if not m.is_active or m.status != "confirmed":
        return False
    if m.start_date and day < m.start_date:
        return False
    if m.end_date and day > m.end_date:
        return False
    return True


def ensure_reminders(db: Session, owner_id: int, day: date) -> None:
    """Idempotently create reminder rows for one day. Caller commits."""
    meds = db.scalars(select(Medication).options(selectinload(Medication.schedules))
                      .where(Medication.owner_id == owner_id)).all()
    start = datetime.combine(day, time.min)
    end = start + timedelta(days=1)
    existing = {(r.schedule_id, r.due_at) for r in db.scalars(select(Reminder).where(
        Reminder.owner_id == owner_id, Reminder.kind == "medication", Reminder.due_at >= start, Reminder.due_at < end))}
    for m in meds:
        if not _med_applies(m, day):
            continue
        for s in m.schedules:
            if s.days_of_week and str(day.weekday()) not in s.days_of_week.split(","):
                continue
            hh, mm = map(int, s.time_of_day.split(":"))
            due = datetime.combine(day, time(hh, mm))
            if (s.id, due) not in existing:
                db.add(Reminder(owner_id=owner_id, kind="medication", schedule_id=s.id, due_at=due))
    existing_appt = {r.appointment_id for r in db.scalars(select(Reminder).where(
        Reminder.owner_id == owner_id, Reminder.kind == "appointment"))}
    appts = db.scalars(select(Appointment).where(
        Appointment.owner_id == owner_id, Appointment.status == "scheduled",
        Appointment.scheduled_at >= start, Appointment.scheduled_at < end + timedelta(days=7))).all()
    for a in appts:
        due = a.scheduled_at - timedelta(minutes=a.reminder_minutes_before)
        if start <= due < end and a.id not in existing_appt:
            db.add(Reminder(owner_id=owner_id, kind="appointment", appointment_id=a.id, due_at=due))
    db.flush()


def describe(db: Session, r: Reminder) -> dict:
    out = {"id": r.id, "kind": r.kind, "due_at": r.due_at, "status": r.status, "title": "", "detail": None,
           "medication_id": None, "appointment_id": r.appointment_id}
    if r.kind == "medication" and r.schedule_id:
        s = db.get(MedicationSchedule, r.schedule_id)
        if s:
            m = s.medication
            out.update(title=f"{m.name} {m.dosage}", medication_id=m.id,
                       detail=", ".join(x for x in [s.label, m.instructions] if x) or m.frequency)
    elif r.kind == "appointment" and r.appointment_id:
        a = db.get(Appointment, r.appointment_id)
        if a:
            out.update(title=f"Upcoming: {a.title}",
                       detail=f"{a.scheduled_at:%d %b, %I:%M %p}" + (f" · {a.hospital}" if a.hospital else ""))
    return out


def day_reminders(db: Session, owner_id: int, day: date) -> list[dict]:
    ensure_reminders(db, owner_id, day)
    start = datetime.combine(day, time.min)
    rows = db.scalars(select(Reminder).where(
        Reminder.owner_id == owner_id, Reminder.due_at >= start, Reminder.due_at < start + timedelta(days=1))
        .order_by(Reminder.due_at)).all()
    return [d for d in (describe(db, r) for r in rows) if d["title"]]
