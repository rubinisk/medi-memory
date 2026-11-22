"""Document text extraction, OCR, classification and structured field extraction.

Nothing produced here is treated as confirmed medical information. Results are
stored as ``pending_review`` and only become part of the medical history after
the patient reviews and confirms them.
"""
from __future__ import annotations

import io
import json
import logging
import re
import shutil
from dataclasses import dataclass, field
from datetime import date, datetime

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "text/plain": ".txt",
}
EXT_TO_MIME = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".webp": "image/webp", ".txt": "text/plain"}


# ------------------------------------------------------------------ validation
def sniff_mime(content: bytes, filename: str) -> str | None:
    """Determine the real file type from its bytes (never trust the client's content-type)."""
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if filename.lower().endswith(".txt"):
        try:
            content.decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            return None
    return None


# ------------------------------------------------------------------ OCR
def ocr_available() -> bool:
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        return False
    if settings.tesseract_cmd:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
        return shutil.which(settings.tesseract_cmd) is not None or __import__("os").path.exists(settings.tesseract_cmd)
    return shutil.which("tesseract") is not None


def _ocr_image(img) -> str:
    import pytesseract
    if settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
    return pytesseract.image_to_string(img.convert("L"))


@dataclass
class TextResult:
    text: str
    method: str
    warnings: list[str] = field(default_factory=list)


def extract_text(content: bytes, mime: str) -> TextResult:
    warnings: list[str] = []
    if mime == "text/plain":
        return TextResult(content.decode("utf-8", errors="replace"), "text")
    if mime == "application/pdf":
        import pymupdf
        doc = pymupdf.open(stream=content, filetype="pdf")
        pages = [p.get_text() for p in doc]
        text = "\n".join(pages).strip()
        if len(text) >= 40 * max(1, len(pages)) // 2:
            return TextResult(text, "pdf_text")
        # Probably a scanned PDF -> OCR each page.
        if not ocr_available():
            warnings.append("This PDF looks scanned and OCR (Tesseract) is not installed, so no text could be read. "
                            "Please enter the details manually or install Tesseract.")
            return TextResult(text, "pdf_text", warnings)
        from PIL import Image
        ocr_pages = []
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            ocr_pages.append(_ocr_image(Image.open(io.BytesIO(pix.tobytes("png")))))
        warnings.append("Text was read with OCR from a scanned document. OCR can misread names, numbers and doses; check every field carefully.")
        return TextResult("\n".join(ocr_pages).strip(), "ocr", warnings)
    # images
    if not ocr_available():
        warnings.append("OCR (Tesseract) is not installed, so text could not be read from this image. "
                        "The file is saved; please enter any details manually.")
        return TextResult("", "none", warnings)
    from PIL import Image
    text = _ocr_image(Image.open(io.BytesIO(content))).strip()
    warnings.append("Text was read with OCR from an image. OCR can misread names, numbers and doses; check every field carefully.")
    if len(text) < 20:
        warnings.append("Very little text was found. This may be a photo or scan without readable text.")
    return TextResult(text, "ocr", warnings)


# ------------------------------------------------------------------ classification
_CLASS_KEYWORDS = {
    "prescription": ["rx", "prescription", "tab", "tablet", "cap", "capsule", "syrup", "mg", "once daily", "twice daily", "bd", "od", "tds", "after food", "before food"],
    "lab_report": ["laboratory", "lab", "reference range", "ref. range", "specimen", "sample", "result", "units", "haemoglobin", "hemoglobin", "hba1c", "cholesterol", "pathology", "biological"],
    "medical_certificate": ["certificate", "certify", "certified", "fit to", "unfit", "medical leave", "rest for"],
    "consultation_note": ["consultation", "chief complaint", "complaints", "history", "examination", "assessment", "impression", "plan", "advice", "follow-up"],
}


