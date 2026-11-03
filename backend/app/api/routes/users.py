from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User, UserPreferences, AuditLog
from app.core.deps import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


class PreferencesUpdate(BaseModel):
    profiles: Optional[list] = None
    working_hours: Optional[dict] = None
    focus_block_minutes: Optional[int] = None
    break_minutes: Optional[int] = None
    meeting_buffer_minutes: Optional[int] = None
    deep_work_preference: Optional[str] = None
    timezone: Optional[str] = None


class OnboardingComplete(BaseModel):
    profiles: list
    timezone: str
    working_hours: dict
    focus_block_minutes: int = 90
    break_minutes: int = 15


@router.get("/me/preferences")
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        return {
            "profiles": ["personal"],
            "working_hours": {
                "monday": {"start_hour": 9, "start_minute": 0, "end_hour": 18, "end_minute": 0},
                "tuesday": {"start_hour": 9, "start_minute": 0, "end_hour": 18, "end_minute": 0},
                "wednesday": {"start_hour": 9, "start_minute": 0, "end_hour": 18, "end_minute": 0},
                "thursday": {"start_hour": 9, "start_minute": 0, "end_hour": 18, "end_minute": 0},
                "friday": {"start_hour": 9, "start_minute": 0, "end_hour": 18, "end_minute": 0},
            },
            "focus_block_minutes": 90,
            "break_minutes": 15,
            "meeting_buffer_minutes": 10,
            "deep_work_preference": "morning",
        }

    return {
        "profiles": prefs.profiles,
        "working_hours": prefs.working_hours,
        "focus_block_minutes": prefs.focus_block_minutes,
        "break_minutes": prefs.break_minutes,
        "meeting_buffer_minutes": prefs.meeting_buffer_minutes,
        "deep_work_preference": prefs.deep_work_preference,
    }


@router.put("/me/preferences")
@router.patch("/me/preferences")
async def update_preferences(
    body: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validation: start time cannot be equal to or later than end time
    if body.working_hours:
        for day, hours in body.working_hours.items():
            sh = hours.get("start_hour", 9)
            eh = hours.get("end_hour", 18)
            if sh >= eh:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid planning window for {day.capitalize()}: start time ({sh}:00) must be earlier than end time ({eh}:00)."
                )

    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)

    if body.profiles is not None:
        prefs.profiles = body.profiles
    if body.working_hours is not None:
        prefs.working_hours = body.working_hours
    if body.focus_block_minutes is not None:
        prefs.focus_block_minutes = body.focus_block_minutes
    if body.break_minutes is not None:
        prefs.break_minutes = body.break_minutes
    if body.meeting_buffer_minutes is not None:
        prefs.meeting_buffer_minutes = body.meeting_buffer_minutes
    if body.deep_work_preference is not None:
        prefs.deep_work_preference = body.deep_work_preference
    if body.timezone is not None:
        current_user.timezone = body.timezone

    await db.flush()
    await db.commit()

    return {
        "message": "Preferences updated successfully",
        "preferences": {
            "profiles": prefs.profiles,
            "working_hours": prefs.working_hours,
            "focus_block_minutes": prefs.focus_block_minutes,
            "break_minutes": prefs.break_minutes,
            "meeting_buffer_minutes": prefs.meeting_buffer_minutes,
            "deep_work_preference": prefs.deep_work_preference,
        }
    }


@router.post("/me/onboarding/complete")
async def complete_onboarding(
    body: OnboardingComplete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete user onboarding and seed default data."""
    current_user.timezone = body.timezone
    current_user.is_onboarded = True

    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)

    prefs.profiles = body.profiles
    prefs.working_hours = body.working_hours
    prefs.focus_block_minutes = body.focus_block_minutes
    prefs.break_minutes = body.break_minutes

    await db.flush()
    return {"message": "Onboarding complete", "is_onboarded": True}


@router.get("/me/activity")
async def get_activity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get recent activity / audit log."""
    result = await db.execute(
        select(AuditLog).where(AuditLog.user_id == current_user.id)
        .order_by(AuditLog.at.desc()).limit(50)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "actor": log.actor,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "metadata": log.extra,
            "at": log.at.isoformat(),
        }
        for log in logs
    ]
