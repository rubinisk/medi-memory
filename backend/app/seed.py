"""Seed a clearly-fictional demo patient (Ananya Sharma) and a demo caregiver.

Usage:  python -m app.seed            (skips if the demo user exists)
        python -m app.seed --reset    (deletes and recreates the demo accounts)
All dates are relative to today so the demo always looks current.
"""
from __future__ import annotations

import secrets
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.core.config import BACKEND_DIR
from app.core.security import hash_password
from app.database.session import SessionLocal
from app.models import (Appointment, CaregiverInvitation, CaregiverPermission, Consultation, ConversationMessage, ConversationSession, DoctorInstruction,
                        DocumentExtraction, MedicalDocument, Medication, MedicationSchedule, PatientProfile, Reminder, User, utcnow)
from app.rag.assistant import answer_question
from app.rag.indexer import reindex_user
from app.services import storage
from app.services.audit import audit
from app.services.extraction import process_document
from app.services.reminders import ensure_reminders
from app.utils import sample_docs

DEMO_EMAIL = "demo@medimemory.app"
DEMO_PASSWORD = "Demo@1234"
CAREGIVER_EMAIL = "caregiver.demo@medimemory.app"
CAREGIVER_PASSWORD = "Care@1234"


def _doc(db, owner: User, title: str, doc_type: str, content: bytes, mime: str, ext: str, ddate: date, consultation_id=None):
    stored = storage.save_file(owner.id, content, ext)
    res = process_document(content, mime, use_llm=False)
    doc = MedicalDocument(owner_id=owner.id, title=title, doc_type=doc_type, original_filename=f"{title}{ext}",
                          stored_filename=stored, mime_type=mime, size_bytes=len(content), document_date=ddate,
                          status="confirmed", consultation_id=consultation_id,
                          notes="Fictional demo document.")
    structured = dict(res.structured)
    doc.extraction = DocumentExtraction(raw_text=res.raw_text, method=res.method, confidence=res.confidence,
                                        structured=structured, warnings=res.warnings,
                                        confirmed_data={**structured, "title": title, "doc_type": doc_type},
                                        confirmed_at=utcnow())
    db.add(doc)
    db.flush()
    return doc