def classify(text: str, mime: str) -> str:
    low = text.lower()
    if mime.startswith("image/") and len(low.strip()) < 30:
        return "medical_image"
    scores = {k: sum(len(re.findall(r"\b" + re.escape(w) + r"\b", low)) for w in words) for k, words in _CLASS_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "other"


# ------------------------------------------------------------------ rule-based fields
_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b"), "dmy"),
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTHS})[a-z]*\.?,?\s+(\d{{4}})\b", re.I), "d_mon_y"),
    (re.compile(rf"\b({_MONTHS})[a-z]*\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b", re.I), "mon_d_y"),
]
_MON_NUM = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _parse_date(m: re.Match, kind: str) -> date | None:
    try:
        if kind == "ymd":
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if kind == "dmy":
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        if kind == "d_mon_y":
            return date(int(m.group(3)), _MON_NUM[m.group(2).lower()[:3]], int(m.group(1)))
        if kind == "mon_d_y":
            return date(int(m.group(3)), _MON_NUM[m.group(1).lower()[:3]], int(m.group(2)))
    except (ValueError, KeyError):
        return None
    return None


def find_dates(text: str) -> list[tuple[int, date]]:
    found = []
    for rx, kind in DATE_PATTERNS:
        for m in rx.finditer(text):
            d = _parse_date(m, kind)
            if d and 1950 <= d.year <= 2100:
                found.append((m.start(), d))
    return sorted(found)


DOCTOR_RE = re.compile(r"\bDr\.?[ ]+([A-Z][a-zA-Z.]+(?:[ ][A-Z][a-zA-Z.]+){0,3})")
CLINIC_RE = re.compile(r"^.*\b(Hospital|Clinic|Medical Cent(?:re|er)|Diagnostics|Laborator(?:y|ies)|Health ?care|Nursing Home)\b.*$", re.I | re.M)
SPECIALTY_RE = re.compile(r"\b(General Physician|Physician|Cardiolog\w+|Endocrinolog\w+|Dermatolog\w+|Orthopaedic\w*|Orthopedic\w*|Neurolog\w+|Paediatric\w*|Pediatric\w*|Gynaecolog\w+|Gynecolog\w+|ENT|Ophthalmolog\w+|Pulmonolog\w+|Gastroenterolog\w+|Internal Medicine|Family Medicine|Diabetolog\w+|Nephrolog\w+|Psychiatr\w+)\b", re.I)
MED_LINE_RE = re.compile(
    r"^\s*(?:\d+[.)]\s*)?(?:(Tab|Tablet|Cap|Capsule|Syp|Syrup|Inj|Injection|Oint|Ointment|Drops?)\.?\s+)"
    r"(?P<name>[A-Za-z][A-Za-z0-9\-]*(?:[ ][A-Za-z][A-Za-z0-9\-]*){0,2}?)(?=[ ]+\d|[ ]{2,}|[ ]+(?:once|twice|thrice|od|bd|tds|sos)\b|\s*$)\s*"
    r"(?P<dose>\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|units?|%)(?:/\d+\s?(?:mg|ml))?)?"
    r"(?P<rest>.*)$", re.I | re.M)
FREQ_RE = re.compile(
    r"\b(once daily|twice daily|thrice daily|three times (?:a|per) day|two times (?:a|per) day|once (?:a|per) day|"
    r"every \d+ hours|at bedtime|at night|in the morning|weekly|once weekly|od|bd|bid|tds|tid|qid|hs|sos|prn|"
    r"1-0-1|1-0-0|0-0-1|1-1-1|0-1-0|1-1-0|0-1-1)\b", re.I)
TIMING_RE = re.compile(r"\b(after food|before food|after meals?|before meals?|with food|empty stomach|after breakfast|after dinner|before breakfast|before dinner|at bedtime)\b", re.I)
DURATION_RE = re.compile(r"\b(?:for\s+)?(\d+\s+(?:days?|weeks?|months?))\b", re.I)
TEST_LINE_RE = re.compile(
    r"^\s*(?P<name>[A-Za-z][A-Za-z0-9 ()/,.\-]{1,40}?)\s*[:\-]?\s+(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>%|[a-zA-Zµ/]+(?:/[a-zA-Z0-9]+)?)?"
    r"(?:\s+\(?(?:ref(?:erence)?\.?\s*(?:range)?[:\s]*)?(?P<range>(?:<|>|≤|≥)?\s*\d+(?:\.\d+)?\s*(?:-|–|to)?\s*\d*(?:\.\d+)?)\)?)?\s*$",
    re.I | re.M)
