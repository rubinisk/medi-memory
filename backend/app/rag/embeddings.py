"""Embedding providers.

* ``local``  – deterministic hashed bag-of-words/bigram vectors with light medical
  normalisation. Runs offline, sends nothing anywhere. Good enough for a small
  personal record set; it is lexical, not truly semantic.
* ``openai`` – OpenAI-compatible ``/embeddings`` endpoint (true semantic vectors).
  Only used when configured AND the patient has given AI data consent.
"""
from __future__ import annotations

import hashlib
import math
import re

import httpx

from app.core.config import settings

LOCAL_MODEL = "local-hash-v1"
DIM = 768

_SYNONYMS = {
    "medicine": "medication", "medicines": "medication", "meds": "medication", "tablet": "medication",
    "tablets": "medication", "pill": "medication", "pills": "medication", "drug": "medication",
    "drugs": "medication", "capsule": "medication", "capsules": "medication", "prescribed": "prescription",
    "prescribe": "prescription", "prescriptions": "prescription", "rx": "prescription",
    "visit": "consultation", "visits": "consultation", "checkup": "consultation", "consult": "consultation",
    "consultations": "consultation", "saw": "consultation", "told": "instruction", "advice": "instruction",
    "advised": "instruction", "instructions": "instruction", "precaution": "instruction",
    "precautions": "instruction", "blood": "lab", "report": "lab", "reports": "lab", "test": "lab",
    "tests": "lab", "result": "lab", "results": "lab", "investigation": "lab",
    "appointments": "appointment", "booking": "appointment", "scheduled": "appointment",
    "followup": "followup", "follow": "followup", "review": "followup", "next": "upcoming",
    "upcoming": "upcoming", "future": "upcoming", "dr": "doctor", "physician": "doctor",
    "sugar": "glucose", "bp": "pressure",
}
_STOP = set("a an the of to in on at for and or is are was were be been my me i you your what which when who how did do does "
            "can could would should please tell about with from that this it as by any have has had".split())


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    out = []
    for w in words:
        if w in _STOP or len(w) < 2:
            continue
        w = _SYNONYMS.get(w, w)
        if len(w) > 4:
            for suf in ("ing", "ed", "es", "s"):
                if w.endswith(suf) and len(w) - len(suf) >= 4:
                    w = w[: -len(suf)]
                    break
        out.append(w)
    return out


def _h(token: str) -> tuple[int, float]:
    d = hashlib.md5(token.encode()).digest()
    idx = int.from_bytes(d[:4], "little") % DIM
    sign = 1.0 if d[4] & 1 else -1.0
    return idx, sign


def local_embed(text: str) -> list[float]:
    toks = tokenize(text)
    vec = [0.0] * DIM
    feats = toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]
    for f in feats:
        i, s = _h(f)
        vec[i] += s * (0.6 if "_" in f else 1.0)
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 5) for v in vec]


def active_model(consent: bool) -> str:
    if settings.embedding_provider == "openai" and settings.llm_enabled and consent:
        return settings.embedding_model
    return LOCAL_MODEL


def embed_texts(texts: list[str], model: str) -> list[list[float]]:
    if model == LOCAL_MODEL:
        return [local_embed(t) for t in texts]
    resp = httpx.post(
        f"{settings.llm_base_url}/embeddings",
        headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        json={"model": model, "input": texts},
        timeout=60,
    )
    resp.raise_for_status()
    data = sorted(resp.json()["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in data]


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)
