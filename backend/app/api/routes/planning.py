from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any, Sequence
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
import json
import hashlib

from app.db.session import get_db
from app.models.models import (
    Plan, PlanBlock, PlanUnscheduled, PendingAction, ActionExecution,
    User, UserPreferences, CalendarEvent, Task
)
from app.core.deps import get_current_user
from app.core.rate_limit import rate_limit_ai
from app.services.planner.engine import (
    PlanTask, FixedEvent, PlannerConfig, WorkingHours, generate_plan, ensure_utc, to_utc_iso
)
from app.services.agent.agent import _make_payload_hash, _prefs_to_config
from app.services.auth.auth_service import write_audit
from app.api.routes.tasks import get_task_lens

router = APIRouter(prefix="/plans", tags=["planning"])


class GeneratePlanRequest(BaseModel):
    horizon_start: Optional[datetime] = None
    horizon_end: Optional[datetime] = None
    horizon_hours: int = 8
    is_simulation: bool = False
    simulation_overrides: Optional[dict] = None
    lens: Optional[str] = None


def plan_to_dict(plan: Plan, blocks: Sequence[Any] | list[Any] = (), unscheduled: Sequence[Any] | list[Any] = ()) -> dict:
    return {
        "id": plan.id,
        "user_id": plan.user_id,
        "horizon_start": to_utc_iso(plan.horizon_start),
        "horizon_end": to_utc_iso(plan.horizon_end),
        "version": plan.version,
        "status": plan.status,
        "summary": plan.summary,
        "metrics": plan.metrics,
        "is_simulation": plan.is_simulation,
        "created_at": to_utc_iso(plan.created_at),
        "blocks": [
            {
                "id": b.id,
                "kind": b.kind,
                "title": b.title,
                "task_id": b.task_id,
                "calendar_event_id": b.calendar_event_id,
                "starts_at": to_utc_iso(b.starts_at),
                "ends_at": to_utc_iso(b.ends_at),
                "rationale": b.rationale,
                "pinned": b.pinned,
                "color": b.color,
            }
            for b in blocks
        ],
        "unscheduled": [
            {"task_id": u.task_id, "title": u.task_title, "reason": u.reason}
            for u in unscheduled
        ],
    }


async def cleanup_old_simulations(db: AsyncSession, user_id: str, max_age_hours: int = 24) -> int:
    """
    Safely prune simulation plans and associated child blocks/unscheduled items
    older than max_age_hours for this user.
    Guarantees:
    - Only prunes rows where is_simulation == True AND status == 'draft'.
    - Never touches committed, proposed, or production plans.
    - Safe under concurrent executions (handles zero matched rows gracefully).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    sim_result = await db.execute(
        select(Plan.id).where(
            Plan.user_id == user_id,
            Plan.is_simulation == True,
            Plan.status == "draft",
            Plan.created_at < cutoff,
        )
    )
    old_plan_ids = [row[0] for row in sim_result.fetchall()]
    if not old_plan_ids:
        return 0

    await db.execute(delete(PlanBlock).where(PlanBlock.plan_id.in_(old_plan_ids)))
    await db.execute(delete(PlanUnscheduled).where(PlanUnscheduled.plan_id.in_(old_plan_ids)))
    del_result = await db.execute(delete(Plan).where(Plan.id.in_(old_plan_ids)))
    return del_result.rowcount or 0


@router.post("/simulations/cleanup")
async def prune_stale_simulations(
    max_age_hours: int = 24,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Prune stale simulation draft records older than max_age_hours for the authenticated user."""
    deleted_count = await cleanup_old_simulations(db, current_user.id, max_age_hours=max_age_hours)
    return {"pruned_simulations": deleted_count}