INSTR_HINT = re.compile(r"\b(avoid|take|drink|walk|exercise|reduce|limit|continue|monitor|check|follow|keep|eat|diet|rest|sleep|stop smoking|salt|sugar|water|review|repeat)\b", re.I)
SECTION_RE = re.compile(r"^\s*(advice|instructions?|doctor'?s? advice|recommendations?|plan)\s*[:\-]?\s*$", re.I | re.M)

FREQ_TIMES = {
    "od": ["08:00"], "once daily": ["08:00"], "once a day": ["08:00"], "once per day": ["08:00"], "in the morning": ["08:00"],
    "1-0-0": ["08:00"], "0-0-1": ["21:00"], "0-1-0": ["13:00"], "at night": ["21:00"], "at bedtime": ["22:00"], "hs": ["22:00"],
    "bd": ["08:00", "20:00"], "bid": ["08:00", "20:00"], "twice daily": ["08:00", "20:00"], "two times a day": ["08:00", "20:00"],
    "two times per day": ["08:00", "20:00"], "1-0-1": ["08:00", "20:00"], "1-1-0": ["08:00", "13:00"], "0-1-1": ["13:00", "21:00"],
    "tds": ["08:00", "14:00", "20:00"], "tid": ["08:00", "14:00", "20:00"], "thrice daily": ["08:00", "14:00", "20:00"],
    "three times a day": ["08:00", "14:00", "20:00"], "three times per day": ["08:00", "14:00", "20:00"], "1-1-1": ["08:00", "14:00", "20:00"],
    "qid": ["07:00", "12:00", "17:00", "22:00"],
}
TEST_NAME_BLOCKLIST = re.compile(r"\b(age|date|phone|mobile|tel|pin|id|no|patient|page|reg|uhid|sample|bill|invoice|fax)\b", re.I)


def TIME_OK(t: str) -> bool:
    return bool(re.match(r"^([01]\d|2[0-3]):[0-5]\d$", t or ""))


def suggest_times(frequency: str) -> list[str]:
    f = (frequency or "").lower().strip()
    for key, times in FREQ_TIMES.items():
        if re.search(r"\b" + re.escape(key) + r"\b", f):
            return times
    return []


def rule_based_extract(text: str, doc_type: str) -> dict:
    data: dict = {"doctor_name": None, "specialty": None, "clinic": None, "document_date": None, "follow_up_date": None,
                  "medications": [], "tests": [], "instructions": [], "summary": None}
    if not text.strip():
        return data
    dates = find_dates(text)
    if dates:
        data["document_date"] = dates[0][1].isoformat()
    for line in text.splitlines():
        if re.search(r"follow[- ]?up|review (?:on|after)|next visit|revisit", line, re.I):
            ld = find_dates(line)
            if ld:
                data["follow_up_date"] = ld[0][1].isoformat()
                break
    m = DOCTOR_RE.search(text)
    if m:
        data["doctor_name"] = "Dr. " + m.group(1).strip().rstrip(".")
    m = SPECIALTY_RE.search(text)
    if m:
        data["specialty"] = m.group(1)
    m = CLINIC_RE.search(text)
    if m:
        data["clinic"] = m.group(0).strip()[:200]

    for mm in MED_LINE_RE.finditer(text):
        rest = mm.group("rest") or ""
        freq = FREQ_RE.search(rest)
        timing = TIMING_RE.search(rest)
        dur = DURATION_RE.search(rest)
        name = mm.group("name").strip()
        if len(name) < 3:
            continue
        frequency = freq.group(1) if freq else ""
        instr = ", ".join(x for x in [timing.group(1) if timing else None, f"for {dur.group(1)}" if dur else None] if x)
        data["medications"].append({
            "name": name, "dosage": (mm.group("dose") or "").strip(), "frequency": frequency,
            "instructions": instr or None,
            "times": (["22:00"] if timing and "bedtime" in timing.group(1).lower() and len(suggest_times(frequency)) == 1
                      else suggest_times(frequency)),
        })

    if doc_type in ("lab_report", "other", "consultation_note"):
        for mm in TEST_LINE_RE.finditer(text):
            name = mm.group("name").strip(" :-")
            if TEST_NAME_BLOCKLIST.search(name) or len(name) < 2 or MED_LINE_RE.match(mm.group(0)):
                continue
            data["tests"].append({"name": name, "value": mm.group("value"), "unit": (mm.group("unit") or "").strip() or None,
                                  "reference_range": (mm.group("range") or "").strip() or None})
        data["tests"] = data["tests"][:40]

    lines = [l.strip(" •-*\t") for l in text.splitlines()]
    in_section = False
    for raw, line in zip(text.splitlines(), lines):
        if SECTION_RE.match(raw):
            in_section = True
            continue
        if not line:
            continue
        if in_section and re.match(r"^[A-Z][A-Za-z ]{2,30}:\s*$", line):
            in_section = False
        bullet = raw.strip().startswith(("-", "•", "*")) or re.match(r"^\s*\d+[.)]\s", raw)
        if re.search(r"follow[- ]?up|next visit", line, re.I) and find_dates(line):
            continue
        if (in_section or bullet) and INSTR_HINT.search(line) and not MED_LINE_RE.match(raw) and 6 < len(line) < 300:
            data["instructions"].append(line)
    data["instructions"] = list(dict.fromkeys(data["instructions"]))[:20]
    return data


