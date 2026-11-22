"""Dashboard, cross-record search and the patient's own audit log."""
from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models import (Appointment, AuditLog, Consultation, DocumentExtraction, MedicalDocument, Medication, User)
from app.services.reminders import day_reminders

router = APIRouter(prefix="/api", tags=["records"])


def _age(dob: date | None) -> int | None:
    if not dob:
        return None
    t = date.today()
    return t.year - dob.year - ((t.month, t.day) < (dob.month, dob.day))


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    uid, now = user.id, datetime.now()
    docs = db.scalars(select(MedicalDocument).where(MedicalDocument.owner_id == uid).order_by(MedicalDocument.created_at.desc())).all()
    consults = db.scalars(select(Consultation).where(Consultation.owner_id == uid).order_by(Consultation.consultation_date.desc())).all()
    meds = db.scalars(select(Medication).where(Medication.owner_id == uid, Medication.is_active.is_(True))).all()
    upcoming = db.scalars(select(Appointment).where(Appointment.owner_id == uid, Appointment.scheduled_at >= now,
                                                    Appointment.status == "scheduled").order_by(Appointment.scheduled_at)).all()
    reminders = day_reminders(db, uid, date.today())
    db.commit()

    timeline = []
    for c in consults[:10]:
        timeline.append({"type": "consultation", "id": c.id, "date": c.consultation_date.isoformat(),
                         "title": f"Consultation with {c.doctor_name}", "subtitle": c.specialty or c.clinic})
    for d in docs[:10]:
        timeline.append({"type": "document", "id": d.id, "date": (d.document_date or d.created_at.date()).isoformat(),
                         "title": d.title, "subtitle": d.doc_type.replace("_", " ").capitalize()
                         + (" · awaiting your review" if d.status == "pending_review" else "")})
    for a in db.scalars(select(Appointment).where(Appointment.owner_id == uid).order_by(Appointment.scheduled_at.desc()).limit(10)):
        timeline.append({"type": "appointment", "id": a.id, "date": a.scheduled_at.date().isoformat(),
                         "title": a.title, "subtitle": ("Upcoming" if a.scheduled_at >= now else a.status.capitalize())
                         + (f" · {a.hospital}" if a.hospital else "")})
    timeline.sort(key=lambda e: e["date"], reverse=True)

    by_type: dict[str, int] = {}
    for d in docs:
        by_type[d.doc_type] = by_type.get(d.doc_type, 0) + 1

    p = user.profile
    return {
        "patient": {"full_name": user.full_name, "email": user.email, "age": _age(p.date_of_birth if p else None),
                    "blood_group": p.blood_group if p else None, "preferred_language": p.preferred_language if p else "en",
                    "emergency_contact": p.emergency_contact_name if p else None},
        "counts": {"documents": len(docs), "consultations": len(consults), "active_medications": len(meds),
                   "upcoming_appointments": len(upcoming),
                   "pending_review": sum(d.status == "pending_review" for d in docs)},
        "upcoming_appointments": [{"id": a.id, "title": a.title, "doctor_name": a.doctor_name, "hospital": a.hospital,
                                   "scheduled_at": a.scheduled_at.isoformat(), "is_follow_up": a.is_follow_up} for a in upcoming[:4]],
        "active_medications": [{"id": m.id, "name": m.name, "dosage": m.dosage, "frequency": m.frequency,
                                "instructions": m.instructions} for m in meds[:6]],
        "todays_reminders": [{**r, "due_at": r["due_at"].isoformat()} for r in reminders],
        "recent_consultations": [{"id": c.id, "doctor_name": c.doctor_name, "specialty": c.specialty,
                                  "consultation_date": c.consultation_date.isoformat(), "clinic": c.clinic} for c in consults[:3]],
        "recent_documents": [{"id": d.id, "title": d.title, "doc_type": d.doc_type, "status": d.status,
                              "original_filename": d.original_filename, "mime_type": d.mime_type,
                              "created_at": d.created_at.isoformat()} for d in docs[:4]],
        "documents_by_type": [{"type": k, "count": v} for k, v in sorted(by_type.items())],
        "timeline": timeline[:12],
    }


