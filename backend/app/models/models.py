from __future__ import annotations
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, Any
from sqlalchemy import (
    String, Text, Boolean, Integer, SmallInteger, DateTime,
    ForeignKey, JSON, Enum as SAEnum, func, Index, UniqueConstraint, text
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def gen_uuid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.utcnow()


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserProfile(str, Enum):
    student = "student"
    professional = "professional"
    personal = "personal"


class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


class TaskPriority(int, Enum):
    critical = 1
    high = 2
    medium = 3
    low = 4


class PlanStatus(str, Enum):
    draft = "draft"
    proposed = "proposed"
    committed = "committed"
    superseded = "superseded"
    abandoned = "abandoned"


class ActionStatus(str, Enum):
    proposed = "proposed"
    approved = "approved"
    rejected = "rejected"
    expired = "expired"
    executing = "executing"
    succeeded = "succeeded"
    partially_succeeded = "partially_succeeded"
    failed = "failed"


class ActionRiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class BlockKind(str, Enum):
    task = "task"
    break_ = "break"
    buffer = "buffer"
    fixed_event = "fixed_event"
    prep = "prep"


# ─── Identity & Auth ──────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    locale: Mapped[str] = mapped_column(String(16), default="en")
    status: Mapped[str] = mapped_column(String(32), default="active")
    is_onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    preferences: Mapped[Optional["UserPreferences"]] = relationship(back_populates="user", uselist=False)
    tasks: Mapped[list["Task"]] = relationship(back_populates="user")
    projects: Mapped[list["Project"]] = relationship(back_populates="user")
    plans: Mapped[list["Plan"]] = relationship(back_populates="user")
    pending_actions: Mapped[list["PendingAction"]] = relationship(back_populates="user")
    reflections: Mapped[list["DailyReflection"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    profiles: Mapped[list] = mapped_column(JSON, default=list)
    working_hours: Mapped[dict] = mapped_column(JSON, default=dict)  # {weekday: {start: "09:00", end: "18:00"}}
    focus_block_minutes: Mapped[int] = mapped_column(Integer, default=90)
    break_minutes: Mapped[int] = mapped_column(Integer, default=15)
    meeting_buffer_minutes: Mapped[int] = mapped_column(Integer, default=10)
    deep_work_preference: Mapped[str] = mapped_column(String(16), default="morning")  # morning | evening
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)

    user: Mapped["User"] = relationship(back_populates="preferences")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)


# ─── Projects & Tasks ─────────────────────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(String(64))
    color: Mapped[str] = mapped_column(String(16), default="#5B63F0")
    status: Mapped[str] = mapped_column(String(32), default="active")
    target_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)

    user: Mapped["User"] = relationship(back_populates="projects")
    tasks: Mapped[list["Task"]] = relationship(back_populates="project")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(SmallInteger, default=3)  # 1=critical, 4=low
    deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    deadline_is_hard: Mapped[bool] = mapped_column(Boolean, default=False)
    estimate_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    estimate_source: Mapped[str] = mapped_column(String(16), default="user")  # user|model|default
    status: Mapped[str] = mapped_column(String(32), default="todo", index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="ui")  # voice|ui|meeting|import
    sort_key: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)

    user: Mapped["User"] = relationship(back_populates="tasks")
    project: Mapped[Optional["Project"]] = relationship(back_populates="tasks")
    task_events: Mapped[list["TaskEvent"]] = relationship(back_populates="task")

    __table_args__ = (
        Index("ix_tasks_user_status_deadline", "user_id", "status", "deadline_at"),
    )


class TaskEvent(Base):
    """Append-only task history."""
    __tablename__ = "task_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    actor: Mapped[str] = mapped_column(String(16), default="user")  # user|agent|system
    change: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    conversation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    task: Mapped["Task"] = relationship(back_populates="task_events")


# ─── Calendar Events ──────────────────────────────────────────────────────────

class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    is_busy: Mapped[bool] = mapped_column(Boolean, default=True)
    is_fixed: Mapped[bool] = mapped_column(Boolean, default=True)  # non-moveable
    source: Mapped[str] = mapped_column(String(32), default="manual")  # manual|google|app_created
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    linked_task_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)

    __table_args__ = (
        Index("ix_calendar_events_user_range", "user_id", "starts_at", "ends_at"),
    )


