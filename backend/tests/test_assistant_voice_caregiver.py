from datetime import date, datetime, timedelta

import httpx

from tests.conftest import register

NOT_FOUND = "I couldn't find this information in your saved medical records."


def seed_records(client, h):
    client.post("/api/consultations", headers=h, json={
        "doctor_name": "Dr. Old Visit", "consultation_date": str(date.today() - timedelta(days=60)),
        "doctor_notes": "Seasonal allergy review.", "instructions": ["Avoid dust."]})
    c = client.post("/api/consultations", headers=h, json={
        "doctor_name": "Dr. Recent Visit", "consultation_date": str(date.today() - timedelta(days=5)),
        "doctor_notes": "Blood pressure review.", "instructions": ["Reduce salt in food."]}).json()
    client.post("/api/medications", headers=h, json={
        "name": "Amlodipine", "dosage": "5 mg", "frequency": "Once daily", "consultation_id": c["id"],
        "schedules": [{"time_of_day": "08:00"}]})
    client.post("/api/appointments", headers=h, json={
        "title": "Follow-up with Dr. Recent Visit", "scheduled_at": (datetime.now() + timedelta(days=9)).replace(microsecond=0).isoformat(),
        "is_follow_up": True})


def ask(client, h, q):
    r = client.post("/api/assistant/ask", headers=h, json={"question": q})
    assert r.status_code == 200, r.text
    return r.json()["answer"]


def test_rag_retrieves_grounded_answer_with_sources(client, auth):
    seed_records(client, auth)
    a = ask(client, auth, "What medicines did my doctor prescribe during my previous consultation?")
    assert a["answer_type"] == "grounded"
    assert "Amlodipine" in a["content"] and "5 mg" in a["content"]
    assert a["sources"] and a["sources"][0]["status"] == "confirmed"
    assert any("Dr. Recent Visit" in s["label"] or s["source_type"] == "medication" for s in a["sources"])


def test_rag_upcoming_appointment(client, auth):
    seed_records(client, auth)
    a = ask(client, auth, "Do I have an upcoming appointment?")
    assert a["answer_type"] == "grounded"
    assert a["sources"][0]["source_type"] == "appointment"
    assert "upcoming" in a["content"]


def test_missing_record_behaviour(client, auth):
    seed_records(client, auth)
    a = ask(client, auth, "What vaccination did I get for yellow fever?")
    assert a["answer_type"] == "not_found"
    assert a["content"] == NOT_FOUND and a["sources"] == []


def test_empty_account_returns_not_found(client, auth):
    a = ask(client, auth, "What medicines am I taking?")
    assert a["content"] == NOT_FOUND


def test_safety_refuses_dose_change(client, auth):
    seed_records(client, auth)
    a = ask(client, auth, "Should I double my amlodipine dose?")
    assert a["answer_type"] == "safety"
    assert "doctor" in a["content"].lower()


def test_explanation_is_labelled(client, auth):
    a = ask(client, auth, "What does BD mean on my prescription?")
    assert a["answer_type"] == "explanation"
    assert "not from your records" in a["content"]


def test_rag_never_crosses_patients(client, auth, other_auth):
    seed_records(client, auth)
    a = ask(client, other_auth, "What medicines did my doctor prescribe?")
    assert a["content"] == NOT_FOUND


def test_pending_extraction_is_labelled(client, auth):
    note = b"Clinic note\nDr. Pending Person\nAdvice:\n- Take Tab Zincovit 50 mg once daily after food\n- Drink water often\n"
    client.post("/api/documents", headers=auth, files={"file": ("n.txt", note, "text/plain")})
    a = ask(client, auth, "What did Dr. Pending Person advise about Zincovit?")
    assert a["answer_type"] == "grounded"
    assert a["sources"][0]["status"] == "pending_review"
    assert "awaiting your confirmation" in a["content"]


def test_conversation_history(client, auth):
    seed_records(client, auth)
    r = client.post("/api/assistant/ask", headers=auth, json={"question": "When was my previous consultation?"}).json()
    sid = r["session_id"]
    client.post("/api/assistant/ask", headers=auth, json={"question": "And what were the instructions?", "session_id": sid})
    detail = client.get(f"/api/assistant/sessions/{sid}", headers=auth).json()
    assert len(detail["messages"]) == 4
    assert client.delete(f"/api/assistant/sessions/{sid}", headers=auth).status_code == 204


# ---------------------------------------------------------------- voice
def test_voice_requires_configuration(client, auth):
    client.patch("/api/auth/me", headers=auth, json={"ai_data_consent": True})
    st = client.get("/api/voice/status", headers=auth).json()
    assert st["configured"] is False and st["message"]
    r = client.post("/api/voice/speak", headers=auth, json={"text": "hello"})
    assert r.status_code == 503 and "ELEVENLABS_API_KEY" in r.json()["detail"]
    r = client.post("/api/voice/transcribe", headers=auth, files={"file": ("q.webm", b"1234", "audio/webm")})
    assert r.status_code == 503


def test_voice_requires_consent(client, auth):
    r = client.post("/api/voice/speak", headers=auth, json={"text": "hello"})
    assert r.status_code == 403


