# MediMemory

**Your Medical History, Remembered. Your Healthcare, Understood.**

MediMemory is a personal medical memory and voice assistant. Patients store prescriptions, lab reports and consultation notes, confirm what was extracted, and then ask about their own history by text or by voice through **ElevenLabs** speech-to-text and text-to-speech. Every answer is grounded in the patient's saved records and shows its source.

> Hackathon prototype. All demo data is fictional. MediMemory does not diagnose, does not recommend or change doses, and does not replace a qualified medical professional. It has not been assessed for HIPAA, GDPR or India DPDP compliance.

---

## Contents
1. [Overview](#1-overview) · 2. [Problem](#2-problem-statement) · 3. [Features](#3-features) · 4. [Architecture](#4-architecture) · 5. [Tech stack](#5-technology-stack) · 6. [Database](#6-database-design) · 7. [Installation (Windows)](#7-installation-windows--vs-code) · 8. [Environment variables](#8-environment-variables) · 9. [API](#9-api-documentation) · 10. [ElevenLabs](#10-elevenlabs-configuration) · 11. [AI/RAG](#11-airag-configuration) · 12. [Demo credentials](#12-demo-credentials) · 13. [Testing](#13-testing) · 14. [Known limitations](#14-known-limitations) · 15. [Deployment](#15-deployment)

## 1. Overview
- **Web app** (React + Vite + Tailwind) with 15 pages: landing, login, register, dashboard, medical records, health timeline, upload, document details/review, AI assistant, voice assistant, medications, appointments, consultations, family access, and profile & settings.
- **Backend** (FastAPI + SQLAlchemy) with JWT auth, 59 REST endpoints, Alembic migrations, audit logging and seeded fictional demo data.
- **Document intelligence**: PyMuPDF text extraction, Tesseract OCR for scans and photos, document classification, and extraction of medicines, dates, test values and instructions. Extracted details always go through **patient review and confirmation**.
- **Grounded assistant (RAG)**: per-patient retrieval over documents and structured records, with an optional LLM. Answers carry their sources. If something isn't in the records, it says *"I couldn't find this information in your saved medical records."*
- **ElevenLabs voice**: microphone recording → ElevenLabs Scribe STT → grounded answer → ElevenLabs TTS playback, with waveform, stage indicators, play/pause, conversation history and a typed fallback.

## 2. Problem statement
Patients forget what their doctor said, which medicines were prescribed and when to take them, what previous reports showed, which precautions to follow and when the next follow-up is. This information is scattered across prescriptions, lab reports, hospital papers and notes. MediMemory brings it into one organised place and lets patients ask about it in plain language.

## 3. Features
| Module | What works |
|---|---|
| A. Authentication | Register, login, logout (server-side token revocation), bcrypt hashing, JWT, protected routes, password rules, profile editing, change password, demo accounts |
| B. Dashboard | Personalised welcome, profile summary, counts, today's reminders (mark taken/missed), upcoming appointments, active medicines, 7-day medication log chart (from the patient's own logs), recent consultations and documents, activity timeline, quick actions, empty states |
| Health timeline | Full date-ordered journey (consultations, documents, appointments) with filters and key-insight counts from your own records |
| C. Documents | Upload PDF/PNG/JPG/WEBP/TXT (≤10 MB, content-sniffed), private storage, text extraction, OCR, classification, metadata extraction, preview, search and filters, download, delete, re-extract, **review and confirm** |
| D. AI assistant | Per-patient RAG, source chips with date and status, conversation history, labels for *From your records* / *Not in your records* / *General explanation* / *Safety notice*, distinguishes confirmed from awaiting-confirmation information |
| E. Voice assistant | ElevenLabs STT + TTS, animated mic, recording state, live waveform, transcript preview, stage indicators, speaking animation, play/pause, stop and cancel, history, typed fallback, clear errors when credentials, consent or microphone are missing |
| F. Medications | Add, edit and delete; dose exactly as prescribed; frequency; start and end; instructions; active status; schedules with times and weekdays; daily timeline; in-app reminders (polled every minute) plus optional browser notifications |
| G. Consultations | Doctor, specialty, clinic, date, concerns, notes, confirmed instructions, linked medicines, recommended tests, follow-up, attached documents; create, edit, delete and search |
| H. Appointments | Upcoming and previous, create, edit, delete, follow-up flag, reminder lead time, calendar view |
| I. Family access | Invitation with explicit consent, permission scopes, view-only access, edit scopes, revoke, access history; enforced server-side on every request |
| J. Settings | Personal details, DOB, contact, emergency contact, preferred language, accessibility (larger text, high contrast, reduced motion), voice (voice picker, autoplay, test), privacy (AI & voice consent, reminders), password, recent account activity, logout |