def seed(reset: bool = False) -> None:
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if existing and not reset:
            print(f"Demo data already present ({DEMO_EMAIL}). Use --reset to recreate.")
            return
        for email in (DEMO_EMAIL, CAREGIVER_EMAIL):
            u = db.scalar(select(User).where(User.email == email))
            if u:
                db.delete(u)
        db.commit()

        today = date.today()
        patient = User(email=DEMO_EMAIL, full_name="Ananya Sharma", password_hash=hash_password(DEMO_PASSWORD), is_demo=True)
        patient.profile = PatientProfile(
            date_of_birth=date(today.year - 34, 3, 14), gender="Female", phone="+91 90000 00000",
            address="Fictional address, Chennai", blood_group="B+", emergency_contact_name="Rohan Sharma (fictional)",
            emergency_contact_phone="+91 90000 00001", emergency_contact_relation="Brother", preferred_language="en",
            ai_data_consent=True, voice_autoplay=True, reminders_enabled=True)
        caregiver = User(email=CAREGIVER_EMAIL, full_name="Rohan Sharma", password_hash=hash_password(CAREGIVER_PASSWORD), is_demo=True)
        caregiver.profile = PatientProfile(ai_data_consent=False)
        db.add_all([patient, caregiver])
        db.flush()

        # ---------------- consultation 1: GP, ~3 months ago
        c1_date = today - timedelta(days=92)
        c1 = Consultation(owner_id=patient.id, doctor_name="Dr. Meera Iyer", specialty="General Physician",
                          clinic="Sunrise Family Clinic", consultation_date=c1_date,
                          symptoms="Feeling tired in the afternoons and more thirsty than usual for about a month.",
                          doctor_notes="Routine review. Doctor requested blood tests to check blood sugar and vitamin levels before deciding next steps.",
                          recommended_tests="Fasting blood glucose, HbA1c, Vitamin D, Haemoglobin, TSH",
                          follow_up_date=c1_date + timedelta(days=14), status="confirmed")
        c1.instructions = [DoctorInstruction(text=t) for t in [
            "Get the fasting blood tests done within one week (no food for 10 to 12 hours before the test).",
            "Drink water instead of sweetened drinks.",
            "Bring the lab report to the next appointment.",
        ]]

        # ---------------- consultation 2: endocrinologist, ~6 weeks ago
        c2_date = today - timedelta(days=43)
        c2_follow = today + timedelta(days=12)
        c2 = Consultation(owner_id=patient.id, doctor_name="Dr. Arjun Menon", specialty="Endocrinologist",
                          clinic="City Care Hospital", consultation_date=c2_date,
                          symptoms="Came to review the lab report requested by Dr. Iyer.",
                          doctor_notes="Reviewed the Greenleaf Diagnostics report. Fasting glucose and HbA1c were above the lab reference range and vitamin D was below it. Started Metformin and a weekly vitamin D3 supplement.",
                          recommended_tests="Repeat HbA1c and fasting blood sugar before the next visit",
                          follow_up_date=c2_follow, status="confirmed")
        c2.instructions = [DoctorInstruction(text=t) for t in [
            "Walk for 30 minutes at least 5 days a week.",
            "Avoid sugary drinks and sweets.",
            "Take Metformin with meals to reduce stomach upset.",
            "Repeat HbA1c and fasting blood sugar before the next visit.",
        ]]

        # ---------------- consultation 3: GP, ~10 days ago
        c3_date = today - timedelta(days=10)
        c3 = Consultation(owner_id=patient.id, doctor_name="Dr. Meera Iyer", specialty="General Physician",
                          clinic="Sunrise Family Clinic", consultation_date=c3_date,
                          symptoms="Occasional headaches in the evening for two weeks.",
                          doctor_notes="Blood pressure measured in clinic was higher than the previous reading. Started Amlodipine and asked for home blood pressure monitoring.",
                          follow_up_date=today + timedelta(days=18), status="confirmed")
        c3.instructions = [DoctorInstruction(text=t) for t in [
            "Take Amlodipine 5 mg once daily in the morning.",
            "Reduce salt in food and avoid packaged snacks.",
            "Check blood pressure at home twice a week and keep a written log.",
            "Bring the BP log to the next visit.",
        ]]
        db.add_all([c1, c2, c3])
        db.flush()

        # ---------------- medications
        metformin = Medication(owner_id=patient.id, consultation_id=c2.id, name="Metformin", dosage="500 mg",
                               frequency="Twice daily", start_date=c2_date, end_date=c2_date + timedelta(days=90),
                               instructions="After food (breakfast and dinner)", prescribed_by="Dr. Arjun Menon")
        metformin.schedules = [MedicationSchedule(time_of_day="08:30", label="After breakfast"),
                               MedicationSchedule(time_of_day="20:30", label="After dinner")]
        vitd = Medication(owner_id=patient.id, consultation_id=c2.id, name="Vitamin D3", dosage="60000 IU",
                          frequency="Once weekly", start_date=c2_date, end_date=c2_date + timedelta(weeks=8),
                          instructions="After food, every Sunday", prescribed_by="Dr. Arjun Menon")
        vitd.schedules = [MedicationSchedule(time_of_day="09:00", label="Sunday, after breakfast", days_of_week="6")]
        amlo = Medication(owner_id=patient.id, consultation_id=c3.id, name="Amlodipine", dosage="5 mg",
                          frequency="Once daily", start_date=c3_date, instructions="In the morning",
                          prescribed_by="Dr. Meera Iyer")
        amlo.schedules = [MedicationSchedule(time_of_day="08:00", label="Morning")]
        para = Medication(owner_id=patient.id, consultation_id=c1.id, name="Paracetamol", dosage="650 mg",
                          frequency="Only if needed (SOS)", start_date=c1_date, end_date=c1_date + timedelta(days=5),
                          instructions="For headache, as advised; not more often than the doctor said", is_active=False,
                          prescribed_by="Dr. Meera Iyer")
        db.add_all([metformin, vitd, amlo, para])
        db.flush()

        # ---------------- documents (real generated files, real extraction pipeline)
        lab_date = c1_date + timedelta(days=4)
        _doc(db, patient, "Blood test report - Greenleaf Diagnostics", "lab_report",
             sample_docs.lab_report_pdf(lab_date), "application/pdf", ".pdf", lab_date, c1.id)
        rx = _doc(db, patient, "Prescription - Dr. Arjun Menon", "prescription",
                  sample_docs.prescription_pdf(c2_date, c2_follow), "application/pdf", ".pdf", c2_date, c2.id)
        c2.source_document_id = rx.id
        note = sample_docs.consultation_note_txt(c3_date, today + timedelta(days=18)).encode()
        nd = _doc(db, patient, "Consultation note - Dr. Meera Iyer", "consultation_note", note, "text/plain", ".txt", c3_date, c3.id)
        c3.source_document_id = nd.id

        # ---------------- appointments
        def at(d: date, h: int, m: int = 0) -> datetime:
            return datetime.combine(d, time(h, m))
        db.add_all([
            Appointment(owner_id=patient.id, title="General check-up", doctor_name="Dr. Meera Iyer", specialty="General Physician",
                        hospital="Sunrise Family Clinic", scheduled_at=at(c1_date, 10, 30), status="completed", consultation_id=c1.id),
            Appointment(owner_id=patient.id, title="Lab report review", doctor_name="Dr. Arjun Menon", specialty="Endocrinologist",
                        hospital="City Care Hospital", scheduled_at=at(c2_date, 11), status="completed", consultation_id=c2.id),
            Appointment(owner_id=patient.id, title="Blood pressure review", doctor_name="Dr. Meera Iyer",
                        hospital="Sunrise Family Clinic", scheduled_at=at(c3_date, 17, 30), status="completed", consultation_id=c3.id),
            Appointment(owner_id=patient.id, title="Repeat HbA1c and fasting blood sugar test", hospital="Greenleaf Diagnostics Laboratory",
                        location="Fictional address, Chennai", scheduled_at=at(today + timedelta(days=5), 8),
                        notes="Fasting test: no food for 10 to 12 hours before. Water is fine.", reminder_minutes_before=720),
            Appointment(owner_id=patient.id, title="Follow-up with Dr. Arjun Menon", doctor_name="Dr. Arjun Menon",
                        specialty="Endocrinologist", hospital="City Care Hospital", scheduled_at=at(c2_follow, 11, 15),
                        is_follow_up=True, consultation_id=c2.id, notes="Bring the repeat lab report."),
            Appointment(owner_id=patient.id, title="Follow-up with Dr. Meera Iyer (BP log)", doctor_name="Dr. Meera Iyer",
                        specialty="General Physician", hospital="Sunrise Family Clinic",
                        scheduled_at=at(today + timedelta(days=18), 17, 0), is_follow_up=True, consultation_id=c3.id,
                        notes="Bring the home blood pressure log."),
        ])
        db.flush()

        # ---------------- reminder history for the last 7 days (fictional dose log)
        for i in range(7, 0, -1):
            ensure_reminders(db, patient.id, today - timedelta(days=i))
        db.flush()
        pattern = ["taken", "taken", "taken", "missed", "taken", "taken", "taken", "taken", "pending", "taken"]
        past = db.scalars(select(Reminder).where(Reminder.owner_id == patient.id, Reminder.kind == "medication",
                                                 Reminder.due_at < datetime.combine(today, time.min)).order_by(Reminder.due_at)).all()
        for i, r in enumerate(past):
            r.status = pattern[i % len(pattern)]
            r.acted_at = r.due_at + timedelta(minutes=12) if r.status != "pending" else None
        ensure_reminders(db, patient.id, today)

        # ---------------- caregiver: Rohan has accepted view-only access to medicines + appointments
        inv = CaregiverInvitation(patient_id=patient.id, caregiver_email=CAREGIVER_EMAIL, caregiver_name="Rohan Sharma",
                                  relationship_label="Brother", token=secrets.token_urlsafe(24),
                                  permissions=["appointments", "medications"], consent_given=True, status="accepted",
                                  expires_at=utcnow() + timedelta(days=7), accepted_at=utcnow(), caregiver_user_id=caregiver.id)
        db.add(inv)
        db.flush()
        for scope in inv.permissions:
            db.add(CaregiverPermission(patient_id=patient.id, caregiver_id=caregiver.id, scope=scope, invitation_id=inv.id))

        # ---------------- index + example conversations (generated by the real pipeline)
        for kind, rows in (("document.upload", db.scalars(select(MedicalDocument).where(MedicalDocument.owner_id == patient.id)).all()),
                           ("consultation.create", [c1, c2, c3])):
            for r in rows:
                audit(db, patient.id, kind, kind.split(".")[0], r.id, detail="seeded demo data")
        reindex_user(db, patient.id)
        db.commit()
        for q in ["What medicines did my doctor prescribe during my previous consultation?",
                  "Do I have an upcoming appointment?"]:
            ans = answer_question(db, patient.id, q, ai_consent=False)
            s = ConversationSession(owner_id=patient.id, title=q[:80], channel="text")
            s.messages = [ConversationMessage(role="user", content=q),
                          ConversationMessage(role="assistant", content=ans.text, answer_type=ans.answer_type,
                                              sources=ans.sources, generator=ans.generator)]
            db.add(s)
        db.commit()

        files = sample_docs.write_demo_files(BACKEND_DIR / "sample_documents", today)
        print("Seeded fictional demo data.")
        print(f"  Patient login:   {DEMO_EMAIL} / {DEMO_PASSWORD}")
        print(f"  Caregiver login: {CAREGIVER_EMAIL} / {CAREGIVER_PASSWORD}")
        print("  Demo upload files:", ", ".join(f.name for f in files))
    finally:
        db.close()


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
