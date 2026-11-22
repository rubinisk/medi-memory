from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.deps import client_ip, get_current_user
from app.database.session import get_db
from app.models import ConversationMessage, ConversationSession, User, utcnow
from app.rag.assistant import answer_question
from app.rag.indexer import reindex_user
from app.schemas.core import AskIn, AskOut, MessageOut, SessionDetail, SessionOut
from app.services.audit import audit

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


def _session(db: Session, user_id: int, sid: int) -> ConversationSession:
    s = db.scalar(select(ConversationSession).options(selectinload(ConversationSession.messages))
                  .where(ConversationSession.id == sid, ConversationSession.owner_id == user_id))
    if not s:
        raise HTTPException(404, "Conversation not found.")
    return s


@router.get("/status")
def assistant_status(user: User = Depends(get_current_user)):
    consent = bool(user.profile and user.profile.ai_data_consent)
    return {
        "llm_configured": settings.llm_enabled,
        "ai_consent": consent,
        "mode": "llm" if settings.llm_enabled and consent else "extractive",
        "model": settings.llm_model if settings.llm_enabled else None,
        "embeddings": "openai" if settings.embedding_provider == "openai" and settings.llm_enabled and consent else "local",
    }


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(ConversationSession).where(ConversationSession.owner_id == user.id)
                      .order_by(ConversationSession.updated_at.desc())).all()


@router.get("/sessions/{sid}", response_model=SessionDetail)
def get_session(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _session(db, user.id, sid)


@router.delete("/sessions/{sid}", status_code=204)
def delete_session(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_session(db, user.id, sid))
    db.commit()


@router.post("/ask", response_model=AskOut)
def ask(body: AskIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.session_id:
        session = _session(db, user.id, body.session_id)
    else:
        session = ConversationSession(owner_id=user.id, title=body.question.strip()[:80], channel=body.channel)
        db.add(session)
        db.flush()
    history = [{"role": m.role, "content": m.content} for m in session.messages[-6:]] if body.session_id else []
    q = ConversationMessage(session_id=session.id, role="user", content=body.question.strip())
    db.add(q)
    consent = bool(user.profile and user.profile.ai_data_consent)
    ans = answer_question(db, user.id, body.question.strip(), consent, history)
    a = ConversationMessage(session_id=session.id, role="assistant", content=ans.text, answer_type=ans.answer_type,
                            sources=ans.sources, generator=ans.generator)
    db.add(a)
    session.updated_at = utcnow()
    audit(db, user.id, "assistant.ask", "conversation", session.id, detail=f"{body.channel}:{ans.answer_type}:{ans.generator}",
          ip=client_ip(request))
    db.commit()
    return AskOut(session_id=session.id, question=MessageOut.model_validate(q), answer=MessageOut.model_validate(a))


@router.post("/reindex")
def reindex(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = reindex_user(db, user.id)
    db.commit()
    return {"chunks": n}
