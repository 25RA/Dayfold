from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import PendingAction, ActionExecution, Plan, Task, User, AuditLog
from app.core.deps import get_current_user
from app.services.auth.auth_service import write_audit
from app.services.planner.engine import to_utc_iso

router = APIRouter(prefix="/actions", tags=["actions"])


class ApproveRequest(BaseModel):
    payload_hash: str


def action_to_dict(action: PendingAction) -> dict:
    return {
        "id": action.id,
        "user_id": action.user_id,
        "type": action.type,
        "payload": action.payload,
        "payload_hash": action.payload_hash,
        "risk_level": action.risk_level,
        "status": action.status,
        "title": action.title,
        "description": action.description,
        "proposed_at": to_utc_iso(action.proposed_at),
        "expires_at": to_utc_iso(action.expires_at),
        "decided_at": to_utc_iso(action.decided_at) if action.decided_at else None,
        "decided_via": action.decided_via,
    }


@router.get("/pending")
async def list_pending_actions(
    target_date: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PendingAction).where(
            PendingAction.user_id == current_user.id,
            PendingAction.status == "proposed",
            PendingAction.expires_at > now,
        ).order_by(PendingAction.proposed_at.desc())
    )
    actions = result.scalars().all()
    if target_date:
        filtered = [
            a for a in actions
            if a.payload and a.payload.get("target_date") == target_date
        ]
        return [action_to_dict(a) for a in filtered]
    return [action_to_dict(a) for a in actions]


@router.get("")
async def list_all_actions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PendingAction).where(
            PendingAction.user_id == current_user.id,
        ).order_by(PendingAction.proposed_at.desc()).limit(50)
    )
    actions = result.scalars().all()
    return [action_to_dict(a) for a in actions]


@router.get("/{action_id}")
async def get_action(
    action_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PendingAction).where(
            PendingAction.id == action_id,
            PendingAction.user_id == current_user.id,
        )
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action_to_dict(action)


@router.post("/{action_id}/approve")
async def approve_action(
    action_id: str,
    body: ApproveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PendingAction).where(
            PendingAction.id == action_id,
            PendingAction.user_id == current_user.id,
        )
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    if action.status != "proposed":
        raise HTTPException(status_code=409, detail=f"Action is already {action.status}")

    if action.expires_at.replace(tzinfo=timezone.utc) < now:
        action.status = "expired"
        raise HTTPException(status_code=410, detail="Action has expired")

    # Integrity check: verify payload hash
    if body.payload_hash != action.payload_hash:
        raise HTTPException(
            status_code=409,
            detail="payload_changed: The action payload has changed since it was displayed. Please refresh and try again."
        )

    # Execute the action
    action.status = "executing"
    action.decided_at = now
    action.decided_via = "tap"
    await db.flush()

    execution_result = await _execute_action(action, current_user, db)

    if execution_result["success"]:
        action.status = "succeeded"
    elif execution_result.get("partial"):
        action.status = "partially_succeeded"
    else:
        action.status = "failed"

    await write_audit(db, current_user.id, "user", "action.approve", "pending_action", action.id,
                      {"result": action.status})
    await db.commit()

    return {
        "action_id": action.id,
        "status": action.status,
        "result": execution_result,
    }


@router.post("/{action_id}/reject")
async def reject_action(
    action_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PendingAction).where(
            PendingAction.id == action_id,
            PendingAction.user_id == current_user.id,
        )
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    action.status = "rejected"
    action.decided_at = datetime.now(timezone.utc)
    action.decided_via = "tap"

    await write_audit(db, current_user.id, "user", "action.reject", "pending_action", action.id)

    return {"action_id": action.id, "status": "rejected"}


async def _execute_action(action: PendingAction, user: User, db: AsyncSession) -> dict:
    """Execute the approved action. Returns {success, steps, message}."""
    action_type = action.type
    payload = action.payload
    steps = []

    if action_type == "plan_commit":
        plan_id = payload.get("plan_id")
        if not plan_id:
            return {"success": False, "message": "No plan ID in payload"}

        plan_result = await db.execute(
            select(Plan).where(Plan.id == plan_id, Plan.user_id == user.id)
        )
        plan = plan_result.scalar_one_or_none()
        if not plan:
            return {"success": False, "message": "Plan not found"}

        plan.status = "committed"

        # Update task statuses to in_progress for scheduled tasks
        from app.models.models import PlanBlock
        blocks_result = await db.execute(
            select(PlanBlock).where(PlanBlock.plan_id == plan_id, PlanBlock.task_id.isnot(None))
        )
        blocks = blocks_result.scalars().all()
        task_ids = [b.task_id for b in blocks if b.kind == "task"]

        for task_id in task_ids:
            task_result = await db.execute(
                select(Task).where(Task.id == task_id, Task.user_id == user.id)
            )
            task = task_result.scalar_one_or_none()
            if task and task.status == "todo":
                task.status = "in_progress"
                steps.append({"op": "task.schedule", "task_id": task_id, "status": "succeeded"})

        steps.append({"op": "plan.commit", "plan_id": plan_id, "status": "succeeded"})
        return {"success": True, "steps": steps, "message": f"Plan committed. {len(task_ids)} tasks scheduled."}

    elif action_type == "task_create":
        task_data = payload.get("task", {})
        task = Task(
            user_id=user.id,
            title=task_data.get("title", "New Task"),
            priority=task_data.get("priority", 3),
            estimate_minutes=task_data.get("estimate_minutes"),
            deadline_at=task_data.get("deadline_at"),
            source="agent",
        )
        db.add(task)
        await db.flush()
        steps.append({"op": "task.create", "task_id": task.id, "status": "succeeded"})
        return {"success": True, "steps": steps, "message": "Task created."}

    else:
        return {"success": True, "steps": [{"op": action_type, "status": "no_op"}], "message": "Action acknowledged."}