@router.post("/generate", dependencies=[Depends(rate_limit_ai("plan_gen"))])
async def generate_schedule(
    body: GeneratePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    horizon_start = body.horizon_start or now
    horizon_end = body.horizon_end or (now + timedelta(hours=body.horizon_hours))

    # Best-effort pruning of stale simulation runs for this user
    if body.is_simulation:
        try:
            await cleanup_old_simulations(db, current_user.id, max_age_hours=24)
        except Exception:
            pass

    # Get tasks
    tasks_result = await db.execute(
        select(Task).where(Task.user_id == current_user.id, Task.status == "todo").limit(50)
    )
    tasks_db = tasks_result.scalars().all()

    # Filter tasks by lens if specified
    if body.lens and body.lens != "all":
        target_lens = body.lens.lower()
        tasks_db = [
            t for t in tasks_db
            if get_task_lens(t) == target_lens or (get_task_lens(t) is None and target_lens == "personal")
        ]

    # Get events
    events_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == current_user.id,
            CalendarEvent.starts_at < horizon_end,
            CalendarEvent.ends_at > horizon_start,
        ).limit(50)
    )
    events_db = events_result.scalars().all()

    # Get prefs
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = prefs_result.scalar_one_or_none()

    config = _prefs_to_config(prefs, current_user.timezone)

    plan_tasks = [
        PlanTask(
            id=t.id,
            title=t.title,
            priority=t.priority or 3,
            estimate_minutes=t.estimate_minutes or 60,
            deadline_at=t.deadline_at,
            deadline_is_hard=t.deadline_is_hard,
        )
        for t in tasks_db
    ]

    fixed_events = [
        FixedEvent(id=e.id, title=e.title, starts_at=e.starts_at, ends_at=e.ends_at, is_busy=e.is_busy)
        for e in events_db
    ]

    result = generate_plan(
        plan_tasks, fixed_events, horizon_start, horizon_end, config,
        is_simulation=body.is_simulation,
        simulation_overrides=body.simulation_overrides,
    )

    # Supersede previous proposed plans (if not simulation)
    if not body.is_simulation:
        old_plans_result = await db.execute(
            select(Plan).where(
                Plan.user_id == current_user.id,
                Plan.status == "proposed",
            )
        )
        for old_plan in old_plans_result.scalars().all():
            old_plan.status = "superseded"

    # Save plan
    plan_db = Plan(
        user_id=current_user.id,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
        status="proposed" if not body.is_simulation else "draft",
        summary=f"{'Simulation: ' if body.is_simulation else ''}Plan for {horizon_start.strftime('%b %d, %H:%M')} - {horizon_end.strftime('%H:%M')}",
        metrics={"capacity_minutes": result.capacity_minutes, "scheduled_minutes": result.scheduled_minutes},
        inputs={"horizon_hours": body.horizon_hours},
        is_simulation=body.is_simulation,
    )
    db.add(plan_db)
    await db.flush()

    blocks_db = []
    for block in result.blocks:
        pb = PlanBlock(
            plan_id=plan_db.id,
            user_id=current_user.id,
            task_id=block.task_id,
            calendar_event_id=block.calendar_event_id,
            kind=block.kind,
            title=block.title,
            starts_at=block.starts_at,
            ends_at=block.ends_at,
            rationale=block.rationale,
            pinned=block.pinned,
        )
        db.add(pb)
        blocks_db.append(pb)

    unscheduled_db = []
    for u in result.unscheduled:
        pu = PlanUnscheduled(
            plan_id=plan_db.id,
            task_id=u.task_id,
            task_title=u.title,
            reason=u.reason,
        )
        db.add(pu)
        unscheduled_db.append(pu)

    pending_action_data = None
    task_blocks = [b for b in result.blocks if b.kind == "task"]
    task_blocks_count = len(task_blocks)
    unique_task_ids = set(b.task_id for b in task_blocks if b.task_id)
    blocks_without_id = [b for b in task_blocks if not b.task_id]
    unique_no_id_titles = set(b.title for b in blocks_without_id)
    unique_tasks_count = len(unique_task_ids) + len(unique_no_id_titles)
    if unique_tasks_count == 0:
        unique_tasks_count = task_blocks_count

    if not body.is_simulation and task_blocks_count > 0:
        # Expire previous pending plan_commit actions
        old_actions = await db.execute(
            select(PendingAction).where(
                PendingAction.user_id == current_user.id,
                PendingAction.type == "plan_commit",
                PendingAction.status == "proposed",
            )
        )
        for old_act in old_actions.scalars().all():
            old_act.status = "superseded"

        payload = {
            "type": "plan_commit",
            "plan_id": plan_db.id,
            "summary": plan_db.summary,
            "blocks_count": len(result.blocks),
            "unique_tasks_count": unique_tasks_count,
            "scheduled_tasks_count": unique_tasks_count,
            "scheduled_blocks_count": task_blocks_count,
            "unscheduled_tasks_count": len(result.unscheduled),
        }
        payload_hash = _make_payload_hash(payload)

        if task_blocks_count > unique_tasks_count:
            blocks_desc = f"{unique_tasks_count} tasks across {task_blocks_count} focus blocks"
        else:
            blocks_desc = f"{unique_tasks_count} tasks"

        action = PendingAction(
            user_id=current_user.id,
            type="plan_commit",
            payload=payload,
            payload_hash=payload_hash,
            risk_level="medium",
            status="proposed",
            title=f"Approve Schedule: {plan_db.summary}",
            description=f"Commit {blocks_desc} to your day timeline",
            proposed_at=now,
            expires_at=now + timedelta(minutes=15),
        )
        db.add(action)
        await db.flush()
        pending_action_data = {
            "id": action.id,
            "type": action.type,
            "payload_hash": action.payload_hash,
            "status": action.status,
            "title": action.title,
            "description": action.description,
            "expires_at": to_utc_iso(action.expires_at),
        }

    await db.flush()
    audit_action = "simulation.run" if body.is_simulation else "plan.generate"
    audit_actor = "user" if body.is_simulation else "system"
    await write_audit(
        db,
        current_user.id,
        audit_actor,
        audit_action,
        "plan",
        plan_db.id,
        {
            "is_simulation": body.is_simulation,
            "blocks": len(result.blocks),
            "capacity_minutes": result.capacity_minutes,
            "scheduled_minutes": result.scheduled_minutes,
            "displaced_tasks": len(result.unscheduled),
            "simulation_overrides": body.simulation_overrides if body.is_simulation else None,
        },
    )

    out = plan_to_dict(plan_db, blocks_db, unscheduled_db)
    out["pending_action"] = pending_action_data
    return out


