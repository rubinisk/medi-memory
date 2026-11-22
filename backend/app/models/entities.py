"""Relational data model for MediMemory.

Every patient-owned table carries an ``owner_id`` (or reaches one through a parent)
so that every query can be scoped to the authenticated patient.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


# ---------------------------------------------------------------- users & auth
class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    profile: Mapped["PatientProfile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class PatientProfile(TimestampMixin, Base):
    __tablename__ = "patient_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(30))
    phone: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(String(255))
    blood_group: Mapped[str | None] = mapped_column(String(10))
    emergency_contact_name: Mapped[str | None] = mapped_column(String(120))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(40))
    emergency_contact_relation: Mapped[str | None] = mapped_column(String(60))
    preferred_language: Mapped[str] = mapped_column(String(20), default="en", nullable=False)
    large_text: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    high_contrast: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reduce_motion: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    voice_id: Mapped[str | None] = mapped_column(String(80))
    voice_autoplay: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Explicit consent before any record text or audio is sent to external AI/voice providers.
    ai_data_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped[User] = relationship(back_populates="profile")


class RevokedToken(Base):
    """JWT ids invalidated by logout."""
    __tablename__ = "revoked_tokens"
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


# ---------------------------------------------------------------- documents
class MedicalDocument(TimestampMixin, Base):
    __tablename__ = "medical_documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(40), default="other", nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    document_date: Mapped[date | None] = mapped_column(Date)
    # uploaded -> pending_review -> confirmed | failed
    status: Mapped[str] = mapped_column(String(30), default="uploaded", nullable=False, index=True)
    consultation_id: Mapped[int | None] = mapped_column(ForeignKey("consultations.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)

    extraction: Mapped["DocumentExtraction"] = relationship(back_populates="document", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (Index("ix_documents_owner_date", "owner_id", "document_date"),)


class DocumentExtraction(TimestampMixin, Base):
    __tablename__ = "document_extractions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("medical_documents.id", ondelete="CASCADE"), unique=True, nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    method: Mapped[str] = mapped_column(String(40), nullable=False)  # pdf_text | ocr | text | llm+... | none
    confidence: Mapped[str] = mapped_column(String(10), default="low", nullable=False)  # low | medium | high
    structured: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    warnings: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    confirmed_data: Mapped[dict | None] = mapped_column(JSON)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)

    document: Mapped[MedicalDocument] = relationship(back_populates="extraction")


# ---------------------------------------------------------------- consultations
class Consultation(TimestampMixin, Base):
    __tablename__ = "consultations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    doctor_name: Mapped[str] = mapped_column(String(120), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(120))
    clinic: Mapped[str | None] = mapped_column(String(200))
    consultation_date: Mapped[date] = mapped_column(Date, nullable=False)
    symptoms: Mapped[str | None] = mapped_column(Text)
    doctor_notes: Mapped[str | None] = mapped_column(Text)
    recommended_tests: Mapped[str | None] = mapped_column(Text)
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default="confirmed", nullable=False)  # confirmed | pending_review
    source_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("medical_documents.id", ondelete="SET NULL", use_alter=True, name="fk_consultation_source_document"))

    instructions: Mapped[list["DoctorInstruction"]] = relationship(back_populates="consultation", cascade="all, delete-orphan", order_by="DoctorInstruction.id")
    medications: Mapped[list["Medication"]] = relationship(back_populates="consultation")

    __table_args__ = (Index("ix_consultations_owner_date", "owner_id", "consultation_date"),)


class DoctorInstruction(TimestampMixin, Base):
    __tablename__ = "doctor_instructions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    consultation_id: Mapped[int] = mapped_column(ForeignKey("consultations.id", ondelete="CASCADE"), index=True, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="confirmed", nullable=False)

    consultation: Mapped[Consultation] = relationship(back_populates="instructions")


# ---------------------------------------------------------------- medications
class Medication(TimestampMixin, Base):
    __tablename__ = "medications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    consultation_id: Mapped[int | None] = mapped_column(ForeignKey("consultations.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    dosage: Mapped[str] = mapped_column(String(120), nullable=False)  # exactly as prescribed
    frequency: Mapped[str] = mapped_column(String(120), nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    instructions: Mapped[str | None] = mapped_column(Text)
    prescribed_by: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="confirmed", nullable=False)

    consultation: Mapped[Consultation | None] = relationship(back_populates="medications")
    schedules: Mapped[list["MedicationSchedule"]] = relationship(back_populates="medication", cascade="all, delete-orphan", order_by="MedicationSchedule.time_of_day")


class MedicationSchedule(Base):
    __tablename__ = "medication_schedules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    medication_id: Mapped[int] = mapped_column(ForeignKey("medications.id", ondelete="CASCADE"), index=True, nullable=False)
    time_of_day: Mapped[str] = mapped_column(String(5), nullable=False)  # "HH:MM"
    label: Mapped[str | None] = mapped_column(String(60))
    # Optional comma-separated weekdays (0=Mon .. 6=Sun). Empty/None = every day.
    days_of_week: Mapped[str | None] = mapped_column(String(20))

    medication: Mapped[Medication] = relationship(back_populates="schedules")


class Reminder(Base):
    """A concrete reminder occurrence (medication dose or appointment) and its outcome."""
    __tablename__ = "reminders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # medication | appointment
    schedule_id: Mapped[int | None] = mapped_column(ForeignKey("medication_schedules.id", ondelete="CASCADE"))
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"))
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending|taken|missed|dismissed
    acted_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("schedule_id", "due_at", name="uq_reminder_schedule_due"),
        Index("ix_reminders_owner_due", "owner_id", "due_at"),
    )


# ---------------------------------------------------------------- appointments
class Appointment(TimestampMixin, Base):
    __tablename__ = "appointments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    doctor_name: Mapped[str | None] = mapped_column(String(120))
    specialty: Mapped[str | None] = mapped_column(String(120))
    hospital: Mapped[str | None] = mapped_column(String(200))
    location: Mapped[str | None] = mapped_column(String(255))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    is_follow_up: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consultation_id: Mapped[int | None] = mapped_column(ForeignKey("consultations.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="scheduled", nullable=False)  # scheduled|completed|cancelled
    reminder_minutes_before: Mapped[int] = mapped_column(Integer, default=1440, nullable=False)

    __table_args__ = (Index("ix_appointments_owner_time", "owner_id", "scheduled_at"),)


# ---------------------------------------------------------------- caregivers
class CaregiverInvitation(TimestampMixin, Base):
    __tablename__ = "caregiver_invitations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    caregiver_email: Mapped[str] = mapped_column(String(255), nullable=False)
    caregiver_name: Mapped[str | None] = mapped_column(String(120))
    relationship_label: Mapped[str | None] = mapped_column(String(60))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    permissions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending|accepted|revoked|expired
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    caregiver_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class CaregiverPermission(Base):
    __tablename__ = "caregiver_permissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    invitation_id: Mapped[int | None] = mapped_column(ForeignKey("caregiver_invitations.id", ondelete="SET NULL"))
    scope: Mapped[str] = mapped_column(String(30), nullable=False)  # medications|appointments|consultations|documents
    access_level: Mapped[str] = mapped_column(String(20), default="view", nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("patient_id", "caregiver_id", "scope", name="uq_caregiver_scope"),)


class CaregiverAccessLog(Base):
    __tablename__ = "caregiver_access_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    scope: Mapped[str] = mapped_column(String(30), nullable=False)
    action: Mapped[str] = mapped_column(String(40), default="view", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


# ---------------------------------------------------------------- assistant
class ConversationSession(TimestampMixin, Base):
    __tablename__ = "conversation_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="New conversation", nullable=False)
    channel: Mapped[str] = mapped_column(String(10), default="text", nullable=False)  # text | voice

    messages: Mapped[list["ConversationMessage"]] = relationship(back_populates="session", cascade="all, delete-orphan", order_by="ConversationMessage.id")


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("conversation_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(15), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    answer_type: Mapped[str | None] = mapped_column(String(30))  # grounded|not_found|explanation|safety|error
    sources: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    generator: Mapped[str | None] = mapped_column(String(40))  # llm | extractive
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    session: Mapped[ConversationSession] = relationship(back_populates="messages")


class DocumentChunk(Base):
    """Searchable text chunk with its embedding. Built from documents AND structured records."""
    __tablename__ = "document_chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)  # document|consultation|medication|appointment
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    source_label: Mapped[str] = mapped_column(String(255), nullable=False)
    source_date: Mapped[date | None] = mapped_column(Date)
    record_status: Mapped[str] = mapped_column(String(30), default="confirmed", nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list] = mapped_column(JSON, nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (Index("ix_chunks_owner_source", "owner_id", "source_type", "source_id"),)


# ---------------------------------------------------------------- audit
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(40))
    resource_id: Mapped[str | None] = mapped_column(String(40))
    detail: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)

