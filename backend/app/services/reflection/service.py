from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Sequence
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update

from app.models.models import DailyReflection, User
from app.schemas.reflection import DailyReflectionCreate, DailyReflectionUpdate
from app.services.auth.auth_service import write_audit
from app.services.planner.engine import to_utc_iso


def reflection_to_dict(r: DailyReflection) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "target_date": r.target_date,
        "went_well": r.went_well,
        "remained_unfinished": r.remained_unfinished,
        "do_differently": r.do_differently,
        "additional_notes": r.additional_notes,
        "voice_used": r.voice_used,
        "created_at": to_utc_iso(r.created_at),
        "updated_at": to_utc_iso(r.updated_at),
    }


async def get_reflection_by_date(
    db: AsyncSession,
    user_id: str,
    target_date: str,
) -> Optional[DailyReflection]:
    """Retrieve an active reflection for a specific user and local calendar date."""
    q = select(DailyReflection).where(
        DailyReflection.user_id == user_id,
        DailyReflection.target_date == target_date,
        DailyReflection.deleted_at.is_(None),
    )
    result = await db.execute(q)
    return result.scalar_one_or_none()


async def get_reflection_by_id(
    db: AsyncSession,
    user_id: str,
    reflection_id: str,
) -> Optional[DailyReflection]:
    """Retrieve a reflection by ID, strictly verifying ownership."""
    q = select(DailyReflection).where(
        DailyReflection.id == reflection_id,
        DailyReflection.user_id == user_id,
        DailyReflection.deleted_at.is_(None),
    )
    result = await db.execute(q)
    return result.scalar_one_or_none()


async def list_reflections(
    db: AsyncSession,
    user_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[DailyReflection]:
    """List reflections for the authenticated user ordered chronologically descending."""
    q = select(DailyReflection).where(
        DailyReflection.user_id == user_id,
        DailyReflection.deleted_at.is_(None),
    )
    if start_date:
        q = q.where(DailyReflection.target_date >= start_date)
    if end_date:
        q = q.where(DailyReflection.target_date <= end_date)

    q = q.order_by(DailyReflection.target_date.desc(), DailyReflection.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


async def save_or_update_reflection(
    db: AsyncSession,
    user_id: str,
    payload: DailyReflectionCreate,
) -> DailyReflection:
    """
    Save or update a reflection for a user and calendar date.
    Ensures exactly one active reflection per calendar day per user (upsert behavior).
    """
    existing = await get_reflection_by_date(db, user_id, payload.target_date)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if existing:
        existing.went_well = payload.went_well
        existing.remained_unfinished = payload.remained_unfinished
        existing.do_differently = payload.do_differently
        existing.additional_notes = payload.additional_notes
        existing.voice_used = payload.voice_used or existing.voice_used
        existing.updated_at = now
        await db.flush()

        await write_audit(
            db,
            user_id=user_id,
            actor="user",
            action="reflection_updated",
            entity_type="daily_reflection",
            entity_id=existing.id,
            metadata={"target_date": payload.target_date, "voice_used": existing.voice_used},
        )
        return existing
    else:
        reflection = DailyReflection(
            user_id=user_id,
            target_date=payload.target_date,
            went_well=payload.went_well,
            remained_unfinished=payload.remained_unfinished,
            do_differently=payload.do_differently,
            additional_notes=payload.additional_notes,
            voice_used=payload.voice_used,
            created_at=now,
            updated_at=now,
        )
        db.add(reflection)
        await db.flush()

        await write_audit(
            db,
            user_id=user_id,
            actor="user",
            action="reflection_created",
            entity_type="daily_reflection",
            entity_id=reflection.id,
            metadata={"target_date": payload.target_date, "voice_used": reflection.voice_used},
        )
        return reflection


async def update_reflection_by_id(
    db: AsyncSession,
    user_id: str,
    reflection_id: str,
    payload: DailyReflectionUpdate,
) -> Optional[DailyReflection]:
    """Partially update an existing reflection by ID, strictly scoped to user."""
    reflection = await get_reflection_by_id(db, user_id, reflection_id)
    if not reflection:
        return None

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if payload.went_well is not None:
        reflection.went_well = payload.went_well
    if payload.remained_unfinished is not None:
        reflection.remained_unfinished = payload.remained_unfinished
    if payload.do_differently is not None:
        reflection.do_differently = payload.do_differently
    if payload.additional_notes is not None:
        reflection.additional_notes = payload.additional_notes
    if payload.voice_used is not None:
        reflection.voice_used = payload.voice_used

    reflection.updated_at = now
    await db.flush()

    await write_audit(
        db,
        user_id=user_id,
        actor="user",
        action="reflection_updated",
        entity_type="daily_reflection",
        entity_id=reflection.id,
        metadata={"target_date": reflection.target_date},
    )
    return reflection


async def soft_delete_reflection(
    db: AsyncSession,
    user_id: str,
    reflection_id: str,
) -> bool:
    """Soft delete a reflection with user ownership verification."""
    reflection = await get_reflection_by_id(db, user_id, reflection_id)
    if not reflection:
        return False

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    reflection.deleted_at = now
    await db.flush()

    await write_audit(
        db,
        user_id=user_id,
        actor="user",
        action="reflection_deleted",
        entity_type="daily_reflection",
        entity_id=reflection.id,
        metadata={"target_date": reflection.target_date},
    )
    return True
