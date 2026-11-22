"""Pydantic request/response schemas."""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import validate_password_strength


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


# ------------------------------------------------------------------ auth
class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("full_name")
    @classmethod
    def name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Please enter your full name.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong(cls, v: str) -> str:
        return validate_password_strength(v)


class ProfileOut(ORM):
    date_of_birth: date | None = None
    gender: str | None = None
    phone: str | None = None
    address: str | None = None
    blood_group: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relation: str | None = None
    preferred_language: str = "en"
    large_text: bool = False
    high_contrast: bool = False
    reduce_motion: bool = False
    voice_id: str | None = None
    voice_autoplay: bool = True
    ai_data_consent: bool = False
    reminders_enabled: bool = True


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    is_demo: bool
    created_at: datetime
    profile: ProfileOut | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserOut


PHONE_RE = re.compile(r"^[+\d][\d\s\-()]{5,19}$")


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=30)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=255)
    blood_group: str | None = Field(default=None, max_length=10)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=40)
    emergency_contact_relation: str | None = Field(default=None, max_length=60)
    preferred_language: str | None = Field(default=None, max_length=20)
    large_text: bool | None = None
    high_contrast: bool | None = None
    reduce_motion: bool | None = None
    voice_id: str | None = Field(default=None, max_length=80)
    voice_autoplay: bool | None = None
    ai_data_consent: bool | None = None
    reminders_enabled: bool | None = None

    @field_validator("phone", "emergency_contact_phone")
    @classmethod
    def phone_ok(cls, v: str | None) -> str | None:
        v = _clean(v)
        if v and not PHONE_RE.match(v):
            raise ValueError("Enter a valid phone number.")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def dob_ok(cls, v: date | None) -> date | None:
        if v and v > date.today():
            raise ValueError("Date of birth cannot be in the future.")
        return v


# ------------------------------------------------------------------ consultations
class InstructionIn(BaseModel):
    text: str = Field(min_length=2, max_length=2000)


class InstructionOut(ORM):
    id: int
    text: str
    status: str


class ConsultationIn(BaseModel):
    doctor_name: str = Field(min_length=2, max_length=120)
    specialty: str | None = Field(default=None, max_length=120)
    clinic: str | None = Field(default=None, max_length=200)
    consultation_date: date
    symptoms: str | None = Field(default=None, max_length=4000)
    doctor_notes: str | None = Field(default=None, max_length=8000)
    recommended_tests: str | None = Field(default=None, max_length=2000)
    follow_up_date: date | None = None
    instructions: list[str] = Field(default_factory=list)

    @field_validator("instructions")
    @classmethod
    def clean_instr(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s and s.strip()][:50]


class MedicationBrief(ORM):
    id: int
    name: str
    dosage: str
    frequency: str
    is_active: bool


class ConsultationOut(ORM):
    id: int
    doctor_name: str
    specialty: str | None
    clinic: str | None
    consultation_date: date
    symptoms: str | None
    doctor_notes: str | None
    recommended_tests: str | None
    follow_up_date: date | None
    status: str
    source_document_id: int | None
    instructions: list[InstructionOut] = []
    medications: list[MedicationBrief] = []
    documents: list["DocumentBrief"] = []
    created_at: datetime


# ------------------------------------------------------------------ medications
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ScheduleIn(BaseModel):
    time_of_day: str
    label: str | None = Field(default=None, max_length=60)
    days_of_week: str | None = Field(default=None, pattern=r"^[0-6](,[0-6]){0,6}$", description="0=Mon..6=Sun; empty = daily")

    @field_validator("time_of_day")
    @classmethod
    def t(cls, v: str) -> str:
        if not TIME_RE.match(v):
            raise ValueError("Time must be in HH:MM (24-hour) format.")
        return v


class ScheduleOut(ORM):
    id: int
    time_of_day: str
    label: str | None
    days_of_week: str | None = None


class MedicationIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    dosage: str = Field(min_length=1, max_length=120, description="Exactly as prescribed")
    frequency: str = Field(min_length=1, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    instructions: str | None = Field(default=None, max_length=2000)
    prescribed_by: str | None = Field(default=None, max_length=120)
    consultation_id: int | None = None
    is_active: bool = True
    schedules: list[ScheduleIn] = Field(default_factory=list)

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v, info):
        start = info.data.get("start_date")
        if v and start and v < start:
            raise ValueError("End date cannot be before start date.")
        return v


class MedicationOut(ORM):
    id: int
    name: str
    dosage: str
    frequency: str
    start_date: date | None
    end_date: date | None
    instructions: str | None
    prescribed_by: str | None
    consultation_id: int | None
    is_active: bool
    status: str
    schedules: list[ScheduleOut] = []
    created_at: datetime


