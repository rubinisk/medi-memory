"""OFFLINE STAND-IN for api.elevenlabs.io: for testing the voice UI wiring only.

It does NOT do real speech recognition or speech synthesis: it always returns the
same transcript and a short beep. Use the real ElevenLabs API for the demo.

    pip install fastapi uvicorn python-multipart
    python -m uvicorn fake_elevenlabs_server:app --port 9001
    # then in .env:  ELEVENLABS_API_KEY=anything   ELEVENLABS_BASE_URL=http://127.0.0.1:9001
"""
import io
import math
import struct
import wave

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import Response

app = FastAPI(title="Fake ElevenLabs (testing only)")


def _beep() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(b"".join(struct.pack("<h", int(6000 * math.sin(2 * math.pi * 440 * i / 16000))) for i in range(16000)))
    return buf.getvalue()


@app.post("/v1/speech-to-text")
async def stt(file: UploadFile = File(...), model_id: str = Form(...)):
    await file.read()
    return {"text": "What medicines did my doctor prescribe during my previous consultation?", "language_code": "en"}


@app.post("/v1/text-to-speech/{voice_id}")
async def tts(voice_id: str):
    return Response(_beep(), media_type="audio/wav")


@app.get("/v1/voices")
def voices():
    return {"voices": [{"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel (fake)", "category": "premade", "labels": {}}]}
