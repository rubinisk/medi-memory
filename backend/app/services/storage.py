from __future__ import annotations

import uuid
from pathlib import Path

from app.core.config import settings


def _user_dir(owner_id: int) -> Path:
    d = (settings.storage_dir / str(int(owner_id))).resolve()
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_file(owner_id: int, content: bytes, ext: str) -> str:
    """Store under a random server-generated name; the client's filename is never used as a path."""
    name = f"{uuid.uuid4().hex}{ext}"
    (_user_dir(owner_id) / name).write_bytes(content)
    return name


def file_path(owner_id: int, stored_name: str) -> Path:
    base = _user_dir(owner_id)
    p = (base / stored_name).resolve()
    if base not in p.parents:
        raise ValueError("Invalid path")
    return p


def delete_file(owner_id: int, stored_name: str) -> None:
    try:
        file_path(owner_id, stored_name).unlink(missing_ok=True)
    except ValueError:
        pass
