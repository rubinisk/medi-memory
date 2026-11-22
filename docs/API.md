# MediMemory API reference

Base URL in development: `http://127.0.0.1:8000`. Interactive docs (Swagger UI): `http://127.0.0.1:8000/docs`.

All endpoints except `register`, `login` and `health` require `Authorization: Bearer <token>`. Every patient endpoint is scoped to the logged-in user; another patient's records return **404**.

Errors are JSON: `{"detail": "human readable message"}` (validation errors also include `errors: [{field, message}]`).

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Register |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout — Invalidates the current token server-side (it cannot be reused). |
| `GET` | `/api/auth/me` | Me |
| `PATCH` | `/api/auth/me` | Update Me |
| `POST` | `/api/auth/change-password` | Change Password |

## Records

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dashboard` | Dashboard |
| `GET` | `/api/timeline` | Timeline — Complete, date-ordered health journey built from the patient's own records. |
| `GET` | `/api/search` | Search |
| `GET` | `/api/audit-logs` | My Audit Logs |
| `GET` | `/api/health` | Health |

## Documents

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/documents` | Upload Document |
| `GET` | `/api/documents` | List Documents |
| `GET` | `/api/documents/{did}` | Get Document |
| `PATCH` | `/api/documents/{did}` | Update Document |
| `DELETE` | `/api/documents/{did}` | Delete Document |
| `GET` | `/api/documents/{did}/file` | Download Document |
| `POST` | `/api/documents/{did}/reprocess` | Reprocess Document |
| `POST` | `/api/documents/{did}/confirm` | Confirm Document — Patient-reviewed details become part of the medical history. Only now are records created. |

## Consultations

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/consultations` | List Consultations |
| `POST` | `/api/consultations` | Create Consultation |
| `GET` | `/api/consultations/{cid}` | Get Consultation |
| `PUT` | `/api/consultations/{cid}` | Update Consultation |
| `DELETE` | `/api/consultations/{cid}` | Delete Consultation |

## Medications

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/medications` | List Medications |
| `POST` | `/api/medications` | Create Medication |
| `GET` | `/api/medications/{mid}` | Get Medication |
| `PUT` | `/api/medications/{mid}` | Update Medication |
| `DELETE` | `/api/medications/{mid}` | Delete Medication |
| `GET` | `/api/reminders/today` | Reminders For Day |
| `GET` | `/api/reminders/due` | Due Reminders — Pending reminders that are due now (within the last 2 hours). Polled by the web app for in-app notifications. |
| `PATCH` | `/api/reminders/{rid}` | Act On Reminder |
| `GET` | `/api/reminders/history` | Reminder History — Per-day counts of medication doses marked taken / missed / not recorded (from the patient's own logs). |

## Appointments

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/appointments` | List Appointments |
| `POST` | `/api/appointments` | Create Appointment |
| `GET` | `/api/appointments/{aid}` | Get Appointment |
| `PUT` | `/api/appointments/{aid}` | Update Appointment |
| `DELETE` | `/api/appointments/{aid}` | Delete Appointment |

## Assistant

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/assistant/status` | Assistant Status |
| `GET` | `/api/assistant/sessions` | List Sessions |
| `GET` | `/api/assistant/sessions/{sid}` | Get Session |
| `DELETE` | `/api/assistant/sessions/{sid}` | Delete Session |
| `POST` | `/api/assistant/ask` | Ask |
| `POST` | `/api/assistant/reindex` | Reindex |

## Voice

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/voice/status` | Voice Status |
| `POST` | `/api/voice/transcribe` | Transcribe |
| `POST` | `/api/voice/speak` | Speak |
| `GET` | `/api/voice/voices` | Voices |

## Caregivers

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/caregivers/invitations` | List Invitations |
| `POST` | `/api/caregivers/invitations` | Invite |
| `DELETE` | `/api/caregivers/invitations/{iid}` | Revoke Invitation |
| `GET` | `/api/caregivers` | List Caregivers |
| `PUT` | `/api/caregivers/{caregiver_id}/permissions` | Update Permissions |
| `DELETE` | `/api/caregivers/{caregiver_id}` | Revoke Caregiver |
| `GET` | `/api/caregivers/access-log` | Access Log |
| `POST` | `/api/caregiving/accept` | Accept Invitation |
| `GET` | `/api/caregiving/patients` | My Patients |
| `GET` | `/api/caregiving/patients/{patient_id}/{scope}` | View Patient Scope — View-only, scope-limited access. Enforced server-side on every request. |

## Other

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Root |

## Examples

```bash
# log in
curl -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"demo@medimemory.app","password":"Demo@1234"}'

# ask the assistant
curl -X POST http://127.0.0.1:8000/api/assistant/ask -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"question":"What medicines did my doctor prescribe during my previous consultation?"}'

# upload a document
curl -X POST http://127.0.0.1:8000/api/documents -H "Authorization: Bearer $TOKEN" \
  -F file=@backend/sample_documents/demo_new_prescription_dermatology.pdf

# voice: transcribe, then speak
curl -X POST http://127.0.0.1:8000/api/voice/transcribe -H "Authorization: Bearer $TOKEN" -F file=@question.webm
curl -X POST http://127.0.0.1:8000/api/voice/speak -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Hello"}' --output answer.mp3
```

The full machine-readable schema is in `docs/openapi.json`.