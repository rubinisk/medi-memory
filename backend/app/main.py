from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import appointments, assistant, auth, caregivers, consultations, documents, medications, records, voice
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="MediMemory: personal medical memory and ElevenLabs voice assistant (hackathon prototype). "
                "Not a medical device; does not diagnose or give dosing advice.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return resp


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Return readable, field-level validation messages for the frontend."""
    errors = []
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", []) if x not in ("body", "query", "path")]
        msg = e.get("msg", "Invalid value").removeprefix("Value error, ")
        errors.append({"field": ".".join(loc), "message": msg})
    first = errors[0] if errors else {"field": "", "message": "Invalid request"}
    detail = f"{first['field'].replace('_', ' ').capitalize()}: {first['message']}" if first["field"] else first["message"]
    return JSONResponse(status_code=422, content={"detail": detail, "errors": errors})


for r in (auth, records, documents, consultations, medications, appointments, assistant, voice, caregivers):
    app.include_router(r.router)


@app.get("/")
def root():
    return {"name": "MediMemory API", "docs": "/docs", "health": "/api/health",
            "llm_configured": settings.llm_enabled, "elevenlabs_configured": settings.elevenlabs_enabled}
