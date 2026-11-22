import os
import shutil
import tempfile
from pathlib import Path

# Isolated temp DB + storage for every test session; never touch dev data or real APIs.
_TMP = Path(tempfile.mkdtemp(prefix="medimemory-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["STORAGE_DIR"] = str(_TMP / "storage")
os.environ["ELEVENLABS_API_KEY"] = ""
os.environ["LLM_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["EMBEDDING_PROVIDER"] = "local"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()
from app.core import config as _cfg  # noqa: E402

_cfg.settings = get_settings()

from app.database.session import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app import models as _models  # noqa: E402,F401  (register tables)


@pytest.fixture(autouse=True)
def fresh_db():
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        Base.metadata.drop_all(conn)
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture
def client():
    return TestClient(app)


def register(client, email="pat@example.com", password="Secret123", name="Test Patient"):
    r = client.post("/api/auth/register", json={"full_name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client):
    return register(client)


@pytest.fixture
def other_auth(client):
    return register(client, email="other@example.com", name="Other Patient")
