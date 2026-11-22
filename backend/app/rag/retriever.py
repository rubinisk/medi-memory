"""Semantic retrieval over a single patient's chunks (never across patients)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import DocumentChunk
from app.rag.embeddings import cosine, embed_texts
from app.rag.indexer import _model_for, reindex_user

RECENT_RE = re.compile(r"\b(last|previous|recent|latest|most recent|earlier)\b", re.I)
UPCOMING_RE = re.compile(r"\b(upcoming|next|future|coming|scheduled|follow[- ]?up)\b", re.I)
TYPE_HINTS = {
    "consultation": re.compile(r"\b(consult\w*|visit\w*|doctor|told|advis\w*|instruct\w*|summar\w*)\b", re.I),
    "medication": re.compile(r"\b(medic\w*|tablet\w*|pill\w*|drug\w*|prescri\w*|dose\w*|dosage)\b", re.I),
    "appointment": re.compile(r"\b(appointment\w*|booking|follow[- ]?up|schedul\w*)\b", re.I),
    "document": re.compile(r"\b(report\w*|lab|blood|test\w*|result\w*|document\w*|certificate)\b", re.I),
}


@dataclass
class Hit:
    chunk: DocumentChunk
    score: float


def retrieve(db: Session, owner_id: int, query: str, top_k: int | None = None) -> list[Hit]:
    top_k = top_k or settings.rag_top_k
    model = _model_for(db, owner_id)
    chunks = list(db.scalars(select(DocumentChunk).where(DocumentChunk.owner_id == owner_id)))
    if chunks and any(c.embedding_model != model for c in chunks):
        reindex_user(db, owner_id)
        db.commit()
        chunks = list(db.scalars(select(DocumentChunk).where(DocumentChunk.owner_id == owner_id)))
    if not chunks:
        return []
    model = chunks[0].embedding_model
    qvec = embed_texts([query], model)[0]

    wants_recent = bool(RECENT_RE.search(query))
    wants_upcoming = bool(UPCOMING_RE.search(query))
    hinted = {t for t, rx in TYPE_HINTS.items() if rx.search(query)}
    today = date.today()

    # rank dates per source type for recency boosting
    dated = sorted({(c.source_type, c.source_date) for c in chunks if c.source_date and c.source_date <= today},
                   key=lambda x: x[1], reverse=True)
    recency_rank: dict[tuple, int] = {}
    for st in {d[0] for d in dated}:
        for i, item in enumerate([d for d in dated if d[0] == st]):
            recency_rank[item] = i

    hits: list[Hit] = []
    for c in chunks:
        base = cosine(qvec, c.embedding)
        score = base
        if hinted and c.source_type in hinted:
            score += 0.06
        if wants_recent and c.source_date and c.source_date <= today:
            r = recency_rank.get((c.source_type, c.source_date), 9)
            score += max(0.0, 0.08 - 0.03 * r)
        if wants_upcoming and c.source_type == "appointment" and c.source_date:
            score += 0.10 if c.source_date >= today else -0.05
        hits.append(Hit(c, score if base > 0 else base))
    hits.sort(key=lambda h: h.score, reverse=True)

    # one best chunk per source first, then fill
    seen, picked = set(), []
    for h in hits:
        key = (h.chunk.source_type, h.chunk.source_id)
        if key in seen:
            continue
        seen.add(key)
        picked.append(h)
        if len(picked) >= top_k:
            break
    return picked
