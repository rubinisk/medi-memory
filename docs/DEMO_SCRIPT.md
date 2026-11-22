# Three-minute hackathon demo script

**Before you start:** backend and frontend running, `ELEVENLABS_API_KEY` set in `.env`, the browser has microphone permission, and you're logged out. Optional: `LLM_API_KEY` for more natural wording. Run `scripts\reset_demo.bat` beforehand for a clean demo account. Have `backend\sample_documents\demo_new_prescription_dermatology.pdf` ready to upload.

| Time | What to show | What to say |
|---|---|---|
| 0:00–0:20 | Landing page | "After a doctor's visit, most of us forget part of what we were told: which medicine, when, what the report said, when to go back. The information is scattered across prescriptions, lab reports and memory. MediMemory is a personal medical memory you can talk to." |
| 0:20–0:45 | Click **Try the demo patient**, then the dashboard | "This is Ananya, a fictional patient. Her consultations, medicines, reports and appointments are organised in one place: today's reminders, upcoming follow-ups, a medication log and a health timeline." |
| 0:45–1:20 | **Medical Records → Upload document** → upload the dermatology PDF | "Here's a new prescription. MediMemory reads it, finds the doctor, both medicines with doses and frequencies, the advice and the follow-up date. It does **not** save anything automatically. The patient checks it against the original, ticks the confirmation, and only then does it become part of her history, with medicines, reminders and a follow-up appointment created." Tick the box, then click **Confirm and save**. |
| 1:20–1:50 | **AI Assistant** → click the suggestion "What medicines did my doctor prescribe during my previous consultation?" | "The answer comes only from her own records, and it shows the source and date. If something isn't in her records…" type *"What surgery did I have?"* "…it says so instead of making something up. It won't diagnose or change doses either." |
| 1:50–2:30 | **Voice Assistant** → tap the mic, ask the same question aloud | "This is where ElevenLabs comes in. Speech-to-text transcribes her question with Scribe, the same grounded assistant answers, and ElevenLabs text-to-speech reads it back in a natural voice. That matters for elderly patients and anyone who finds typing hard." Point out the transcript, the stage indicators and the play/pause control. |
| 2:30–2:50 | **Medications**, then **Family Access** | "Medicines are stored exactly as prescribed, with a daily timeline and reminders she can mark as taken or missed. With her explicit consent, her brother has view-only access to medicines and appointments. She can revoke it at any time and see when he looked." |
| 2:50–3:00 | Back to the dashboard | "MediMemory: your medical history, remembered; your healthcare, understood. It doesn't replace your doctor. It helps you remember and follow what they told you." |

## Backup plan

- **No internet or ElevenLabs quota:** the Voice page shows a clear banner. Use **Type instead**; the answer still appears with sources. Say that the voice path is implemented and covered by automated tests with a mocked provider.
- **No LLM key:** answers are worded as quotes from the records ("Here's what your saved records say…"). This is the designed fallback, not an error.
- **Microphone blocked:** click the lock icon in the address bar, allow the microphone, and reload.
