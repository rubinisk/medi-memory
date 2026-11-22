"""Application configuration, loaded from environment variables (.env supported)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent

# Load the project-level .env first, then a backend-level one (backend wins).
load_dotenv(PROJECT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env", override=True)


def _bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None or val.strip() == "":
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


class Settings:
    def __init__(self) -> None:
        self.app_name = "MediMemory API"
        self.environment = os.getenv("ENVIRONMENT", "development")

        # Database: SQLite by default, PostgreSQL via DATABASE_URL.
        default_db = f"sqlite:///{(BACKEND_DIR / 'medimemory.db').as_posix()}"
        self.database_url = os.getenv("DATABASE_URL") or default_db

        # Auth
        self.jwt_secret = os.getenv("JWT_SECRET_KEY") or "dev-only-change-me-please-0123456789abcdef"
        self.jwt_algorithm = "HS256"
        self.access_token_minutes = _int("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 12)

        # CORS
        origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        self.cors_origins = [o.strip() for o in origins.split(",") if o.strip()]

        # File storage
        self.storage_dir = Path(os.getenv("STORAGE_DIR") or (BACKEND_DIR / "storage"))
        self.max_upload_mb = _int("MAX_UPLOAD_MB", 10)

        # LLM (any OpenAI-compatible endpoint)
        self.llm_api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        self.llm_base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.llm_model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        self.embedding_provider = os.getenv("EMBEDDING_PROVIDER", "local").lower()  # local | openai
        self.embedding_model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

        # ElevenLabs
        self.elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY", "")
        self.elevenlabs_base_url = os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io").rstrip("/")
        self.elevenlabs_stt_model = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v1")
        self.elevenlabs_tts_model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2")
        # Default voice: "Rachel" premade voice id. Override in .env or per user in Settings.
        self.elevenlabs_voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

        # OCR
        self.tesseract_cmd = os.getenv("TESSERACT_CMD", "")

        # RAG
        self.rag_top_k = _int("RAG_TOP_K", 5)
        self.rag_min_score = float(os.getenv("RAG_MIN_SCORE", "0.12"))

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_api_key)

    @property
    def elevenlabs_enabled(self) -> bool:
        return bool(self.elevenlabs_api_key)

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
