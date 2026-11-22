from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AuditLog


def audit(db: Session, user_id: int | None, action: str, resource_type: str | None = None,
          resource_id: int | str | None = None, detail: str | None = None, ip: str | None = None) -> None:
    """Record a sensitive operation. Caller commits."""
    db.add(AuditLog(
        user_id=user_id, action=action, resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        detail=detail, ip_address=ip,
    ))
