"""Turns a patient's records into searchable chunks.

Both uploaded documents and structured records (consultations, medications,
appointments) are indexed, each with its status so the assistant can tell
confirmed information apart from extractions still awaiting confirmation.
"""
from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Appointment, Consultation, DocumentChunk, MedicalDocument, Medication, PatientProfile
from app.rag.embeddings import LOCAL_MODEL, active_model, embed_texts

log = logging.getLogger(__name__)

DOC_TYPE_LABELS = {
    "prescription": "Prescription", "lab_report": "Lab report", "medical_certificate": "Medical certificate",
    "consultation_note": "Consultation note", "medical_image": "Medical image", "other": "Document",
}


def _fmt(d) -> str:
    return d.strftime("%d %b %Y") if d else "unknown date"


def split_text(text: str, size: int = 700, overlap: int = 120) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = min(len(text), start + size)
        if end < len(text):
            cut = text.rfind(". ", start + size // 2, end)
            if cut != -1:
                end = cut + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


def _consultation_chunks(c: Consultation) -> tuple[str, list[str]]:
    label = f"Consultation with {c.doctor_name} on {_fmt(c.consultation_date)}"
    parts = [f"{label}."]
    if c.specialty or c.clinic:
        parts.append(f"Doctor: {c.doctor_name}{', ' + c.specialty if c.specialty else ''}{' at ' + c.clinic if c.clinic else ''}.")
    if c.symptoms:
        parts.append(f"Concerns recorded by the patient: {c.symptoms}")
    if c.doctor_notes:
        parts.append(f"Doctor's notes: {c.doctor_notes}")
    if c.instructions:
        parts.append("Doctor's instructions: " + " ".join(i.text.rstrip(".") + "." for i in c.instructions))
    if c.medications:
        parts.append("Medications prescribed in this consultation: " + "; ".join(
            f"{m.name} {m.dosage}, {m.frequency}" + (f" ({m.instructions})" if m.instructions else "") for m in c.medications) + ".")
    if c.recommended_tests:
        parts.append(f"Recommended tests: {c.recommended_tests}")
    if c.follow_up_date:
        parts.append(f"Follow-up date: {_fmt(c.follow_up_date)}.")
    return label, split_text(" ".join(parts), size=1200)


def _medication_chunks(m: Medication) -> tuple[str, list[str]]:
    label = f"Medication: {m.name}"
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    times = ", ".join(s.time_of_day + (f" ({s.label})" if s.label else "")
                      + (" on " + "/".join(days[int(x)] for x in s.days_of_week.split(",")) if s.days_of_week else "")
                      for s in m.schedules)
    text = (
        f"Medication {m.name}. Dosage as prescribed: {m.dosage}. Frequency: {m.frequency}. "
        f"{'Currently active.' if m.is_active else 'Not currently active.'} "
        + (f"Scheduled times: {times}. " if times else "")
        + (f"Start date {_fmt(m.start_date)}. " if m.start_date else "")
        + (f"End date {_fmt(m.end_date)}. " if m.end_date else "")
        + (f"Doctor's instructions: {m.instructions}. " if m.instructions else "")
        + (f"Prescribed by {m.prescribed_by}." if m.prescribed_by else "")
    )
    return label, [text]


def _appointment_chunks(a: Appointment) -> tuple[str, list[str]]:
    label = f"Appointment: {a.title} on {_fmt(a.scheduled_at)}"
    text = (
        f"Appointment {a.title} scheduled on {_fmt(a.scheduled_at)} at {a.scheduled_at.strftime('%I:%M %p')}. "
        + (f"Doctor: {a.doctor_name}. " if a.doctor_name else "")
        + (f"Hospital or clinic: {a.hospital}. " if a.hospital else "")
        + (f"Location: {a.location}. " if a.location else "")
        + ("This is a follow-up appointment. " if a.is_follow_up else "")
        + f"Status: {a.status}. "
        + (f"Notes: {a.notes}" if a.notes else "")
    )
    return label, [text]


def _document_chunks(d: MedicalDocument) -> tuple[str, list[str]]:
    kind = DOC_TYPE_LABELS.get(d.doc_type, "Document")
    label = f"{kind}: {d.title} ({_fmt(d.document_date or d.created_at)})"
    header = f"{kind} '{d.title}' dated {_fmt(d.document_date or d.created_at)}."
    chunks: list[str] = []
    ext = d.extraction
    data = (ext.confirmed_data if ext and ext.confirmed_data else (ext.structured if ext else {})) or {}
    summary_bits = []
    if data.get("summary"):
        summary_bits.append(str(data["summary"]))
    if data.get("medications"):
        summary_bits.append("Medications listed: " + "; ".join(
            f"{m.get('name')} {m.get('dosage', '')} {m.get('frequency', '')}".strip() for m in data["medications"]))
    if data.get("tests"):
        summary_bits.append("Test results: " + "; ".join(
            f"{t.get('name')}: {t.get('value') or ''} {t.get('unit') or ''}".strip()
            + (f" (reference {t['reference_range']})" if t.get("reference_range") else "") for t in data["tests"]))
    if data.get("instructions"):
        summary_bits.append("Instructions: " + "; ".join(data["instructions"]))
    if summary_bits:
        chunks.append(header + " " + " ".join(summary_bits))
    if ext and ext.raw_text:
        raw = ext.raw_text.replace("SAMPLE DOCUMENT - FICTIONAL DATA FOR DEMONSTRATION ONLY - NOT A REAL MEDICAL RECORD", "")
        for piece in split_text(raw):
            chunks.append(f"{header} Text: {piece}")
    return label, chunks


def _record_status(obj) -> str:
    if isinstance(obj, Appointment):
        return "confirmed"
    status = getattr(obj, "status", "confirmed")
    return "confirmed" if status == "confirmed" else "pending_review"


def _model_for(db: Session, owner_id: int) -> str:
    profile = db.scalar(select(PatientProfile).where(PatientProfile.user_id == owner_id))
    return active_model(bool(profile and profile.ai_data_consent))


def remove_source(db: Session, owner_id: int, source_type: str, source_id: int) -> None:
    db.execute(delete(DocumentChunk).where(
        DocumentChunk.owner_id == owner_id, DocumentChunk.source_type == source_type, DocumentChunk.source_id == source_id))


def index_source(db: Session, owner_id: int, source_type: str, obj, model: str | None = None) -> int:
    """(Re)build chunks for one record. Caller commits."""
    remove_source(db, owner_id, source_type, obj.id)
    if source_type == "consultation":
        label, texts = _consultation_chunks(obj)
        sdate = obj.consultation_date
    elif source_type == "medication":
        label, texts = _medication_chunks(obj)
        sdate = obj.start_date
    elif source_type == "appointment":
        label, texts = _appointment_chunks(obj)
        sdate = obj.scheduled_at.date()
    elif source_type == "document":
        if obj.status not in ("pending_review", "confirmed"):
            return 0
        label, texts = _document_chunks(obj)
        sdate = obj.document_date or obj.created_at.date()
    else:
        raise ValueError(source_type)
    if not texts:
        return 0
    model = model or _model_for(db, owner_id)
    try:
        vectors = embed_texts(texts, model)
    except Exception as exc:  # provider down -> fall back to local, never lose the index
        log.warning("Embedding provider failed (%s); falling back to local embeddings", exc)
        model = LOCAL_MODEL
        vectors = embed_texts(texts, model)
    status = _record_status(obj)
    for i, (t, v) in enumerate(zip(texts, vectors)):
        db.add(DocumentChunk(
            owner_id=owner_id, source_type=source_type, source_id=obj.id, source_label=label[:255],
            source_date=sdate, record_status=status, chunk_index=i, content=t, embedding=v, embedding_model=model,
        ))
    return len(texts)


def reindex_user(db: Session, owner_id: int) -> int:
    model = _model_for(db, owner_id)
    db.execute(delete(DocumentChunk).where(DocumentChunk.owner_id == owner_id))
    n = 0
    for c in db.scalars(select(Consultation).where(Consultation.owner_id == owner_id)):
        n += index_source(db, owner_id, "consultation", c, model)
    for m in db.scalars(select(Medication).where(Medication.owner_id == owner_id)):
        n += index_source(db, owner_id, "medication", m, model)
    for a in db.scalars(select(Appointment).where(Appointment.owner_id == owner_id)):
        n += index_source(db, owner_id, "appointment", a, model)
    for d in db.scalars(select(MedicalDocument).where(MedicalDocument.owner_id == owner_id)):
        n += index_source(db, owner_id, "document", d, model)
    return n
