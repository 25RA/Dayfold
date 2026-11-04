from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import CalendarEvent, User
from app.core.deps import get_current_user
from app.services.planner.engine import ensure_utc, to_utc_iso

router = APIRouter(prefix="/calendar", tags=["calendar"])


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    all_day: bool = False
    timezone: str = "UTC"
    is_busy: bool = True
    is_fixed: bool = True


def event_to_dict(e: CalendarEvent) -> dict:
    return {
        "id": e.id,
        "user_id": e.user_id,
        "title": e.title,
        "description": e.description,
        "starts_at": to_utc_iso(e.starts_at),
        "ends_at": to_utc_iso(e.ends_at),
        "all_day": e.all_day,
        "timezone": e.timezone,
        "is_busy": e.is_busy,
        "is_fixed": e.is_fixed,
        "source": e.source,
        "linked_task_id": e.linked_task_id,
        "created_at": to_utc_iso(e.created_at),
    }


@router.get("/events")
async def list_events(
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(CalendarEvent).where(CalendarEvent.user_id == current_user.id)
    if from_dt:
        q = q.where(CalendarEvent.ends_at >= from_dt)
    if to_dt:
        q = q.where(CalendarEvent.starts_at <= to_dt)
    q = q.order_by(CalendarEvent.starts_at.asc()).limit(200)
    result = await db.execute(q)
    events = result.scalars().all()
    return [event_to_dict(e) for e in events]


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_event(
    body: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = CalendarEvent(
        user_id=current_user.id,
        title=body.title,
        description=body.description,
        starts_at=ensure_utc(body.starts_at),
        ends_at=ensure_utc(body.ends_at),
        all_day=body.all_day,
        timezone=body.timezone,
        is_busy=body.is_busy,
        is_fixed=body.is_fixed,
        source="manual",
    )
    db.add(event)
    await db.flush()
    try:
        await db.commit()
        await db.refresh(event)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit calendar event transaction"
        ) from exc
    return event_to_dict(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CalendarEvent).where(CalendarEvent.id == event_id, CalendarEvent.user_id == current_user.id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(event)

