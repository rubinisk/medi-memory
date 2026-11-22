from __future__ import annotations

import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from app.core.config import settings
from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import User
from app.schemas.core import SpeakIn
from app.services.audit import audit
from app.voice import elevenlabs as el

router = APIRouter(prefix="/api/voice", tags=["voice"])
MAX_AUDIO = 15 * 1024 * 1024
AUDIO_TYPES = ("audio/", "video/webm", "video/mp4", "application/octet-stream")


def _require_consent(user: User) -> None:
    if not (user.profile and user.profile.ai_data_consent):
        raise HTTPException(403, "Voice features send your audio and answers to ElevenLabs. "
                                 "Enable 'AI & voice processing' in Settings to use them.")


def _speakable(text: str) -> str:
    text = re.sub(r"[•*#_`]", "", text)
    text = re.sub(r"\[(.*?)\]", r"(\1)", text)
    return text.strip()[:2500]


@router.get("/status")
def voice_status(user: User = Depends(get_current_user)):
    return {"configured": settings.elevenlabs_enabled, "consent": bool(user.profile and user.profile.ai_data_consent),
            "stt_model": settings.elevenlabs_stt_model, "tts_model": settings.elevenlabs_tts_model,
            "default_voice_id": settings.elevenlabs_voice_id,
            "message": None if settings.elevenlabs_enabled else
            "ElevenLabs API key is not configured on the server. Voice input and playback are unavailable; text chat still works."}


@router.post("/transcribe")
async def transcribe(request: Request, file: UploadFile = File(...), language_code: str | None = Form(None),
                     user: User = Depends(get_current_user), db=Depends(get_db)):
    _require_consent(user)
    audio = await file.read(MAX_AUDIO + 1)
    if not audio:
        raise HTTPException(400, "No audio was received. Please try recording again.")
    if len(audio) > MAX_AUDIO:
        raise HTTPException(413, "Recording is too long. Please keep questions under a couple of minutes.")
    ctype = file.content_type or "application/octet-stream"
    if not ctype.startswith(AUDIO_TYPES):
        raise HTTPException(415, "Unsupported audio format.")
    if language_code and not re.fullmatch(r"[a-z]{2,3}", language_code):
        language_code = None
    try:
        result = el.transcribe(audio, file.filename or "question.webm", ctype, language_code)
    except el.VoiceNotConfigured as exc:
        raise HTTPException(503, str(exc))
    except el.VoiceProviderError as exc:
        raise HTTPException(exc.status, str(exc))
    audit(db, user.id, "voice.transcribe", detail=f"{len(audio)} bytes", ip=client_ip(request))
    db.commit()
    if not result["text"]:
        raise HTTPException(422, "I couldn't hear any words in that recording. Please try again a little closer to the microphone.")
    return result


@router.post("/speak")
def speak(body: SpeakIn, request: Request, user: User = Depends(get_current_user), db=Depends(get_db)):
    _require_consent(user)
    voice_id = body.voice_id or (user.profile.voice_id if user.profile else None)
    try:
        audio = el.synthesize(_speakable(body.text), voice_id)
    except el.VoiceNotConfigured as exc:
        raise HTTPException(503, str(exc))
    except el.VoiceProviderError as exc:
        raise HTTPException(exc.status, str(exc))
    audit(db, user.id, "voice.speak", detail=f"{len(body.text)} chars", ip=client_ip(request))
    db.commit()
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@router.get("/voices")
def voices(user: User = Depends(get_current_user)):
    try:
        return el.list_voices()
    except el.VoiceNotConfigured as exc:
        raise HTTPException(503, str(exc))
    except el.VoiceProviderError as exc:
        raise HTTPException(exc.status, str(exc))