@router.get("/timeline")
def timeline(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Complete, date-ordered health journey built from the patient's own records."""
    uid, now = user.id, datetime.now()
    events = []
    for c in db.scalars(select(Consultation).where(Consultation.owner_id == uid)):
        meds = ", ".join(m.name for m in c.medications)
        events.append({"type": "consultation", "id": c.id, "date": c.consultation_date.isoformat(), "time": None,
                       "title": "Consultation", "subtitle": f"{c.doctor_name}" + (f" · {c.specialty}" if c.specialty else ""),
                       "detail": c.symptoms or c.doctor_notes, "extra": f"Prescribed: {meds}" if meds else None, "status": c.status})
    for d in db.scalars(select(MedicalDocument).where(MedicalDocument.owner_id == uid)):
        data = (d.extraction.confirmed_data or d.extraction.structured) if d.extraction else {}
        bits = [m.get("name") for m in (data or {}).get("medications", []) if m.get("name")]
        if not bits:
            bits = [t.get("name") for t in (data or {}).get("tests", [])[:4] if t.get("name")]
        events.append({"type": "document", "id": d.id, "date": (d.document_date or d.created_at.date()).isoformat(), "time": None,
                       "title": d.doc_type.replace("_", " ").capitalize(), "subtitle": d.title,
                       "detail": ", ".join(bits) if bits else None, "extra": None, "status": d.status})
    for a in db.scalars(select(Appointment).where(Appointment.owner_id == uid)):
        upcoming = a.scheduled_at >= now and a.status == "scheduled"
        events.append({"type": "appointment", "id": a.id, "date": a.scheduled_at.date().isoformat(),
                       "time": a.scheduled_at.strftime("%H:%M"),
                       "title": "Upcoming appointment" if upcoming else f"Appointment ({a.status})", "subtitle": a.title,
                       "detail": " · ".join(x for x in [a.doctor_name, a.hospital] if x) or None, "extra": None,
                       "status": "upcoming" if upcoming else a.status})
    events.sort(key=lambda e: (e["date"], e["time"] or ""), reverse=True)
    active_meds = db.scalars(select(Medication).where(Medication.owner_id == uid, Medication.is_active.is_(True))).all()
    return {
        "events": events,
        "insights": {
            "consultations": sum(e["type"] == "consultation" for e in events),
            "documents": sum(e["type"] == "document" for e in events),
            "active_medications": len(active_meds),
            "upcoming_appointments": sum(e["status"] == "upcoming" for e in events),
            "pending_review": sum(e["type"] == "document" and e["status"] == "pending_review" for e in events),
        },
    }


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    uid, like = user.id, f"%{q}%"
    results = []
    for d in db.scalars(select(MedicalDocument).outerjoin(DocumentExtraction).where(
            MedicalDocument.owner_id == uid,
            or_(MedicalDocument.title.ilike(like), MedicalDocument.original_filename.ilike(like), DocumentExtraction.raw_text.ilike(like)))
            .limit(20)).unique():
        results.append({"type": "document", "id": d.id, "title": d.title, "subtitle": d.doc_type.replace("_", " "),
                        "date": (d.document_date or d.created_at.date()).isoformat()})
    for c in db.scalars(select(Consultation).where(Consultation.owner_id == uid, or_(
            Consultation.doctor_name.ilike(like), Consultation.specialty.ilike(like), Consultation.clinic.ilike(like),
            Consultation.doctor_notes.ilike(like), Consultation.symptoms.ilike(like))).limit(20)):
        results.append({"type": "consultation", "id": c.id, "title": f"Consultation with {c.doctor_name}",
                        "subtitle": c.specialty or "", "date": c.consultation_date.isoformat()})
    for m in db.scalars(select(Medication).where(Medication.owner_id == uid, or_(
            Medication.name.ilike(like), Medication.instructions.ilike(like))).limit(20)):
        results.append({"type": "medication", "id": m.id, "title": m.name, "subtitle": f"{m.dosage} · {m.frequency}",
                        "date": m.start_date.isoformat() if m.start_date else None})
    for a in db.scalars(select(Appointment).where(Appointment.owner_id == uid, or_(
            Appointment.title.ilike(like), Appointment.doctor_name.ilike(like), Appointment.hospital.ilike(like),
            Appointment.notes.ilike(like))).limit(20)):
        results.append({"type": "appointment", "id": a.id, "title": a.title, "subtitle": a.hospital or "",
                        "date": a.scheduled_at.date().isoformat()})
    return {"query": q, "results": results}


@router.get("/audit-logs")
def my_audit_logs(limit: int = Query(50, ge=1, le=200), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(limit))
    return [{"id": r.id, "action": r.action, "resource_type": r.resource_type, "resource_id": r.resource_id,
             "detail": r.detail, "created_at": r.created_at.isoformat()} for r in rows]


@router.get("/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds")}

