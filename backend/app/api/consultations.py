from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import Consultation, DoctorInstruction, MedicalDocument, User
from app.rag.indexer import index_source, remove_source
from app.schemas.core import ConsultationIn, ConsultationOut, DocumentBrief
from app.services.audit import audit

router = APIRouter(prefix="/api/consultations", tags=["consultations"])


def get_owned(db: Session, user_id: int, cid: int) -> Consultation:
    c = db.scalar(select(Consultation).options(selectinload(Consultation.instructions), selectinload(Consultation.medications))
                  .where(Consultation.id == cid, Consultation.owner_id == user_id))
    if not c:
        raise HTTPException(404, "Consultation not found.")
    return c


def to_out(db: Session, c: Consultation) -> ConsultationOut:
    out = ConsultationOut.model_validate(c)
    docs = db.scalars(select(MedicalDocument).where(
        MedicalDocument.owner_id == c.owner_id,
        or_(MedicalDocument.consultation_id == c.id, MedicalDocument.id == (c.source_document_id or -1)))).all()
    out.documents = [DocumentBrief.model_validate(d) for d in docs]
    return out


@router.get("", response_model=list[ConsultationOut])
def list_consultations(q: str | None = Query(None, max_length=100), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = (select(Consultation).options(selectinload(Consultation.instructions), selectinload(Consultation.medications))
            .where(Consultation.owner_id == user.id).order_by(Consultation.consultation_date.desc()))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Consultation.doctor_name.ilike(like), Consultation.specialty.ilike(like),
                              Consultation.clinic.ilike(like), Consultation.doctor_notes.ilike(like),
                              Consultation.symptoms.ilike(like)))
    return [to_out(db, c) for c in db.scalars(stmt)]


@router.post("", response_model=ConsultationOut, status_code=201)
def create_consultation(body: ConsultationIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump(exclude={"instructions"})
    c = Consultation(owner_id=user.id, status="confirmed", **data)
    c.instructions = [DoctorInstruction(text=t) for t in body.instructions]
    db.add(c)
    db.flush()
    index_source(db, user.id, "consultation", c)
    audit(db, user.id, "consultation.create", "consultation", c.id, ip=client_ip(request))
    db.commit()
    return to_out(db, get_owned(db, user.id, c.id))


@router.get("/{cid}", response_model=ConsultationOut)
def get_consultation(cid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return to_out(db, get_owned(db, user.id, cid))


@router.put("/{cid}", response_model=ConsultationOut)
def update_consultation(cid: int, body: ConsultationIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_owned(db, user.id, cid)
    for k, v in body.model_dump(exclude={"instructions"}).items():
        setattr(c, k, v)
    c.instructions.clear()
    db.flush()
    c.instructions.extend(DoctorInstruction(text=t) for t in body.instructions)
    c.status = "confirmed"
    db.flush()
    index_source(db, user.id, "consultation", c)
    audit(db, user.id, "consultation.update", "consultation", c.id, ip=client_ip(request))
    db.commit()
    return to_out(db, get_owned(db, user.id, cid))


@router.delete("/{cid}", status_code=204)
def delete_consultation(cid: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_owned(db, user.id, cid)
    remove_source(db, user.id, "consultation", c.id)
    db.delete(c)
    audit(db, user.id, "consultation.delete", "consultation", cid, ip=client_ip(request))
    db.commit()
