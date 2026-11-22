from datetime import date, datetime, timedelta


def make_consultation(client, h, **kw):
    body = {"doctor_name": "Dr. Test Doctor", "specialty": "General Physician", "consultation_date": str(date.today() - timedelta(days=3)),
            "doctor_notes": "Routine review.", "instructions": ["Drink more water.", "Walk daily."]}
    body.update(kw)
    r = client.post("/api/consultations", headers=h, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_consultation_crud(client, auth):
    c = make_consultation(client, auth)
    assert len(c["instructions"]) == 2 and c["status"] == "confirmed"
    r = client.put(f"/api/consultations/{c['id']}", headers=auth, json={
        "doctor_name": "Dr. Updated", "consultation_date": c["consultation_date"], "instructions": ["Only one now."]})
    assert r.status_code == 200 and r.json()["doctor_name"] == "Dr. Updated" and len(r.json()["instructions"]) == 1
    assert len(client.get("/api/consultations", headers=auth).json()) == 1
    assert client.get("/api/consultations?q=Updated", headers=auth).json()[0]["id"] == c["id"]
    assert client.delete(f"/api/consultations/{c['id']}", headers=auth).status_code == 204
    assert client.get(f"/api/consultations/{c['id']}", headers=auth).status_code == 404


def test_consultation_validation(client, auth):
    r = client.post("/api/consultations", headers=auth, json={"doctor_name": "", "consultation_date": "not-a-date"})
    assert r.status_code == 422


def test_medication_crud_and_reminders(client, auth):
    body = {"name": "Testamol", "dosage": "500 mg", "frequency": "Twice daily", "start_date": str(date.today()),
            "schedules": [{"time_of_day": "08:00", "label": "Morning"}, {"time_of_day": "20:00"}]}
    r = client.post("/api/medications", headers=auth, json=body)
    assert r.status_code == 201, r.text
    med = r.json()
    assert med["dosage"] == "500 mg" and len(med["schedules"]) == 2
    rem = client.get("/api/reminders/today", headers=auth).json()
    assert len([x for x in rem if x["medication_id"] == med["id"]]) == 2
    rid = rem[0]["id"]
    assert client.patch(f"/api/reminders/{rid}", headers=auth, json={"status": "taken"}).json()["status"] == "taken"
    body["dosage"] = "250 mg"
    body["schedules"] = [{"time_of_day": "09:00"}]
    r = client.put(f"/api/medications/{med['id']}", headers=auth, json=body)
    assert r.json()["dosage"] == "250 mg" and len(r.json()["schedules"]) == 1
    assert client.delete(f"/api/medications/{med['id']}", headers=auth).status_code == 204
    assert client.get("/api/medications", headers=auth).json() == []


def test_medication_validation(client, auth):
    bad_time = {"name": "Xx", "dosage": "1", "frequency": "daily", "schedules": [{"time_of_day": "25:00"}]}
    assert client.post("/api/medications", headers=auth, json=bad_time).status_code == 422
    bad_dates = {"name": "Xx", "dosage": "1", "frequency": "daily", "start_date": "2026-02-02", "end_date": "2026-01-01"}
    assert client.post("/api/medications", headers=auth, json=bad_dates).status_code == 422


def test_weekly_schedule_only_on_given_day(client, auth):
    body = {"name": "Weekly D", "dosage": "60000 IU", "frequency": "Once weekly", "start_date": str(date.today() - timedelta(days=10)),
            "schedules": [{"time_of_day": "09:00", "days_of_week": str(date.today().weekday())}]}
    client.post("/api/medications", headers=auth, json=body)
    assert len(client.get("/api/reminders/today", headers=auth).json()) == 1
    tomorrow = date.today() + timedelta(days=1)
    assert client.get(f"/api/reminders/today?day={tomorrow}", headers=auth).json() == []


def test_appointment_crud(client, auth):
    when = (datetime.now() + timedelta(days=5)).replace(microsecond=0).isoformat()
    r = client.post("/api/appointments", headers=auth, json={"title": "Eye check", "hospital": "Test Clinic", "scheduled_at": when})
    assert r.status_code == 201, r.text
    a = r.json()
    assert len(client.get("/api/appointments?when=upcoming", headers=auth).json()) == 1
    assert client.get("/api/appointments?when=past", headers=auth).json() == []
    r = client.put(f"/api/appointments/{a['id']}", headers=auth, json={"title": "Eye check (moved)", "scheduled_at": when, "status": "cancelled"})
    assert r.json()["status"] == "cancelled"
    assert client.delete(f"/api/appointments/{a['id']}", headers=auth).status_code == 204
    assert client.get(f"/api/appointments/{a['id']}", headers=auth).status_code == 404


def test_patient_data_isolation(client, auth, other_auth):
    c = make_consultation(client, auth)
    m = client.post("/api/medications", headers=auth, json={"name": "Private med", "dosage": "1 mg", "frequency": "daily"}).json()
    # The other patient can neither see, edit nor delete these records.
    assert client.get(f"/api/consultations/{c['id']}", headers=other_auth).status_code == 404
    assert client.get("/api/consultations", headers=other_auth).json() == []
    assert client.delete(f"/api/medications/{m['id']}", headers=other_auth).status_code == 404
    assert client.put(f"/api/medications/{m['id']}", headers=other_auth,
                      json={"name": "Hacked", "dosage": "1", "frequency": "x"}).status_code == 404
    assert client.get("/api/search?q=Private", headers=other_auth).json()["results"] == []
    # cannot link to another patient's consultation
    r = client.post("/api/medications", headers=other_auth, json={"name": "Abc", "dosage": "1", "frequency": "x", "consultation_id": c["id"]})
    assert r.status_code == 400


def test_dashboard_and_search(client, auth):
    make_consultation(client, auth, doctor_name="Dr. Searchable")
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["counts"]["consultations"] == 1
    assert d["timeline"][0]["type"] == "consultation"
    res = client.get("/api/search?q=Searchable", headers=auth).json()["results"]
    assert res and res[0]["type"] == "consultation"


def test_audit_log_records_sensitive_actions(client, auth):
    make_consultation(client, auth)
    actions = [x["action"] for x in client.get("/api/audit-logs", headers=auth).json()]
    assert "consultation.create" in actions and "auth.register" in actions


def test_timeline_orders_events_and_counts(client, auth):
    make_consultation(client, auth)
    when = (datetime.now() + timedelta(days=3)).replace(microsecond=0).isoformat()
    client.post("/api/appointments", headers=auth, json={"title": "Review", "scheduled_at": when})
    t = client.get("/api/timeline", headers=auth).json()
    assert [e["type"] for e in t["events"]] == ["appointment", "consultation"]
    assert t["events"][0]["status"] == "upcoming"
    assert t["insights"]["consultations"] == 1 and t["insights"]["upcoming_appointments"] == 1
