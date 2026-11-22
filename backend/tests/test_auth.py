from tests.conftest import register


def test_register_and_me(client):
    h = register(client)
    r = client.get("/api/auth/me", headers=h)
    assert r.status_code == 200
    assert r.json()["email"] == "pat@example.com"
    assert r.json()["profile"]["ai_data_consent"] is False  # consent is opt-in


def test_register_rejects_weak_password(client):
    r = client.post("/api/auth/register", json={"full_name": "A B", "email": "a@example.com", "password": "short"})
    assert r.status_code == 422
    assert "Password" in r.json()["detail"]


def test_register_duplicate_email(client):
    register(client)
    r = client.post("/api/auth/register", json={"full_name": "X Y", "email": "PAT@example.com", "password": "Secret123"})
    assert r.status_code == 409


def test_login_success_and_failure(client):
    register(client)
    assert client.post("/api/auth/login", json={"email": "pat@example.com", "password": "Secret123"}).status_code == 200
    r = client.post("/api/auth/login", json={"email": "pat@example.com", "password": "Wrong1234"})
    assert r.status_code == 401


def test_password_is_hashed(client):
    register(client)
    from app.database.session import SessionLocal
    from app.models import User
    db = SessionLocal()
    u = db.query(User).first()
    assert u.password_hash != "Secret123" and u.password_hash.startswith("$2")
    db.close()


def test_protected_route_requires_token(client):
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/dashboard", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_logout_invalidates_token(client):
    h = register(client)
    assert client.post("/api/auth/logout", headers=h).status_code == 204
    r = client.get("/api/auth/me", headers=h)
    assert r.status_code == 401


def test_profile_update_and_validation(client, auth):
    r = client.patch("/api/auth/me", headers=auth, json={"phone": "+91 98765 43210", "preferred_language": "ta", "large_text": True})
    assert r.status_code == 200
    assert r.json()["profile"]["preferred_language"] == "ta"
    assert client.patch("/api/auth/me", headers=auth, json={"phone": "abc"}).status_code == 422
    assert client.patch("/api/auth/me", headers=auth, json={"date_of_birth": "2999-01-01"}).status_code == 422


def test_change_password(client, auth):
    r = client.post("/api/auth/change-password", headers=auth, json={"current_password": "Secret123", "new_password": "Newpass123"})
    assert r.status_code == 204
    assert client.post("/api/auth/login", json={"email": "pat@example.com", "password": "Newpass123"}).status_code == 200
