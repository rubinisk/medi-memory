from __future__ import annotations

from datetime import date, datetime, time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import (Appointment, Consultation, DoctorInstruction, DocumentExtraction, MedicalDocument, Medication,
                        MedicationSchedule, User, utcnow)
from app.rag.indexer import index_source, remove_source
from app.schemas.core import ConfirmExtractionIn, DocumentOut, DocumentUpdate
from app.services import storage
from app.services.audit import audit
from app.services.extraction import ALLOWED_TYPES, TIME_OK, process_document, sniff_mime, suggest_times

router = APIRouter(prefix="/api/documents", tags=["documents"])
DOC_TYPES = {"prescription", "lab_report", "medical_certificate", "consultation_note", "medical_image", "other"}


def _owned(db: Session, user_id: int, did: int) -> MedicalDocument:
    d = db.scalar(select(MedicalDocument).options(selectinload(MedicalDocument.extraction))
                  .where(MedicalDocument.id == did, MedicalDocument.owner_id == user_id))
    if not d:
        raise HTTPException(404, "Document not found.")
    return d


def _run_extraction(db: Session, user: User, doc: MedicalDocument, content: bytes) -> None:
    consent = bool(user.profile and user.profile.ai_data_consent)
    try:
        res = process_document(content, doc.mime_type, use_llm=consent)
    except Exception as exc:  # never lose the upload because extraction failed
        doc.status = "failed"
        warn = [f"Text extraction failed: {type(exc).__name__}. The file is saved; you can enter details manually."]
        if doc.extraction:
            doc.extraction.warnings = warn
        else:
            doc.extraction = DocumentExtraction(raw_text="", method="none", confidence="low", structured={}, warnings=warn)
        return
    if doc.doc_type == "other":
        doc.doc_type = res.doc_type
    if res.structured.get("document_date") and not doc.document_date:
        try:
            doc.document_date = date.fromisoformat(res.structured["document_date"])
        except ValueError:
            pass
    if not consent and settings.llm_enabled:
        res.warnings.append("AI extraction was not used because you haven't enabled AI processing in Settings. Basic pattern matching was used.")
    if doc.extraction is None:
        doc.extraction = DocumentExtraction(raw_text=res.raw_text, method=res.method, confidence=res.confidence,
                                            structured=res.structured, warnings=res.warnings)
    else:
        e = doc.extraction
        e.raw_text, e.method, e.confidence, e.structured, e.warnings = res.raw_text, res.method, res.confidence, res.structured, res.warnings
        e.confirmed_data, e.confirmed_at = None, None
    doc.status = "pending_review"


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(request: Request, file: UploadFile = File(...), title: str | None = Form(None),
                          doc_type: str | None = Form(None), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(413, f"File is too large. Maximum size is {settings.max_upload_mb} MB.")
    if not content:
        raise HTTPException(400, "The file is empty.")
    filename = Path(file.filename or "upload").name[:200]
    mime = sniff_mime(content, filename)
    if mime not in ALLOWED_TYPES:
        raise HTTPException(415, "Unsupported file type. Upload a PDF, PNG, JPG, WEBP or TXT file.")
    if doc_type and doc_type not in DOC_TYPES:
        raise HTTPException(400, "Unknown document type.")
    stored = storage.save_file(user.id, content, ALLOWED_TYPES[mime])
    doc = MedicalDocument(owner_id=user.id, title=(title or Path(filename).stem).strip()[:200] or "Document",
                          doc_type=doc_type or "other", original_filename=filename, stored_filename=stored,
                          mime_type=mime, size_bytes=len(content), status="uploaded")
    db.add(doc)
    db.flush()
    _run_extraction(db, user, doc, content)
    db.flush()
    index_source(db, user.id, "document", doc)
    audit(db, user.id, "document.upload", "document", doc.id, detail=f"{mime}, {len(content)} bytes", ip=client_ip(request))
    db.commit()
    return _owned(db, user.id, doc.id)


@router.get("", response_model=list[DocumentOut])
def list_documents(q: str | None = Query(None, max_length=100), doc_type: str | None = None, status: str | None = None,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(MedicalDocument).options(selectinload(MedicalDocument.extraction)).where(MedicalDocument.owner_id == user.id)
    if doc_type:
        stmt = stmt.where(MedicalDocument.doc_type == doc_type)
    if status:
        stmt = stmt.where(MedicalDocument.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.outerjoin(DocumentExtraction).where(or_(
            MedicalDocument.title.ilike(like), MedicalDocument.original_filename.ilike(like),
            MedicalDocument.notes.ilike(like), DocumentExtraction.raw_text.ilike(like)))
    return db.scalars(stmt.order_by(MedicalDocument.created_at.desc())).unique().all()


@router.get("/{did}", response_model=DocumentOut)
def get_document(did: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _owned(db, user.id, did)


@router.patch("/{did}", response_model=DocumentOut)
def update_document(did: int, body: DocumentUpdate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = _owned(db, user.id, did)
    data = body.model_dump(exclude_unset=True)
    if "doc_type" in data and data["doc_type"] not in DOC_TYPES:
        raise HTTPException(400, "Unknown document type.")
    for k, v in data.items():
        setattr(d, k, v)
    db.flush()
    index_source(db, user.id, "document", d)
    audit(db, user.id, "document.update", "document", d.id, ip=client_ip(request))
    db.commit()
    return _owned(db, user.id, did)


@router.get("/{did}/file")
def download_document(did: int, request: Request, download: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = _owned(db, user.id, did)
    path = storage.file_path(user.id, d.stored_filename)
    if not path.exists():
        raise HTTPException(404, "The stored file is missing.")
    audit(db, user.id, "document.download" if download else "document.view", "document", d.id, ip=client_ip(request))
    db.commit()
    return FileResponse(path, media_type=d.mime_type, filename=d.original_filename,
                        content_disposition_type="attachment" if download else "inline")


@router.post("/{did}/reprocess", response_model=DocumentOut)
def reprocess_document(did: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = _owned(db, user.id, did)
    if d.status == "confirmed":
        raise HTTPException(409, "This document is already confirmed.")
    content = storage.file_path(user.id, d.stored_filename).read_bytes()
    _run_extraction(db, user, d, content)
    db.flush()
    index_source(db, user.id, "document", d)
    audit(db, user.id, "document.reprocess", "document", d.id, ip=client_ip(request))
    db.commit()
    return _owned(db, user.id, did)


@router.post("/{did}/confirm", response_model=DocumentOut)
def confirm_document(did: int, body: ConfirmExtractionIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Patient-reviewed details become part of the medical history. Only now are records created."""
    d = _owned(db, user.id, did)
    if d.status == "confirmed":
        raise HTTPException(409, "This document has already been confirmed.")
    d.title, d.doc_type, d.document_date = body.title, body.doc_type, body.document_date
    data = body.model_dump(mode="json", exclude={"reviewed_against_original", "create_consultation", "create_medications"})
    if d.extraction is None:
        d.extraction = DocumentExtraction(raw_text="", method="manual", confidence="high", structured={}, warnings=[])
    d.extraction.confirmed_data = data
    d.extraction.confirmed_at = utcnow()

    consultation = None
    instructions = [s.strip() for s in body.instructions if s.strip()]
    wants_consult = body.create_consultation and body.doctor_name and (
        instructions or body.medications or body.summary or body.doc_type in ("prescription", "consultation_note"))
    if wants_consult:
        consultation = Consultation(
            owner_id=user.id, doctor_name=body.doctor_name, specialty=body.specialty, clinic=body.clinic,
            consultation_date=body.document_date or date.today(), doctor_notes=body.summary,
            recommended_tests=", ".join(t.name for t in body.tests) if body.doc_type != "lab_report" and body.tests else None,
            follow_up_date=body.follow_up_date, status="confirmed", source_document_id=d.id,
        )
        consultation.instructions = [DoctorInstruction(text=t) for t in instructions]
        db.add(consultation)
        db.flush()
        d.consultation_id = consultation.id

    created_meds = []
    if body.create_medications:
        for m in body.medications:
            if not m.name.strip():
                continue
            med = Medication(
                owner_id=user.id, consultation_id=consultation.id if consultation else None, name=m.name.strip(),
                dosage=m.dosage.strip() or "As written on prescription", frequency=m.frequency.strip() or "As directed",
                instructions=m.instructions, start_date=body.document_date, prescribed_by=body.doctor_name,
                is_active=True, status="confirmed",
            )
            times = [t for t in (m.times or suggest_times(m.frequency)) if TIME_OK(t)]
            med.schedules = [MedicationSchedule(time_of_day=t) for t in dict.fromkeys(times)]
            db.add(med)
            created_meds.append(med)
    db.flush()

    if body.follow_up_date and body.follow_up_date >= date.today():
        appt = Appointment(owner_id=user.id, title=f"Follow-up{' with ' + body.doctor_name if body.doctor_name else ''}",
                           doctor_name=body.doctor_name, specialty=body.specialty, hospital=body.clinic,
                           scheduled_at=datetime.combine(body.follow_up_date, time(10, 0)), is_follow_up=True,
                           consultation_id=consultation.id if consultation else None,
                           notes="Created from a confirmed document. Time set to 10:00; please adjust to your actual slot.")
        db.add(appt)
        db.flush()
        index_source(db, user.id, "appointment", appt)

    d.status = "confirmed"
    db.flush()
    if consultation:
        db.refresh(consultation)
        index_source(db, user.id, "consultation", consultation)
    for med in created_meds:
        index_source(db, user.id, "medication", med)
    index_source(db, user.id, "document", d)
    audit(db, user.id, "document.confirm", "document", d.id,
          detail=f"consultation={'yes' if consultation else 'no'}, medications={len(created_meds)}", ip=client_ip(request))
    db.commit()
    return _owned(db, user.id, did)


@router.delete("/{did}", status_code=204)
def delete_document(did: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = _owned(db, user.id, did)
    remove_source(db, user.id, "document", d.id)
    storage.delete_file(user.id, d.stored_filename)
    db.delete(d)
    audit(db, user.id, "document.delete", "document", did, ip=client_ip(request))
    db.commit()
