from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import User
from app.core.deps import get_current_user
from app.core.rate_limit import rate_limit_ai
from app.schemas.reflection import (
    DailyReflectionCreate,
    DailyReflectionUpdate,
    DailyReflectionOut,
    WeeklyReviewOut,
    PatternDiscoveryOut,
)
from app.services.reflection.service import (
    reflection_to_dict,
    get_reflection_by_date,
    get_reflection_by_id,
    list_reflections,
    save_or_update_reflection,
    update_reflection_by_id,
    soft_delete_reflection,
)
from app.services.reflection.analyzer import (
    synthesize_weekly_review,
    discover_patterns,
)

router = APIRouter(prefix="/reflections", tags=["reflections"])


@router.post("", response_model=DailyReflectionOut, status_code=status.HTTP_201_CREATED)
async def create_or_update_reflection(
    payload: DailyReflectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save or update a reflection for the specified calendar date.
    Strictly isolated to the authenticated user.
    """
    reflection = await save_or_update_reflection(db, current_user.id, payload)
    return reflection_to_dict(reflection)


@router.get("", response_model=List[DailyReflectionOut])
async def get_user_reflections(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List reflections for the current authenticated user in chronological order."""
    reflections = await list_reflections(db, current_user.id, start_date, end_date, limit, offset)
    return [reflection_to_dict(r) for r in reflections]


@router.get("/by-date/{target_date}", response_model=DailyReflectionOut)
async def get_reflection_for_date(
    target_date: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the active reflection for a specific calendar date."""
    reflection = await get_reflection_by_date(db, current_user.id, target_date)
    if not reflection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No reflection found for {target_date}",
        )
    return reflection_to_dict(reflection)


@router.get("/reviews/weekly", response_model=WeeklyReviewOut, dependencies=[Depends(rate_limit_ai("weekly_review"))])
async def get_weekly_review(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate or retrieve the weekly reflection synthesis.
    Requires at least 3 saved reflections; otherwise returns insufficient-data state.
    """
    now = datetime.now(timezone.utc)
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")

    reflections = await list_reflections(db, current_user.id, start_date=start_date, end_date=end_date, limit=100)
    return await synthesize_weekly_review(reflections, start_date, end_date)


@router.get("/patterns/discover", response_model=PatternDiscoveryOut, dependencies=[Depends(rate_limit_ai("pattern_discovery"))])
async def get_pattern_discovery(
    days: int = Query(30, ge=7, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Discover recurring themes across saved reflections.
    Requires at least 4 saved reflections and at least 2 distinct dates per pattern.
    """
    now = datetime.now(timezone.utc)
    end_date = now.strftime("%Y-%m-%d")
    start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

    reflections = await list_reflections(db, current_user.id, start_date=start_date, end_date=end_date, limit=100)
    return await discover_patterns(reflections)


@router.get("/{reflection_id}", response_model=DailyReflectionOut)
async def get_single_reflection(
    reflection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a single reflection by ID, ensuring user ownership."""
    reflection = await get_reflection_by_id(db, current_user.id, reflection_id)
    if not reflection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reflection not found",
        )
    return reflection_to_dict(reflection)


@router.put("/{reflection_id}", response_model=DailyReflectionOut)
async def update_reflection(
    reflection_id: str,
    payload: DailyReflectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing reflection by ID, verifying ownership."""
    reflection = await update_reflection_by_id(db, current_user.id, reflection_id, payload)
    if not reflection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reflection not found or not owned by current user",
        )
    return reflection_to_dict(reflection)


@router.delete("/{reflection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reflection(
    reflection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a reflection, verifying user ownership."""
    success = await soft_delete_reflection(db, current_user.id, reflection_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reflection not found or not owned by current user",
        )
    return None