class ReminderOut(BaseModel):
    id: int
    kind: str
    due_at: datetime
    status: str
    title: str
    detail: str | None = None
    medication_id: int | None = None
    appointment_id: int | None = None


class ReminderAction(BaseModel):
    status: Literal["taken", "missed", "dismissed", "pending"]


# ------------------------------------------------------------------ appointments
class AppointmentIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    doctor_name: str | None = Field(default=None, max_length=120)
    specialty: str | None = Field(default=None, max_length=120)
    hospital: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=255)
    scheduled_at: datetime
    notes: str | None = Field(default=None, max_length=4000)
    is_follow_up: bool = False
    consultation_id: int | None = None
    status: Literal["scheduled", "completed", "cancelled"] = "scheduled"
    reminder_minutes_before: int = Field(default=1440, ge=0, le=10080)


class AppointmentOut(ORM):
    id: int
    title: str
    doctor_name: str | None
    specialty: str | None
    hospital: str | None
    location: str | None
    scheduled_at: datetime
    notes: str | None
    is_follow_up: bool
    consultation_id: int | None
    status: str
    reminder_minutes_before: int
    created_at: datetime


# ------------------------------------------------------------------ documents
class DocumentBrief(ORM):
    id: int
    title: str
    doc_type: str
    status: str
    document_date: date | None
    created_at: datetime


class ExtractionOut(ORM):
    raw_text: str
    method: str
    confidence: str
    structured: dict
    warnings: list
    confirmed_data: dict | None
    confirmed_at: datetime | None


class DocumentOut(ORM):
    id: int
    title: str
    doc_type: str
    original_filename: str
    mime_type: str
    size_bytes: int
    document_date: date | None
    status: str
    consultation_id: int | None
    notes: str | None
    created_at: datetime
    extraction: ExtractionOut | None = None


class ExtractedMedication(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    dosage: str = Field(default="", max_length=120)
    frequency: str = Field(default="", max_length=120)
    instructions: str | None = Field(default=None, max_length=2000)
    times: list[str] = Field(default_factory=list)


class ExtractedTest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    value: str | None = Field(default=None, max_length=60)
    unit: str | None = Field(default=None, max_length=30)
    reference_range: str | None = Field(default=None, max_length=60)


class ConfirmExtractionIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    doc_type: Literal["prescription", "lab_report", "medical_certificate", "consultation_note", "medical_image", "other"]
    document_date: date | None = None
    doctor_name: str | None = Field(default=None, max_length=120)
    specialty: str | None = Field(default=None, max_length=120)
    clinic: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=8000)
    instructions: list[str] = Field(default_factory=list)
    medications: list[ExtractedMedication] = Field(default_factory=list)
    tests: list[ExtractedTest] = Field(default_factory=list)
    follow_up_date: date | None = None
    create_consultation: bool = True
    create_medications: bool = True
    reviewed_against_original: bool = Field(description="Patient confirms they checked the extraction against the original")

    @field_validator("reviewed_against_original")
    @classmethod
    def must_review(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Please confirm you have checked the extracted details against the original document.")
        return v


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    doc_type: str | None = None
    document_date: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


# ------------------------------------------------------------------ assistant
class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    session_id: int | None = None
    channel: Literal["text", "voice"] = "text"


class MessageOut(ORM):
    id: int
    role: str
    content: str
    answer_type: str | None
    sources: list
    generator: str | None
    created_at: datetime


class AskOut(BaseModel):
    session_id: int
    question: MessageOut
    answer: MessageOut


class SessionOut(ORM):
    id: int
    title: str
    channel: str
    created_at: datetime
    updated_at: datetime


class SessionDetail(SessionOut):
    messages: list[MessageOut] = []


# ------------------------------------------------------------------ voice
class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
    voice_id: str | None = Field(default=None, max_length=80)


# ------------------------------------------------------------------ caregivers
SCOPES = ("medications", "appointments", "consultations", "documents")


class InviteIn(BaseModel):
    caregiver_email: EmailStr
    caregiver_name: str | None = Field(default=None, max_length=120)
    relationship_label: str | None = Field(default=None, max_length=60)
    permissions: list[Literal["medications", "appointments", "consultations", "documents"]] = Field(min_length=1)
    consent_given: bool

    @field_validator("consent_given")
    @classmethod
    def consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Explicit consent is required to share your records with a caregiver.")
        return v


class InvitationOut(ORM):
    id: int
    caregiver_email: str
    caregiver_name: str | None
    relationship_label: str | None
    token: str
    permissions: list
    status: str
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime


class AcceptInviteIn(BaseModel):
    token: str = Field(min_length=10, max_length=64)


class UpdatePermissionsIn(BaseModel):
    permissions: list[Literal["medications", "appointments", "consultations", "documents"]]


ConsultationOut.model_rebuild()