# ─── Plans ────────────────────────────────────────────────────────────────────

class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    conversation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    horizon_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    horizon_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_plan_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    summary: Mapped[Optional[str]] = mapped_column(Text)
    inputs: Mapped[dict] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)  # {capacity_minutes, scheduled_minutes}
    is_simulation: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    user: Mapped["User"] = relationship(back_populates="plans")
    blocks: Mapped[list["PlanBlock"]] = relationship(back_populates="plan", cascade="all, delete-orphan")
    unscheduled: Mapped[list["PlanUnscheduled"]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class PlanBlock(Base):
    __tablename__ = "plan_blocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("plans.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    task_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True)
    calendar_event_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("calendar_events.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # task|break|buffer|fixed_event|prep
    title: Mapped[Optional[str]] = mapped_column(String(512))
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    rationale: Mapped[list] = mapped_column(JSON, default=list)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[Optional[str]] = mapped_column(String(16))

    plan: Mapped["Plan"] = relationship(back_populates="blocks")


class PlanUnscheduled(Base):
    __tablename__ = "plan_unscheduled"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("plans.id"), nullable=False, index=True)
    task_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True)
    task_title: Mapped[str] = mapped_column(String(512), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    plan: Mapped["Plan"] = relationship(back_populates="unscheduled")


# ─── Pending Actions & Audit ──────────────────────────────────────────────────

class PendingAction(Base):
    __tablename__ = "pending_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    conversation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)  # plan_commit|task_create|etc.
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 hex
    risk_level: Mapped[str] = mapped_column(String(16), default="low")
    status: Mapped[str] = mapped_column(String(32), default="proposed", index=True)
    title: Mapped[Optional[str]] = mapped_column(String(512))
    description: Mapped[Optional[str]] = mapped_column(Text)
    proposed_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decided_via: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # tap|voice

    user: Mapped["User"] = relationship(back_populates="pending_actions")
    executions: Mapped[list["ActionExecution"]] = relationship(back_populates="action")


class ActionExecution(Base):
    __tablename__ = "action_executions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    pending_action_id: Mapped[str] = mapped_column(String(36), ForeignKey("pending_actions.id"), nullable=False, index=True)
    step_index: Mapped[int] = mapped_column(Integer, default=0)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    request: Mapped[Optional[dict]] = mapped_column(JSON)
    response: Mapped[Optional[dict]] = mapped_column(JSON)
    error_code: Mapped[Optional[str]] = mapped_column(String(64))
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    action: Mapped["PendingAction"] = relationship(back_populates="executions")


class AuditLog(Base):
    """Append-only audit trail."""
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(32), nullable=False)  # user|agent|system
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(64))
    entity_id: Mapped[Optional[str]] = mapped_column(String(36))
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)


# ─── Conversations ────────────────────────────────────────────────────────────

class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(16), default="text")  # text|voice
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text)

    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    conversation_id: Mapped[str] = mapped_column(String(36), ForeignKey("conversations.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user|assistant|tool
    content: Mapped[str] = mapped_column(Text, default="")
    tool_calls: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


# ─── Daily Reflections ────────────────────────────────────────────────────────

class DailyReflection(Base):
    """
    Dayfold Reflection — Private daily learning records.
    Scoped strictly to the authenticated user.
    """
    __tablename__ = "daily_reflections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_date: Mapped[str] = mapped_column(String(10), nullable=False)  # Local calendar date YYYY-MM-DD
    went_well: Mapped[str] = mapped_column(Text, nullable=False)
    remained_unfinished: Mapped[str] = mapped_column(Text, nullable=False)
    do_differently: Mapped[str] = mapped_column(Text, nullable=False)
    additional_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voice_used: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, server_default=text("CURRENT_TIMESTAMP"))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="reflections")

    __table_args__ = (
        Index(
            "uq_reflections_user_date",
            "user_id",
            "target_date",
            unique=True,
            sqlite_where=text("deleted_at IS NULL"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_reflections_user_target_date", "user_id", "target_date"),
    )