# ------------------------------------------------------------------ LLM extraction
LLM_EXTRACT_PROMPT = """Extract information from this medical document text. Copy values EXACTLY as written; do not interpret,
correct, convert or add anything. If a field is absent, use null or an empty list. Do not guess.
Return JSON with keys: doc_type (prescription|lab_report|medical_certificate|consultation_note|other), document_date (YYYY-MM-DD or null),
doctor_name, specialty, clinic, follow_up_date (YYYY-MM-DD or null), summary (1-2 neutral sentences describing what the document contains),
medications: [{name, dosage, frequency, instructions}], tests: [{name, value, unit, reference_range}], instructions: [string]."""


def llm_extract(text: str) -> dict | None:
    if not settings.llm_enabled or not text.strip():
        return None
    resp = httpx.post(
        f"{settings.llm_base_url}/chat/completions",
        headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        json={"model": settings.llm_model, "temperature": 0,
              "response_format": {"type": "json_object"},
              "messages": [{"role": "system", "content": LLM_EXTRACT_PROMPT},
                           {"role": "user", "content": text[:12000]}]},
        timeout=90,
    )
    resp.raise_for_status()
    return json.loads(resp.json()["choices"][0]["message"]["content"])


@dataclass
class ExtractionResult:
    raw_text: str
    method: str
    doc_type: str
    confidence: str
    structured: dict
    warnings: list[str]


def process_document(content: bytes, mime: str, use_llm: bool) -> ExtractionResult:
    tr = extract_text(content, mime)
    doc_type = classify(tr.text, mime)
    structured = rule_based_extract(tr.text, doc_type)
    method = tr.method
    warnings = list(tr.warnings)
    if use_llm:
        try:
            llm = llm_extract(tr.text)
            if llm:
                for key in ("document_date", "follow_up_date"):
                    try:
                        if llm.get(key):
                            datetime.strptime(llm[key], "%Y-%m-%d")
                    except (TypeError, ValueError):
                        llm[key] = None
                for k, v in llm.items():
                    if k == "doc_type":
                        if v in _CLASS_KEYWORDS or v == "other":
                            doc_type = v
                    elif v not in (None, "", []):
                        structured[k] = v
                for med in structured.get("medications", []):
                    med.setdefault("times", suggest_times(med.get("frequency") or ""))
                method = f"{tr.method}+llm"
        except Exception as exc:
            log.warning("LLM extraction failed: %s", exc)
            warnings.append("AI extraction was unavailable, so basic pattern matching was used instead.")
    has_fields = any(structured.get(k) for k in ("medications", "tests", "instructions", "doctor_name"))
    if tr.method == "ocr" or not tr.text.strip():
        confidence = "low"
    elif has_fields:
        confidence = "medium"
    else:
        confidence = "low"
    if not has_fields and tr.text.strip():
        warnings.append("No medicines, test values or instructions were recognised automatically. Add them manually if needed.")
    if structured.get("doctor_name") is None and doc_type in ("prescription", "consultation_note"):
        warnings.append("Doctor's name was not detected.")
    return ExtractionResult(tr.text, method, doc_type, confidence, structured, warnings)
