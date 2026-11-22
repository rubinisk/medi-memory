"""Grounded answer generation.

Rules enforced here (independent of which generator runs):
* answers about medical history come only from the patient's retrieved records;
* if nothing relevant is retrieved the fixed NOT_FOUND message is returned;
* dose-change / diagnosis requests get a safety response that points to a clinician;
* every answer carries its sources and their status (confirmed vs awaiting confirmation).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.rag.embeddings import tokenize
from app.rag.retriever import Hit, retrieve

log = logging.getLogger(__name__)

NOT_FOUND = "I couldn't find this information in your saved medical records."
SAFETY_NOTE = ("I can't recommend changing, stopping or adjusting any medicine, or diagnose a condition. "
               "Please speak to your doctor or pharmacist about this.")

SAFETY_RE = re.compile(
    r"\b(should i|can i|is it ok(ay)? to|shall i)\b.*\b(stop|skip|increase|decrease|double|reduce|change|halve|quit|take more|take less|switch)\b"
    r"|\b(diagnos\w*|what disease|am i sick|is it cancer|what condition do i have)\b"
    r"|\bdo i have (a |an )?(disease|condition|cancer|infection|illness|disorder|diabetes|tumou?r)\b"
    r"|\b(increase|double|reduce|change) (my )?(dose|dosage)\b",
    re.I,
)
EXPLAIN_RE = re.compile(r"\b(explain|what does|what is|what's|meaning of|mean\b|define|in simple)\b", re.I)
RECORD_WORDS_RE = re.compile(r"\b(my|me|i|last|previous|did|was|were)\b", re.I)

GLOSSARY = {
    "od": "OD (once daily) means take it once a day.",
    "bd": "BD or BID (twice daily) means take it two times a day, usually morning and night.",
    "bid": "BID (twice daily) means take it two times a day, usually morning and night.",
    "tds": "TDS or TID (three times daily) means take it three times a day.",
    "tid": "TID (three times daily) means take it three times a day.",
    "qid": "QID means four times a day.",
    "hs": "HS means at bedtime.",
    "sos": "SOS means only when needed, as your doctor described, not on a fixed schedule.",
    "prn": "PRN means only when needed, as your doctor described.",
    "ac": "AC means before food.",
    "pc": "PC means after food.",
    "hba1c": "HbA1c is a blood test that reflects your average blood sugar over roughly the past two to three months.",
    "tsh": "TSH (thyroid stimulating hormone) is a blood test used to check how the thyroid gland is working.",
    "fasting": "A fasting test is done after not eating for a set number of hours (often 8–12), as your lab instructs.",
    "hypertension": "Hypertension is the medical term for high blood pressure.",
    "cbc": "CBC (complete blood count) is a blood test that counts red cells, white cells and platelets.",
    "lipid": "A lipid profile is a blood test that measures cholesterol and triglycerides.",
    "vitamin": "Vitamin D (25-hydroxy) is a blood test that measures your vitamin D level.",
    "ldl": "LDL is often called 'bad' cholesterol; it is one part of a lipid profile.",
    "hdl": "HDL is often called 'good' cholesterol; it is one part of a lipid profile.",
}


@dataclass
class Answer:
    text: str
    answer_type: str  # grounded | not_found | explanation | safety | error
    sources: list[dict] = field(default_factory=list)
    generator: str = "extractive"


def _fmt_date(d: date | None) -> str:
    return d.strftime("%d %b %Y") if d else ""


def _source(h: Hit, excerpt: str | None = None) -> dict:
    c = h.chunk
    return {
        "source_type": c.source_type, "source_id": c.source_id, "label": c.source_label,
        "date": c.source_date.isoformat() if c.source_date else None,
        "status": c.record_status, "excerpt": (excerpt or c.content)[:400], "score": round(h.score, 3),
    }


def _best_sentences(text: str, query: str, n: int = 4) -> str:
    sentences = [s.strip() for s in re.split(r"(?<!\bDr\.)(?<!\bMr\.)(?<!\bMs\.)(?<!\bSt\.)(?<=[.])\s+", text) if s.strip()]
    if len(sentences) <= n:
        return " ".join(sentences)
    q = set(tokenize(query))
    scored = sorted(((len(q & set(tokenize(s))), -i, s) for i, s in enumerate(sentences)), reverse=True)
    keep = sorted(scored[:n], key=lambda x: -x[1])
    return " ".join(s for _, _, s in keep)


def _glossary(question: str) -> list[str]:
    toks = re.findall(r"[a-z0-9]+", question.lower())
    return [GLOSSARY[t] for t in dict.fromkeys(toks) if t in GLOSSARY]


# --------------------------------------------------------------- LLM generator
SYSTEM_PROMPT = """You are MediMemory, a careful assistant that helps a patient recall and understand THEIR OWN saved medical records.
Rules you must follow:
1. For anything about the patient's history (medicines, visits, instructions, results, appointments) use ONLY the numbered SOURCES. Never invent or assume facts.
2. If the sources do not contain the answer, reply exactly: "I couldn't find this information in your saved medical records." and set answer_type to "not_found".
3. Sources marked [AWAITING CONFIRMATION] were extracted automatically and not yet confirmed by the patient. If you use them, say clearly that they are awaiting confirmation.
4. Never diagnose, never recommend starting, stopping or changing a medicine or dose. For such requests set answer_type to "safety" and advise speaking to their doctor or pharmacist.
5. When asked to explain a medical term, you may give a short plain-English general explanation; set answer_type to "explanation" and say it is a general explanation, not from their records.
6. Mention dates and doctor names from the sources. Use plain, warm, simple English, short paragraphs, under 120 words. Quote dosages exactly as written.
Respond ONLY as JSON: {"answer": "...", "answer_type": "grounded|not_found|explanation|safety", "source_ids": ["S1", ...]}"""


def _llm_answer(question: str, hits: list[Hit], history: list[dict]) -> Answer:
    ctx_lines = []
    for i, h in enumerate(hits, 1):
        c = h.chunk
        tag = "CONFIRMED" if c.record_status == "confirmed" else "AWAITING CONFIRMATION"
        ctx_lines.append(f"[S{i}] [{tag}] {c.source_label} (date: {_fmt_date(c.source_date) or 'n/a'})\n{c.content}")
    user = f"Today's date: {date.today():%d %b %Y}\n\nSOURCES:\n" + ("\n\n".join(ctx_lines) or "(none)") + f"\n\nQUESTION: {question}"
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history[-6:] + [{"role": "user", "content": user}]
    resp = httpx.post(
        f"{settings.llm_base_url}/chat/completions",
        headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        json={"model": settings.llm_model, "messages": messages, "temperature": 0.1,
              "response_format": {"type": "json_object"}},
        timeout=60,
    )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]
    data = json.loads(raw)
    atype = data.get("answer_type", "grounded")
    if atype not in {"grounded", "not_found", "explanation", "safety"}:
        atype = "grounded"
    used = []
    for sid in data.get("source_ids", []):
        m = re.match(r"S(\d+)", str(sid))
        if m and 1 <= int(m.group(1)) <= len(hits):
            used.append(_source(hits[int(m.group(1)) - 1]))
    text = (data.get("answer") or "").strip() or NOT_FOUND
    if atype == "grounded" and not used:  # grounded answers must cite something we actually gave it
        if hits:
            used = [_source(hits[0])]
        else:
            atype, text = "not_found", NOT_FOUND
    if atype == "not_found":
        used = []
    return Answer(text=text, answer_type=atype, sources=used, generator="llm")


# --------------------------------------------------------------- extractive generator
def _extractive(question: str, hits: list[Hit], mode: str) -> Answer:
    today = date.today()
    if mode == "safety":
        lines = [SAFETY_NOTE]
        if hits:
            h = hits[0]
            lines.append(f"For reference, your saved record ({h.chunk.source_label}) says: {_best_sentences(h.chunk.content, question, 2)}")
        return Answer("\n\n".join(lines), "safety", [_source(h) for h in hits[:1]])
    if mode == "explanation":
        defs = _glossary(question)
        if defs:
            text = "General explanation (not from your records): " + " ".join(defs)
            return Answer(text, "explanation", [])
        if not hits:
            return Answer("I can only explain a short list of common prescription terms without an AI provider configured, "
                          "and this term isn't one of them. " + NOT_FOUND, "not_found", [])
    if not hits:
        return Answer(NOT_FOUND, "not_found", [])

    lines, sources = ["Here's what your saved records say:"], []
    top = hits[0].score
    for h in [x for x in hits if x.score >= top * 0.7][:3]:
        c = h.chunk
        label_key = re.sub(r"[^a-z0-9]", "", c.source_label.lower())
        content = " ".join(x for x in re.split(r"(?<!\bDr\.)(?<=[.])\s+", c.content)
                           if re.sub(r"[^a-z0-9]", "", x.lower()) not in label_key)
        excerpt = _best_sentences(content or c.content, question)
        flags = []
        if c.record_status != "confirmed":
            flags.append("awaiting your confirmation")
        if c.source_type == "appointment" and c.source_date:
            flags.append("upcoming" if c.source_date >= today else "past")
        flag = f" [{', '.join(flags)}]" if flags else ""
        lines.append(f"• From {c.source_label}{flag}: {excerpt}")
        sources.append(_source(h, excerpt))
    if any(s["status"] != "confirmed" for s in sources):
        lines.append("Some of this comes from a document you haven't confirmed yet, so please check it against the original.")
    return Answer("\n".join(lines), "grounded", sources)


# --------------------------------------------------------------- entry point
def answer_question(db: Session, owner_id: int, question: str, ai_consent: bool, history: list[dict] | None = None) -> Answer:
    mode = "record"
    if SAFETY_RE.search(question):
        mode = "safety"
    elif EXPLAIN_RE.search(question) and (_glossary(question) or not RECORD_WORDS_RE.search(question)):
        mode = "explanation"

    hits = retrieve(db, owner_id, question)
    relevant = [h for h in hits if h.score >= settings.rag_min_score]

    if settings.llm_enabled and ai_consent:
        try:
            ans = _llm_answer(question, relevant, history or [])
            if mode == "safety" and ans.answer_type != "safety":
                ans.text = SAFETY_NOTE + "\n\n" + ans.text
                ans.answer_type = "safety"
            return ans
        except Exception as exc:
            log.warning("LLM generation failed, using extractive fallback: %s", exc)
    return _extractive(question, relevant, mode)
