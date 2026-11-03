from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import AuditLog


async def log_audit(
    db: AsyncSession,
    user_id: Optional[str],
    actor: str,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> AuditLog:
    """Create an append-only audit trail record."""
    entry = AuditLog(
        user_id=user_id,
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        extra=extra or {},
        at=datetime.now(timezone.utc),
    )
    db.add(entry)
    return entry

