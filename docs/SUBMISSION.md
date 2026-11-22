# Hackathon submission content

## Project title
MediMemory

## Tagline
Your Medical History, Remembered. Your Healthcare, Understood.

## Problem it solves
After a consultation, patients often forget what their doctor told them: which medicines to take and when, what a lab report showed, which precautions to follow and when to come back. That information is scattered across paper prescriptions, PDF reports, clinic notes and memory, and medical shorthand ("BD", "SOS", "HbA1c") makes it harder to understand. The result is confusion, missed doses, missed follow-ups, and family members who are asked to remember advice they never heard.

MediMemory is a personal medical memory. Patients upload prescriptions, reports and notes; MediMemory extracts the key details and asks the patient to confirm them before anything becomes part of their history. They can then ask questions in plain language, by typing or by voice through ElevenLabs speech-to-text and text-to-speech, and get answers grounded only in their own records, with the source document and date shown. If the answer isn't in the records, it says so. It organises medicines exactly as prescribed with daily reminders, tracks appointments and follow-ups, and lets patients share selected sections, view-only, with a caregiver they choose. It never diagnoses, never suggests dose changes, and doesn't replace a doctor.

## Challenges we ran into
*(Edit to match your team's actual experience.)*

- **Not inventing medical history.** A general chatbot will confidently fill gaps. We restricted retrieval to the logged-in patient's chunks, added a similarity threshold that returns a fixed "I couldn't find this…" answer, required LLM answers to cite source ids we supplied (validated server-side), and added a safety path for dose-change and diagnosis questions.
- **Uncertain extraction.** OCR and pattern matching misread names and doses. Instead of trying to make extraction perfect, we made confirmation mandatory: extracted data is stored as `pending_review`, the review screen shows the original beside the fields, and the API rejects confirmation unless the patient ticks that they checked it. Pending information is labelled as such when the assistant uses it.
- **Working without paid APIs.** We built fallbacks so the app still works without keys: local embeddings and an extractive answer mode when no LLM is configured, and a clear 503 with setup instructions when ElevenLabs isn't configured.
- **Voice in the browser.** Browsers record in different formats (webm/opus, mp4). We detect a supported MIME type, send the right file extension to ElevenLabs Scribe, and handle denied microphones, empty recordings and provider errors with specific messages.
- **Privacy defaults.** Sending health text to external AI needs consent, so new accounts start with AI & voice processing off, and every external call checks it.
- **Known gaps we did not solve:** see "Known limitations" in the README (no email delivery for caregiver invites, no background push notifications, lexical local embeddings, no compliance assessment).

## Tracks applied
Recommended: **the ElevenLabs track**, because ElevenLabs Speech-to-Text and Text-to-Speech are core to the voice-first experience. Before submitting, check this against the hackathon's published track descriptions and use the exact track name given there.

## Project links
- GitHub repository: `<add link>`
- Live demo: `<add link, or "local demo, see README">`
- Presentation: `<add link>`
- Demo video (if required): `<add link>`

## Builders
| Name | Role | GitHub / LinkedIn |
|---|---|---|
| `<name>` | `<role>` | `<link>` |
| `<name>` | `<role>` | `<link>` |

## Platforms
Web (responsive for desktop and mobile browsers). The backend is a plain REST/JSON API with token auth, so a native mobile app (for example React Native) can be added later without backend changes.

## Built with
React, Vite, Tailwind CSS, Lucide icons, Recharts, React Router, Axios · Python, FastAPI, SQLAlchemy, Pydantic, Alembic, JWT, bcrypt · SQLite / PostgreSQL · PyMuPDF, Tesseract OCR · ElevenLabs Speech-to-Text (Scribe) and Text-to-Speech · optional OpenAI-compatible LLM and embeddings.