def test_voice_provider_errors_are_handled(client, auth, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.settings, "elevenlabs_api_key", "test-key")
    client.patch("/api/auth/me", headers=auth, json={"ai_data_consent": True})

    def fake_post(url, **kw):
        assert kw["headers"]["xi-api-key"] == "test-key"  # key stays server-side
        if "speech-to-text" in url:
            return httpx.Response(200, json={"text": "What medicines did my doctor prescribe?", "language_code": "en"})
        return httpx.Response(401, json={"detail": {"message": "invalid key"}})

    monkeypatch.setattr(httpx, "post", fake_post)
    r = client.post("/api/voice/transcribe", headers=auth, files={"file": ("q.webm", b"RIFFxxxx", "audio/webm")})
    assert r.status_code == 200 and r.json()["text"].startswith("What medicines")
    r = client.post("/api/voice/speak", headers=auth, json={"text": "hello"})
    assert r.status_code == 502 and "rejected the API key" in r.json()["detail"]


def test_voice_tts_success_returns_audio(client, auth, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.settings, "elevenlabs_api_key", "test-key")
    client.patch("/api/auth/me", headers=auth, json={"ai_data_consent": True})
    monkeypatch.setattr(httpx, "post", lambda url, **kw: httpx.Response(200, content=b"ID3fake-mp3"))
    r = client.post("/api/voice/speak", headers=auth, json={"text": "• Hello **there**"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content == b"ID3fake-mp3"


# ---------------------------------------------------------------- caregivers
def test_caregiver_flow_enforces_scopes_and_revocation(client, auth):
    seed_records(client, auth)
    r = client.post("/api/caregivers/invitations", headers=auth, json={
        "caregiver_email": "care@example.com", "permissions": ["medications"], "consent_given": False})
    assert r.status_code == 422  # consent required
    inv = client.post("/api/caregivers/invitations", headers=auth, json={
        "caregiver_email": "care@example.com", "permissions": ["medications"], "consent_given": True}).json()

    wrong = register(client, email="someone@example.com", name="Wrong Person")
    assert client.post("/api/caregiving/accept", headers=wrong, json={"token": inv["token"]}).status_code == 403

    cg = register(client, email="care@example.com", name="Care Giver")
    r = client.post("/api/caregiving/accept", headers=cg, json={"token": inv["token"]})
    assert r.status_code == 200
    pid = r.json()["patient_id"]
    meds = client.get(f"/api/caregiving/patients/{pid}/medications", headers=cg)
    assert meds.status_code == 200 and meds.json()[0]["name"] == "Amlodipine"
    # not granted -> forbidden
    assert client.get(f"/api/caregiving/patients/{pid}/consultations", headers=cg).status_code == 403
    # caregiver cannot use the patient's own endpoints
    assert client.get("/api/medications", headers=cg).json() == []
    # access history visible to patient
    assert client.get("/api/caregivers/access-log", headers=auth).json()[0]["scope"] == "medications"
    # revoke
    cid = client.get("/api/caregivers", headers=auth).json()[0]["caregiver_id"]
    assert client.delete(f"/api/caregivers/{cid}", headers=auth).status_code == 204
    assert client.get(f"/api/caregiving/patients/{pid}/medications", headers=cg).status_code == 403
    assert client.post("/api/caregiving/accept", headers=cg, json={"token": inv["token"]}).status_code in (404, 409)


# ---------------------------------------------------------------- LLM path (mocked provider)
def test_llm_answer_is_grounded_and_cites_sources(client, auth, monkeypatch):
    import json as _json
    from app.core import config
    seed_records(client, auth)
    client.patch("/api/auth/me", headers=auth, json={"ai_data_consent": True})
    monkeypatch.setattr(config.settings, "llm_api_key", "test-llm-key")
    seen = {}

    def fake_post(url, **kw):
        assert url.endswith("/chat/completions")
        seen["prompt"] = kw["json"]["messages"][-1]["content"]
        content = _json.dumps({"answer": "Dr. Recent Visit prescribed Amlodipine 5 mg once daily.",
                               "answer_type": "grounded", "source_ids": ["S1"]})
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    a = ask(client, auth, "What medicines did my doctor prescribe during my previous consultation?")
    assert a["generator"] == "llm" and a["answer_type"] == "grounded" and len(a["sources"]) == 1
    assert "[S1] [CONFIRMED]" in seen["prompt"]  # only the patient's retrieved records are sent as context


def test_llm_failure_falls_back_to_extractive(client, auth, monkeypatch):
    from app.core import config
    seed_records(client, auth)
    client.patch("/api/auth/me", headers=auth, json={"ai_data_consent": True})
    monkeypatch.setattr(config.settings, "llm_api_key", "test-llm-key")

    def boom(url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    a = ask(client, auth, "Do I have an upcoming appointment?")
    assert a["generator"] == "extractive" and a["answer_type"] == "grounded"


def test_llm_not_used_without_consent(client, auth, monkeypatch):
    from app.core import config
    seed_records(client, auth)
    monkeypatch.setattr(config.settings, "llm_api_key", "test-llm-key")

    def must_not_call(url, **kw):
        raise AssertionError("external AI called without consent")

    monkeypatch.setattr(httpx, "post", must_not_call)
    a = ask(client, auth, "Do I have an upcoming appointment?")
    assert a["generator"] == "extractive"