## 4. Architecture
Full diagrams are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**: system architecture, ER diagram, RAG workflow and voice sequence.

```
Browser (React) ──/api──▶ FastAPI ──▶ SQLite/PostgreSQL
   mic/audio                 │ ├──▶ private file storage
                             │ ├──▶ ElevenLabs STT/TTS   (server-side key)
                             │ └──▶ optional LLM/embeddings (only with patient consent)
```

Project layout:
```
medimemory/
  backend/   app/{api,core,database,models,schemas,services,rag,voice,utils}, migrations/, tests/, sample_documents/
  frontend/  src/{components,context,hooks,layouts,pages,services,styles,test}
  docs/      ARCHITECTURE.md, API.md, openapi.json, DEMO_SCRIPT.md, SUBMISSION.md
  scripts/   reset_demo.bat, run_tests.bat, e2e_smoke_test.py, fake_elevenlabs_server.py
  setup.bat  start_backend.bat  start_frontend.bat  start_all.bat  .env.example  docker-compose.yml
```

## 5. Technology stack
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, Lucide React, Recharts, React Router 6, Axios, Vitest + Testing Library
- **Backend:** Python 3.10–3.13, FastAPI, SQLAlchemy 2, Pydantic 2, Alembic, PyJWT, bcrypt, httpx, PyMuPDF, pytesseract, pytest
- **Database:** SQLite (default, zero setup) or PostgreSQL (`DATABASE_URL`)
- **AI:** ElevenLabs Speech-to-Text (`scribe_v1`) and Text-to-Speech (`eleven_multilingual_v2`); any OpenAI-compatible chat and embeddings API (optional)

The only deviation from the requested stack: the LLM is called through the OpenAI-compatible REST format with `httpx` rather than a vendor SDK, so you can use OpenAI, Groq, OpenRouter, a local server and so on by changing `LLM_BASE_URL`.

## 6. Database design
18 normalised tables: `users`, `patient_profiles`, `revoked_tokens`, `medical_documents`, `document_extractions`, `consultations`, `doctor_instructions`, `medications`, `medication_schedules`, `reminders`, `appointments`, `caregiver_invitations`, `caregiver_permissions`, `caregiver_access_logs`, `conversation_sessions`, `conversation_messages`, `document_chunks`, `audit_logs`. They have primary and foreign keys, timestamps and indexes on owner and date columns. Patient-level isolation is applied in every query. See the ER diagram in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- Migrations: `backend/migrations/versions/0001_initial_schema.py` (tested on SQLite and PostgreSQL 16)
- Seed: `python -m app.seed` (or `--reset`), which creates the fictional patient **Ananya Sharma** with 3 consultations, 3 generated documents (lab report PDF, prescription PDF, consultation note), 4 medications (1 past), 6 appointments (3 upcoming), 7 days of dose logs, a linked caregiver, and 2 example conversations generated by the real assistant pipeline.

## 7. Installation (Windows + VS Code)

### Prerequisites (one time)
1. **Python 3.10–3.13**: https://www.python.org/downloads/ (tick **"Add python.exe to PATH"**).
2. **Node.js LTS (20 or 22)**: https://nodejs.org/
3. *(Optional, for scanned documents and photos)* **Tesseract OCR**: https://github.com/UB-Mannheim/tesseract/wiki. After installing, set `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` in `.env`. Typed PDFs and TXT files work without it.

### Quick start
1. Unzip the project and open the `medimemory` folder in VS Code.
2. Double-click **`setup.bat`** (or run it in the VS Code terminal). It checks Python and Node, creates `.env`, creates `backend\.venv`, installs packages, creates the database and loads the demo data, then installs frontend packages.
3. *(Optional)* Open `.env` and add `ELEVENLABS_API_KEY` (and `LLM_API_KEY`).
4. Double-click **`start_backend.bat`** and keep the window open. API: http://127.0.0.1:8000, docs: http://127.0.0.1:8000/docs
5. Double-click **`start_frontend.bat`** and keep the window open. App: **http://localhost:5173**
   (Or run **`start_all.bat`** to open both and launch the browser.)