@router.post("/{plan_id}/propose-commit")
async def propose_plan_commit(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_result = await db.execute(
        select(Plan).where(Plan.id == plan_id, Plan.user_id == current_user.id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    blocks_result = await db.execute(
        select(PlanBlock).where(PlanBlock.plan_id == plan_id)
    )
    blocks = blocks_result.scalars().all()
    task_blocks = [b for b in blocks if b.kind == "task"]
    if not task_blocks:
        raise HTTPException(status_code=400, detail="Cannot propose plan commit with zero task blocks")

    now = datetime.now(timezone.utc)
    payload = {
        "type": "plan_commit",
        "plan_id": plan.id,
        "summary": plan.summary,
        "blocks_count": len(blocks),
    }
    payload_hash = _make_payload_hash(payload)

    action = PendingAction(
        user_id=current_user.id,
        type="plan_commit",
        payload=payload,
        payload_hash=payload_hash,
        risk_level="medium",
        status="proposed",
        title=f"Approve Schedule: {plan.summary}",
        description=f"Commit {len(blocks)} blocks to your day timeline",
        proposed_at=now,
        expires_at=now + timedelta(minutes=15),
    )
    db.add(action)
    await db.flush()
    await write_audit(db, current_user.id, "user", "plan.propose_commit", "plan", plan.id)

    return {
        "pending_action_id": action.id,
        "payload_hash": payload_hash,
        "status": action.status,
        "title": action.title,
        "description": action.description,
        "expires_at": to_utc_iso(action.expires_at),
    }


@router.get("/{plan_id}")
async def get_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Plan).where(Plan.id == plan_id, Plan.user_id == current_user.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    blocks_result = await db.execute(
        select(PlanBlock).where(PlanBlock.plan_id == plan_id).order_by(PlanBlock.starts_at)
    )
    blocks = blocks_result.scalars().all()

    unsch_result = await db.execute(
        select(PlanUnscheduled).where(PlanUnscheduled.plan_id == plan_id)
    )
    unscheduled = unsch_result.scalars().all()

    return plan_to_dict(plan, blocks, unscheduled)


@router.get("")
async def list_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Plan).where(
            Plan.user_id == current_user.id,
            Plan.is_simulation == False,
        ).order_by(Plan.created_at.desc()).limit(20)
    )
    plans = result.scalars().all()
    return [
        {
            "id": p.id,
            "status": p.status,
            "summary": p.summary,
            "horizon_start": to_utc_iso(p.horizon_start),
            "horizon_end": to_utc_iso(p.horizon_end),
            "metrics": p.metrics,
            "created_at": to_utc_iso(p.created_at),
        }
        for p in plans
    ]

