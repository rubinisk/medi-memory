"""Thin server-side client for the ElevenLabs REST API.

The API key never leaves the backend. Endpoints used (see https://elevenlabs.io/docs/api-reference):
* POST /v1/speech-to-text           (multipart: file, model_id[, language_code])
* POST /v1/text-to-speech/{voice_id} (json: text, model_id, voice_settings) -> audio/mpeg
* GET  /v1/voices
"""
from __future__ import annotations

import httpx

from app.core.config import settings


class VoiceNotConfigured(Exception):
    pass


class VoiceProviderError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _headers() -> dict:
    if not settings.elevenlabs_enabled:
        raise VoiceNotConfigured(
            "ElevenLabs is not configured. Add ELEVENLABS_API_KEY to the .env file in the MediMemory folder and restart the backend.")
    return {"xi-api-key": settings.elevenlabs_api_key}


def _raise_for(resp: httpx.Response) -> None:
    if resp.status_code < 400:
        return
    try:
        detail = resp.json().get("detail")
        msg = detail.get("message") if isinstance(detail, dict) else str(detail or "")
    except Exception:
        msg = resp.text[:200]
    if resp.status_code == 401:
        raise VoiceProviderError("ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.", 502)
    if resp.status_code == 429:
        raise VoiceProviderError("ElevenLabs rate limit or quota reached. Try again shortly.", 503)
    raise VoiceProviderError(f"ElevenLabs error ({resp.status_code}): {msg or 'unknown error'}", 502)


def transcribe(audio: bytes, filename: str, content_type: str, language_code: str | None = None) -> dict:
    data = {"model_id": settings.elevenlabs_stt_model}
    if language_code:
        data["language_code"] = language_code
    try:
        resp = httpx.post(f"{settings.elevenlabs_base_url}/v1/speech-to-text", headers=_headers(), data=data,
                          files={"file": (filename, audio, content_type)}, timeout=90)
    except httpx.HTTPError as exc:
        raise VoiceProviderError(f"Could not reach ElevenLabs: {type(exc).__name__}", 504)
    _raise_for(resp)
    body = resp.json()
    return {"text": (body.get("text") or "").strip(), "language_code": body.get("language_code"),
            "language_probability": body.get("language_probability")}


def synthesize(text: str, voice_id: str | None = None) -> bytes:
    vid = voice_id or settings.elevenlabs_voice_id
    try:
        resp = httpx.post(
            f"{settings.elevenlabs_base_url}/v1/text-to-speech/{vid}",
            params={"output_format": "mp3_44100_128"},
            headers={**_headers(), "Accept": "audio/mpeg"},
            json={"text": text, "model_id": settings.elevenlabs_tts_model,
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
            timeout=90,
        )
    except httpx.HTTPError as exc:
        raise VoiceProviderError(f"Could not reach ElevenLabs: {type(exc).__name__}", 504)
    _raise_for(resp)
    return resp.content


def list_voices() -> list[dict]:
    try:
        resp = httpx.get(f"{settings.elevenlabs_base_url}/v1/voices", headers=_headers(), timeout=30)
    except httpx.HTTPError as exc:
        raise VoiceProviderError(f"Could not reach ElevenLabs: {type(exc).__name__}", 504)
    _raise_for(resp)
    return [{"voice_id": v.get("voice_id"), "name": v.get("name"), "category": v.get("category"),
             "labels": v.get("labels") or {}} for v in resp.json().get("voices", [])]