### Manual setup (what the scripts do)
```bat
copy .env.example .env
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m app.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
In a second terminal:
```bat
cd frontend
npm install
npm run dev
```
If PowerShell blocks `activate`, use Command Prompt, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

### PostgreSQL (optional)
Create a database, set `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/medimemory` in `.env`, then run `python -m alembic upgrade head` and `python -m app.seed`.

### Troubleshooting
| Symptom | Fix |
|---|---|
| "Can't reach the MediMemory server" in the app | `start_backend.bat` isn't running, or port 8000 is in use |
| `python` opens the Microsoft Store | Reinstall Python from python.org with "Add to PATH", or disable the App Execution Alias in Windows Settings |
| Voice page says ElevenLabs isn't configured | Add `ELEVENLABS_API_KEY` to `.env`, then restart the backend |
| Voice page says voice processing is off | Settings → Privacy → turn on **AI & voice processing** (it's on for the demo patient) |
| Microphone blocked | Click the lock icon in the address bar → allow microphone → reload |
| Scanned PDF has no text | Install Tesseract and set `TESSERACT_CMD` |

## 8. Environment variables
All variables are in **`.env`** at the project root (template: `.env.example`). Keys are only read by the backend and are never sent to the browser.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *(empty → SQLite)* | PostgreSQL URL for production |
| `JWT_SECRET_KEY` | dev value | **Change this.** Signs login tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 720 | Session length |
| `CORS_ORIGINS` | localhost:5173 | Allowed frontend origins |
| `ELEVENLABS_API_KEY` | – | Enables voice |
| `ELEVENLABS_STT_MODEL` | `scribe_v1` | Speech-to-text model |
| `ELEVENLABS_TTS_MODEL` | `eleven_multilingual_v2` | Text-to-speech model |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | Default voice (users can change it in Settings) |
| `LLM_API_KEY` | – | Optional; enables AI-worded answers and AI extraction |
| `LLM_BASE_URL` | OpenAI | Any OpenAI-compatible endpoint |
| `LLM_MODEL` | `gpt-4o-mini` | Chat model |
| `EMBEDDING_PROVIDER` | `local` | `local` or `openai` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Used when the provider is `openai` |
| `TESSERACT_CMD` | – | Path to `tesseract.exe` |
| `MAX_UPLOAD_MB` | 10 | Upload limit |
| `RAG_TOP_K` / `RAG_MIN_SCORE` | 5 / 0.12 | Retrieval size and "not found" threshold |
| `STORAGE_DIR` | `backend/storage` | Where uploaded files are kept |

## 9. API documentation
- Interactive Swagger UI: **http://127.0.0.1:8000/docs**
- Endpoint reference: **[docs/API.md](docs/API.md)**. OpenAPI schema: `docs/openapi.json`.

Main groups: `/api/auth/*`, `/api/dashboard`, `/api/timeline`, `/api/search`, `/api/documents/*`, `/api/consultations/*`, `/api/medications/*`, `/api/reminders/*`, `/api/appointments/*`, `/api/assistant/*`, `/api/voice/*`, `/api/caregivers/*`, `/api/caregiving/*`, `/api/audit-logs`.

## 10. ElevenLabs configuration
1. Create an API key at https://elevenlabs.io/app/settings/api-keys. It needs Speech-to-Text and Text-to-Speech permissions.
2. Put it in `.env` as `ELEVENLABS_API_KEY=...` and restart the backend.
3. Log in. The demo patient already has **AI & voice processing** enabled; new users turn it on in Settings → Privacy.
4. Optional: choose a voice in Settings → Voice (loaded from `GET /v1/voices`) and press **Test**.

Endpoints used (server-side only, `xi-api-key` header): `POST /v1/speech-to-text` (multipart `file`, `model_id`, optional `language_code`), `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, `GET /v1/voices`. Reference: https://elevenlabs.io/docs/api-reference

Responses are never simulated. Without a key the API returns 503 and the UI explains how to configure it. `scripts/fake_elevenlabs_server.py` is an **offline stand-in for testing UI wiring only**; it returns a fixed transcript and a beep and must not be used for the demo.

## 11. AI/RAG configuration
- **No keys:** retrieval uses local embeddings, and answers quote the most relevant record sentences with sources ("Here's what your saved records say…"). Fully offline.
- **With `LLM_API_KEY`** (and patient consent): an LLM writes a short, plain-English answer using only the numbered sources. The server validates the cited source ids, falls back to quoting if the provider fails, and adds a safety notice for dose or diagnosis questions. Upload extraction also uses the LLM, and results still require patient confirmation.
- **Semantic embeddings:** set `EMBEDDING_PROVIDER=openai`. Re-indexing happens automatically. You can also call `POST /api/assistant/reindex`.
- Prompts and rules: `backend/app/rag/assistant.py`. Indexing: `rag/indexer.py`. Retrieval: `rag/retriever.py`.

## 12. Demo credentials
| Role | Email | Password |
|---|---|---|
| Patient (Ananya Sharma, fictional) | `demo@medimemory.app` | `Demo@1234` |
| Caregiver (Rohan Sharma, fictional; view-only medicines and appointments) | `caregiver.demo@medimemory.app` | `Care@1234` |

Files for the live upload demo are in `backend/sample_documents/`: a new dermatology prescription PDF, a "scanned" PNG of it for OCR, and a consultation note TXT. Reset the demo at any time with `scripts\reset_demo.bat`. The 3-minute demo flow is in **[docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)**.

## 13. Testing
```bat
scripts\run_tests.bat
```
or manually: `cd backend && .venv\Scripts\activate && python -m pytest -q`, then `cd frontend && npm test`.

- **Backend (pytest, 41 tests):** registration, login, password hashing, protected routes, logout revocation, profile validation, patient data isolation, consultation, medication and appointment CRUD, weekly schedules, reminders, upload validation (type sniffing, size, empty), PDF extraction, OCR (skipped automatically if Tesseract isn't installed), mandatory confirmation, download/delete isolation, RAG retrieval, upcoming-appointment ranking, missing-record behaviour, safety refusals, explanation labelling, cross-patient leakage, pending-status labelling, conversation history, LLM path (mocked provider), LLM fallback, no external calls without consent, ElevenLabs missing-key, consent, provider-error and success paths (mocked), and caregiver consent, scope, revocation and logging.
- **Frontend (Vitest, 14 tests):** login flow and errors, navigation with mobile menu, form validation (password, medication, appointment, consultation, upload), document upload, AI chat with sources and not-found labelling, medication creation, appointment list, delete and calendar.
- **Optional browser smoke test:** `pip install playwright && playwright install chromium`, start both servers, then `python scripts/e2e_smoke_test.py`. It saves screenshots to `scripts/screenshots/`.

## 14. Known limitations
- **Caregiver invitations aren't emailed.** The patient copies the invitation code and shares it. The caregiver needs their own account with the invited email.
- **Reminders are in-app only.** They're checked every minute while the app is open, with optional browser notifications. There's no phone push or SMS, and nothing fires when the app is closed.
- **Local embeddings are lexical, not semantic.** Paraphrased questions match less reliably than with `EMBEDDING_PROVIDER=openai`.
- **Rule-based extraction** (used without an LLM) handles common prescription and lab layouts; unusual layouts may need manual entry in the review form.
- OCR needs Tesseract installed, and handwriting recognition is poor.
- **Security:** tokens are kept in `sessionStorage`, and uploaded files aren't encrypted at rest. There's no rate limiting or MFA, and no regulatory compliance assessment. Use fictional data only.
- Times are server-local, and there's no per-user time zone setting.
- Email can't be changed, and there's no account deletion endpoint.
- The Docker setup is provided as an option but wasn't tested in our build environment; the Windows local setup is the primary path.

## 15. Deployment
- **Docker (optional):** `docker compose up --build`, then open http://localhost:8080. This runs PostgreSQL, the backend (with Tesseract) and nginx serving the built frontend with an `/api` proxy. Fill `.env` first.
- **Manual:** build the frontend with `npm run build` and serve `frontend/dist` from any static host with `/api` proxied to the backend. Run the backend with `uvicorn app.main:app --host 0.0.0.0 --port 8000` behind HTTPS. Set a strong `JWT_SECRET_KEY`, a PostgreSQL `DATABASE_URL`, `CORS_ORIGINS` for your domain, and a persistent `STORAGE_DIR`.
- Run `python -m alembic upgrade head` on every deploy. Only run `python -m app.seed` if you want the demo accounts.
