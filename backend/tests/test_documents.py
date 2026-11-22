from datetime import date, timedelta

import pytest

from app.services.extraction import ocr_available
from app.utils.sample_docs import new_prescription_pdf


def upload(client, h, content: bytes, name: str, **data):
    return client.post("/api/documents", headers=h, files={"file": (name, content, "application/octet-stream")}, data=data)


def test_upload_pdf_extracts_but_does_not_confirm(client, auth):
    pdf = new_prescription_pdf(date.today(), date.today() + timedelta(days=14))
    r = upload(client, auth, pdf, "rx.pdf")
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["status"] == "pending_review"
    assert doc["doc_type"] == "prescription"
    ex = doc["extraction"]
    assert ex["method"] == "pdf_text"
    names = [m["name"] for m in ex["structured"]["medications"]]
    assert "Cetirizine" in names
    assert ex["structured"]["doctor_name"] == "Dr. Kavya Rao"
    # Nothing becomes medical history until the patient confirms.
    assert client.get("/api/medications", headers=auth).json() == []
    assert client.get("/api/consultations", headers=auth).json() == []


def test_confirm_requires_review_and_creates_records(client, auth):
    pdf = new_prescription_pdf(date.today(), date.today() + timedelta(days=14))
    doc = upload(client, auth, pdf, "rx.pdf").json()
    s = doc["extraction"]["structured"]
    body = {"title": "Derm prescription", "doc_type": "prescription", "document_date": str(date.today()),
            "doctor_name": s["doctor_name"], "clinic": s["clinic"], "instructions": s["instructions"],
            "medications": s["medications"], "follow_up_date": s["follow_up_date"], "reviewed_against_original": False}
    r = client.post(f"/api/documents/{doc['id']}/confirm", headers=auth, json=body)
    assert r.status_code == 422  # must explicitly confirm review
    body["reviewed_against_original"] = True
    r = client.post(f"/api/documents/{doc['id']}/confirm", headers=auth, json=body)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "confirmed"
    meds = client.get("/api/medications", headers=auth).json()
    assert {m["name"] for m in meds} == {"Cetirizine", "Mometasone"}
    assert len(client.get("/api/consultations", headers=auth).json()) == 1
    assert any(a["is_follow_up"] for a in client.get("/api/appointments", headers=auth).json())
    assert client.post(f"/api/documents/{doc['id']}/confirm", headers=auth, json=body).status_code == 409


def test_upload_validation(client, auth):
    assert upload(client, auth, b"MZ\x90\x00 not allowed", "virus.exe").status_code == 415
    assert upload(client, auth, b"", "empty.pdf").status_code == 400
    # extension lies about the content -> rejected by content sniffing
    assert upload(client, auth, b"just text pretending", "fake.pdf").status_code == 415
    big = b"%PDF-1.4\n" + b"0" * (11 * 1024 * 1024)
    assert upload(client, auth, big, "big.pdf").status_code == 413


def test_text_document_and_search_download_delete(client, auth, other_auth):
    note = b"Clinic note\nDr. Sample Person\nAdvice:\n- Drink plenty of water\n- Walk daily for 20 minutes\n"
    doc = upload(client, auth, note, "note.txt", title="My note").json()
    assert doc["mime_type"] == "text/plain"
    assert client.get("/api/documents?q=plenty", headers=auth).json()[0]["id"] == doc["id"]
    r = client.get(f"/api/documents/{doc['id']}/file?download=true", headers=auth)
    assert r.status_code == 200 and r.content == note and "attachment" in r.headers["content-disposition"]
    assert client.get(f"/api/documents/{doc['id']}/file", headers=other_auth).status_code == 404
    assert client.delete(f"/api/documents/{doc['id']}", headers=other_auth).status_code == 404
    assert client.delete(f"/api/documents/{doc['id']}", headers=auth).status_code == 204
    assert client.get("/api/documents", headers=auth).json() == []


@pytest.mark.skipif(not ocr_available(), reason="Tesseract OCR not installed")
def test_image_ocr_marks_low_confidence(client, auth):
    import pymupdf
    pdf = new_prescription_pdf(date.today(), date.today() + timedelta(days=14))
    png = pymupdf.open(stream=pdf, filetype="pdf")[0].get_pixmap(dpi=150).tobytes("png")
    doc = upload(client, auth, png, "scan.png").json()
    ex = doc["extraction"]
    assert ex["method"] == "ocr" and ex["confidence"] == "low"
    assert any("OCR" in w for w in ex["warnings"])
    assert doc["status"] == "pending_review"
