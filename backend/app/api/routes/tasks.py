from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_

from app.db.session import get_db
from app.models.models import Task, Project, TaskEvent, User
from app.core.deps import get_current_user
from app.services.auth.auth_service import write_audit
from app.services.planner.engine import to_utc_iso

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: int = 3
    deadline_at: Optional[datetime] = None
    deadline_is_hard: bool = False
    estimate_minutes: Optional[int] = None
    project_id: Optional[str] = None
    source: str = "ui"
    lens: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = None
    deadline_at: Optional[datetime] = None
    deadline_is_hard: Optional[bool] = None
    estimate_minutes: Optional[int] = None
    project_id: Optional[str] = None
    status: Optional[str] = None
    lens: Optional[str] = None


def get_task_lens(task: Task) -> Optional[str]:
    import re
    desc = task.description or ""
    m = re.search(r'\[lens:([a-zA-Z]+)\]', desc, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    title_lower = task.title.lower()
    full_text = f"{title_lower} {desc.lower()}"
    if any(k in full_text for k in ["study", "lecture", "exam", "assignment", "dbms", "networks", "class", "pset"]):
        return "student"
    elif any(k in full_text for k in ["sync", "meeting", "review", "client", "roadmap", "deliverable", "okr", "strategy"]):
        return "professional"
    elif any(k in full_text for k in ["dentist", "grocery", "errand", "meal", "gym", "health", "car", "appointment"]):
        return "personal"
    return None


def task_to_dict(task: Task) -> dict:
    import re
    desc = task.description or ""
    clean_desc = re.sub(r'\[lens:[a-zA-Z]+\]\s*', '', desc).strip()
    return {
        "id": task.id,
        "user_id": task.user_id,
        "project_id": task.project_id,
        "title": task.title,
        "description": clean_desc,
        "lens": get_task_lens(task),
        "priority": task.priority,
        "deadline_at": to_utc_iso(task.deadline_at) if task.deadline_at else None,
        "deadline_is_hard": task.deadline_is_hard,
        "estimate_minutes": task.estimate_minutes,
        "estimate_source": task.estimate_source,
        "status": task.status,
        "completed_at": to_utc_iso(task.completed_at) if task.completed_at else None,
        "source": task.source,
        "created_at": to_utc_iso(task.created_at),
        "updated_at": to_utc_iso(task.updated_at),
    }


@router.get("")
async def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    project_id: Optional[str] = None,
    lens: Optional[str] = Query(None),
    limit: int = Query(100, le=200),
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Task).where(Task.user_id == current_user.id)
    if status_filter:
        s_lower = status_filter.lower()
        if s_lower in ["todo", "open"]:
            q = q.where(Task.status.in_(["todo", "in_progress"]))
        elif s_lower in ["done", "completed"]:
            q = q.where(Task.status == "done")
        else:
            q = q.where(Task.status == status_filter)
    else:
        # Hide soft-deleted/cancelled tasks by default
        q = q.where(Task.status != "cancelled")

    if project_id:
        q = q.where(Task.project_id == project_id)

    q = q.order_by(Task.priority.asc(), Task.deadline_at.asc().nulls_last()).offset(offset).limit(limit)
    result = await db.execute(q)
    tasks = result.scalars().all()

    if lens and lens != "all":
        target_lens = lens.lower()
        tasks = [t for t in tasks if get_task_lens(t) == target_lens or (get_task_lens(t) is None and target_lens == "personal")]

    return [task_to_dict(t) for t in tasks]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    description = body.description or ""
    if body.lens and body.lens != "all":
        tag = f"[lens:{body.lens.lower()}]"
        if tag not in description:
            description = f"{tag} {description}".strip()

    if body.project_id:
        proj_result = await db.execute(
            select(Project).where(Project.id == body.project_id, Project.user_id == current_user.id)
        )
        if not proj_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found or not owned by user")

    task = Task(
        user_id=current_user.id,
        title=body.title,
        description=description,
        priority=body.priority,
        deadline_at=body.deadline_at,
        deadline_is_hard=body.deadline_is_hard,
        estimate_minutes=body.estimate_minutes,
        project_id=body.project_id,
        source=body.source,
    )
    db.add(task)
    await db.flush()

    event = TaskEvent(
        task_id=task.id,
        user_id=current_user.id,
        actor="user",
        change={"action": "created", "title": body.title},
    )
    db.add(event)

    await write_audit(db, current_user.id, "user", "task.create", "task", task.id)

    return task_to_dict(task)


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_to_dict(task)


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = body.model_dump(exclude_none=True)
    if "project_id" in update_data and update_data["project_id"] is not None:
        proj_result = await db.execute(
            select(Project).where(Project.id == update_data["project_id"], Project.user_id == current_user.id)
        )
        if not proj_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found or not owned by user")

    changes = {}
    for field, value in update_data.items():
        old_val = getattr(task, field, None)
        if old_val != value:
            setattr(task, field, value)
            changes[field] = {"from": str(old_val), "to": str(value)}

    if changes:
        task.updated_at = datetime.now(timezone.utc)
        event = TaskEvent(
            task_id=task.id,
            user_id=current_user.id,
            actor="user",
            change={"action": "updated", "changes": changes},
        )
        db.add(event)

    return task_to_dict(task)


@router.post("/{task_id}/complete")
async def complete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = "done"
    task.completed_at = datetime.now(timezone.utc)
    task.updated_at = datetime.now(timezone.utc)

    event = TaskEvent(
        task_id=task.id,
        user_id=current_user.id,
        actor="user",
        change={"action": "completed"},
    )
    db.add(event)
    await write_audit(db, current_user.id, "user", "task.complete", "task", task.id)

    return task_to_dict(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = "cancelled"
    task.updated_at = datetime.now(timezone.utc)
    await write_audit(db, current_user.id, "user", "task.delete", "task", task.id)

