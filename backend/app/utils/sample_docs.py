"""Generates clearly-fictional sample medical documents (PDF / PNG / TXT) for the demo."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pymupdf

FICTION = "SAMPLE DOCUMENT - FICTIONAL DATA FOR DEMONSTRATION ONLY - NOT A REAL MEDICAL RECORD"


def _pdf(lines: list[tuple[str, float, bool]]) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((40, 30), FICTION, fontsize=7.5, color=(0.75, 0.1, 0.1))
    y = 70
    for text, size, bold in lines:
        if text == "":
            y += size
            continue
        page.insert_text((50, y), text, fontsize=size, fontname="helv" if not bold else "hebo", color=(0.05, 0.13, 0.27))
        y += size + 7
    out = doc.tobytes()
    doc.close()
    return out


def d(x: date) -> str:
    return x.strftime("%d/%m/%Y")


def lab_report_pdf(report_date: date) -> bytes:
    return _pdf([
        ("Greenleaf Diagnostics Laboratory", 16, True),
        ("12 Example Road, Chennai (fictional address)", 9, False),
        ("", 8, False),
        ("LABORATORY REPORT", 13, True),
        (f"Patient: Ananya Sharma    Age/Sex: 34 / F    Report date: {d(report_date)}", 10, False),
        ("Referred by: Dr. Meera Iyer    Sample: Venous blood (fasting)", 10, False),
        ("", 8, False),
        ("Test                         Result   Unit     Reference range", 10, True),
        ("Fasting Blood Glucose        118      mg/dL    70 - 99", 10, False),
        ("HbA1c                        6.4      %        4.0 - 5.6", 10, False),
        ("Vitamin D (25-OH)            14       ng/mL    30 - 100", 10, False),
        ("Haemoglobin                  12.6     g/dL     12.0 - 15.5", 10, False),
        ("TSH                          2.1      uIU/mL   0.4 - 4.0", 10, False),
        ("", 8, False),
        ("Remarks: Please correlate clinically. Values outside the reference range are for your doctor to interpret.", 9, False),
        ("Verified by: Lab technologist (fictional)", 9, False),
    ])


def prescription_pdf(rx_date: date, follow_up: date) -> bytes:
    return _pdf([
        ("City Care Hospital - Endocrinology Clinic", 16, True),
        ("Dr. Arjun Menon, MD - Endocrinologist (fictional)", 10, False),
        ("", 8, False),
        ("PRESCRIPTION", 13, True),
        (f"Patient: Ananya Sharma    Date: {d(rx_date)}", 10, False),
        ("Reviewed lab report from Greenleaf Diagnostics.", 10, False),
        ("", 6, False),
        ("Rx", 12, True),
        ("1. Tab Metformin 500 mg  twice daily after food  for 3 months", 10, False),
        ("2. Cap Vitamin D3 60000 IU  once weekly  after food  for 8 weeks", 10, False),
        ("", 6, False),
        ("Advice:", 11, True),
        ("- Walk for 30 minutes at least 5 days a week", 10, False),
        ("- Avoid sugary drinks and sweets", 10, False),
        ("- Take Metformin with meals to reduce stomach upset", 10, False),
        ("- Repeat HbA1c and fasting blood sugar before the next visit", 10, False),
        ("", 6, False),
        (f"Follow-up on {d(follow_up)}", 10, True),
        ("Signature: Dr. Arjun Menon", 10, False),
    ])


def new_prescription_pdf(rx_date: date, follow_up: date) -> bytes:
    """A NEW prescription NOT in the seeded records - used for the live upload demo."""
    return _pdf([
        ("Lakeview Medical Centre", 16, True),
        ("Dr. Kavya Rao - Dermatologist (fictional)", 10, False),
        ("", 8, False),
        ("PRESCRIPTION", 13, True),
        (f"Patient: Ananya Sharma    Date: {d(rx_date)}", 10, False),
        ("", 6, False),
        ("Rx", 12, True),
        ("1. Tab Cetirizine 10 mg  once daily at bedtime  for 10 days", 10, False),
        ("2. Oint Mometasone 0.1%  twice daily  thin layer on affected area for 7 days", 10, False),
        ("", 6, False),
        ("Advice:", 11, True),
        ("- Avoid hot showers and scented soaps", 10, False),
        ("- Keep the skin moisturised", 10, False),
        ("- Return earlier if the rash spreads", 10, False),
        ("", 6, False),
        (f"Follow-up on {d(follow_up)}", 10, True),
        ("Signature: Dr. Kavya Rao", 10, False),
    ])


def consultation_note_txt(visit: date, follow_up: date) -> str:
    return f"""{FICTION}

Sunrise Family Clinic - Consultation note
Dr. Meera Iyer, General Physician (fictional)
Date: {d(visit)}
Patient: Ananya Sharma

Complaints: Occasional headaches in the evening for two weeks.
Examination: Blood pressure measured in clinic was higher than her previous reading.

Advice:
- Take Tab Amlodipine 5 mg once daily in the morning
- Reduce salt in food and avoid packaged snacks
- Check blood pressure at home twice a week and keep a written log
- Bring the BP log to the next visit

Follow-up on {d(follow_up)}
"""


def write_demo_files(folder: Path, today: date) -> list[Path]:
    from datetime import timedelta
    folder.mkdir(parents=True, exist_ok=True)
    rx = folder / "demo_new_prescription_dermatology.pdf"
    rx.write_bytes(new_prescription_pdf(today, today + timedelta(days=14)))
    # A "scanned" image version of the same prescription for OCR testing
    doc = pymupdf.open(stream=rx.read_bytes(), filetype="pdf")
    png = folder / "demo_scanned_prescription.png"
    png.write_bytes(doc[0].get_pixmap(dpi=150).tobytes("png"))
    doc.close()
    note = folder / "demo_consultation_note.txt"
    note.write_text(consultation_note_txt(today, today + timedelta(days=21)), encoding="utf-8")
    return [rx, png, note]
