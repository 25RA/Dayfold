"""
Dayfold Deterministic Planning Engine
======================================
The LLM is the interface; this module is the brain of the scheduler.

The planner:
1. Takes tasks with deadlines/estimates and existing calendar events.
2. Computes available intervals within working hours.
3. Greedily places tasks using priority/deadline scoring.
4. Respects focus-block lengths, breaks, and buffers.
5. Splits long tasks into multiple blocks.
6. Returns a Plan with rationale for each block and unscheduled reasons.

All time arithmetic is deterministic Python—no LLM involved.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional, overload
import uuid


@overload
def ensure_utc(dt: None) -> None: ...
@overload
def ensure_utc(dt: datetime) -> datetime: ...
def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if isinstance(dt, str):
        cleaned_str = dt.replace("Z", "+00:00") if dt.endswith("Z") else dt
        dt = datetime.fromisoformat(cleaned_str)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_utc_iso(dt: Optional[datetime | str]) -> Optional[str]:
    """
    Format a datetime object (or ISO string) into strict ISO-8601 UTC with 'Z' suffix.
    Guarantees no naive datetimes leave the backend without timezone designation.
    E.g. 2026-11-02T11:30:00Z
    """
    if dt is None:
        return None
    if isinstance(dt, str):
        if dt.endswith("Z"):
            return dt
        cleaned = dt.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(cleaned)
            return to_utc_iso(parsed)
        except Exception:
            return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── Data Structures ──────────────────────────────────────────────────────────

@dataclass
class PlanTask:
    """Input task for the planner."""
    id: str
    title: str
    priority: int  # 1=critical, 2=high, 3=medium, 4=low
    estimate_minutes: int  # required; caller supplies default if null
    deadline_at: Optional[datetime] = None
    deadline_is_hard: bool = False
    project_id: Optional[str] = None
    color: Optional[str] = None


@dataclass
class FixedEvent:
    """Existing calendar event that blocks time."""
    id: str
    title: str
    starts_at: datetime
    ends_at: datetime
    is_busy: bool = True


@dataclass
class WorkingHours:
    """Working hours for a given day."""
    start_hour: int = 9
    start_minute: int = 0
    end_hour: int = 18
    end_minute: int = 0


@dataclass
class PlannerConfig:
    """User preferences for the planner."""
    working_hours: dict[str, WorkingHours] = field(default_factory=dict)
    # weekday name -> WorkingHours (monday, tuesday, etc.)
    focus_block_minutes: int = 90
    break_minutes: int = 15
    meeting_buffer_minutes: int = 10
    timezone_name: str = "UTC"
    add_breaks: bool = True


@dataclass
class PlannedBlock:
    """A placed time block in the output plan."""
    id: str
    kind: str  # task|break|buffer|fixed_event
    title: str
    starts_at: datetime
    ends_at: datetime
    task_id: Optional[str] = None
    calendar_event_id: Optional[str] = None
    rationale: list[str] = field(default_factory=list)
    pinned: bool = False
    color: Optional[str] = None
    part_of: Optional[int] = None   # e.g. "part 1 of 2"
    total_parts: Optional[int] = None


@dataclass
class UnscheduledTask:
    task_id: Optional[str]
    title: str
    reason: str


@dataclass
class PlanResult:
    """Output of the planner."""
    plan_id: str
    horizon_start: datetime
    horizon_end: datetime
    blocks: list[PlannedBlock]
    unscheduled: list[UnscheduledTask]
    capacity_minutes: int
    scheduled_minutes: int
    conflicts: list[str]
    is_simulation: bool = False


# ─── Interval Helpers ─────────────────────────────────────────────────────────

@dataclass
class Interval:
    start: datetime
    end: datetime
    preceding_duration: int = 0
    preceding_title: str = ""

    @property
    def duration_minutes(self) -> float:
        return (self.end - self.start).total_seconds() / 60


def subtract_intervals(free: list[Interval], busy: list[Interval]) -> list[Interval]:
    """Subtract busy intervals from free intervals."""
    result: list[Interval] = []
    for f in free:
        remaining = [f]
        for b in busy:
            new_remaining = []
            for r in remaining:
                if b.end <= r.start or b.start >= r.end:
                    new_remaining.append(r)
                else:
                    if b.start > r.start:
                        new_remaining.append(Interval(r.start, b.start))
                    if b.end < r.end:
                        new_remaining.append(Interval(b.end, r.end))
            remaining = new_remaining
        result.extend(remaining)
    return sorted(result, key=lambda x: x.start)


def get_working_intervals(
    horizon_start: datetime,
    horizon_end: datetime,
    config: PlannerConfig,
) -> list[Interval]:
    """Generate working-hour intervals within the horizon."""
    from zoneinfo import ZoneInfo
    try:
        user_tz = ZoneInfo(config.timezone_name) if config.timezone_name else timezone.utc
    except Exception:
        user_tz = timezone.utc

    intervals: list[Interval] = []
    local_start = horizon_start.astimezone(user_tz)
    local_end = horizon_end.astimezone(user_tz)

    current_date = local_start.date()
    end_date = local_end.date()

    while current_date <= end_date:
        weekday = current_date.strftime("%A").lower()
        wh = config.working_hours.get(weekday)
        if wh is None:
            # Default working hours if not specified
            wh = WorkingHours()

        local_day_start = datetime(
            current_date.year, current_date.month, current_date.day,
            wh.start_hour, wh.start_minute, 0, tzinfo=user_tz
        )
        local_day_end = datetime(
            current_date.year, current_date.month, current_date.day,
            wh.end_hour, wh.end_minute, 0, tzinfo=user_tz
        )

        utc_day_start = local_day_start.astimezone(timezone.utc)
        utc_day_end = local_day_end.astimezone(timezone.utc)

        # Clamp to the horizon
        actual_start = max(utc_day_start, horizon_start)
        actual_end = min(utc_day_end, horizon_end)

        if actual_start < actual_end:
            intervals.append(Interval(actual_start, actual_end))

        current_date += timedelta(days=1)

    return sorted(intervals, key=lambda x: x.start)


# ─── Scoring ──────────────────────────────────────────────────────────────────

def score_task(task: PlanTask, now: datetime) -> float:
    """
    Higher score = schedule sooner.
    Factors: priority, deadline urgency, estimate size (larger = place earlier).
    """
    # Priority component (1=critical gets highest)
    priority_score = (5 - task.priority) * 100  # 400 for critical, 100 for low

    # Deadline urgency component
    deadline_score = 0.0
    if task.deadline_at:
        hours_until = (task.deadline_at - now).total_seconds() / 3600
        if hours_until <= 0:
            deadline_score = 10000  # overdue
        elif hours_until <= 4:
            deadline_score = 2000
        elif hours_until <= 24:
            deadline_score = 1000
        elif hours_until <= 48:
            deadline_score = 500
        elif hours_until <= 72:
            deadline_score = 200
        else:
            deadline_score = max(0, 100 - hours_until)

    # Effort component (larger effort = slightly higher priority to not get bumped)
    effort_score = min(task.estimate_minutes / 10, 50)

    return priority_score + deadline_score + effort_score


# ─── Main Planner ─────────────────────────────────────────────────────────────

def generate_plan(
    tasks: list[PlanTask],
    fixed_events: list[FixedEvent],
    horizon_start: datetime,
    horizon_end: datetime,
    config: PlannerConfig,
    is_simulation: bool = False,
    simulation_overrides: Optional[dict] = None,
) -> PlanResult:
    """
    Core deterministic scheduling algorithm.

    1. Build working-hour intervals.
    2. Subtract fixed (busy) events.
    3. Score and sort tasks by priority + deadline urgency.
    4. Greedily place tasks into free intervals, splitting if needed.
    5. Insert breaks between task blocks.
    6. Collect unscheduled tasks with reasons.
    """
    horizon_start = ensure_utc(horizon_start)
    horizon_end = ensure_utc(horizon_end)
    now = horizon_start
    plan_id = str(uuid.uuid4())
    blocks: list[PlannedBlock] = []
    unscheduled: list[UnscheduledTask] = []
    conflicts: list[str] = []

    # Apply simulation overrides if provided
    effective_events = []
    for evt in fixed_events:
        effective_events.append(FixedEvent(
            id=evt.id,
            title=evt.title,
            starts_at=ensure_utc(evt.starts_at),
            ends_at=ensure_utc(evt.ends_at),
            is_busy=evt.is_busy,
        ))

    effective_tasks = []
    for t in tasks:
        effective_tasks.append(PlanTask(
            id=t.id,
            title=t.title,
            priority=t.priority,
            estimate_minutes=t.estimate_minutes,
            deadline_at=ensure_utc(t.deadline_at),
            deadline_is_hard=t.deadline_is_hard,
            project_id=t.project_id,
            color=t.color,
        ))

    if is_simulation and simulation_overrides:
        # Apply deadline changes, availability changes, etc.
        deadline_changes = simulation_overrides.get("deadline_changes", {})
        for task in effective_tasks:
            if task.id in deadline_changes:
                task.deadline_at = ensure_utc(deadline_changes[task.id])

        # Additional availability blocks (e.g. sudden emergency meeting)
        extra_busy = simulation_overrides.get("extra_busy_periods", [])
        for period in extra_busy:
            effective_events.append(FixedEvent(
                id=f"sim_{uuid.uuid4()}",
                title=period.get("title", "Unavailable"),
                starts_at=ensure_utc(period["starts_at"]),
                ends_at=ensure_utc(period["ends_at"]),
                is_busy=True,
            ))

        # Reduced available hours (e.g. lost afternoon or early departure)
        reduced_hours = simulation_overrides.get("reduced_hours")
        if reduced_hours and float(reduced_hours) > 0:
            reduction_hours = float(reduced_hours)
            reduction_start = max(horizon_start, horizon_end - timedelta(hours=reduction_hours))
            effective_events.append(FixedEvent(
                id=f"sim_reduced_{uuid.uuid4()}",
                title=f"Reduced Hours (-{reduction_hours:g}h)",
                starts_at=reduction_start,
                ends_at=horizon_end,
                is_busy=True,
            ))

    # Step 1: Fixed event blocks & conflict detection
    sorted_evts = sorted([e for e in effective_events if e.is_busy], key=lambda e: e.starts_at)
    for i in range(len(sorted_evts) - 1):
        if sorted_evts[i].ends_at > sorted_evts[i+1].starts_at:
            conflicts.append(
                f"Fixed commitment conflict: '{sorted_evts[i].title}' overlaps with '{sorted_evts[i+1].title}'"
            )

    for evt in effective_events:
        if evt.starts_at < horizon_end and evt.ends_at > horizon_start and evt.is_busy:
            block = PlannedBlock(
                id=str(uuid.uuid4()),
                kind="fixed_event",
                title=evt.title,
                starts_at=evt.starts_at,
                ends_at=evt.ends_at,
                calendar_event_id=evt.id,
                rationale=["Fixed commitment"],
                pinned=True,
            )
            blocks.append(block)

    # Step 2: Compute available intervals
    working_intervals = get_working_intervals(horizon_start, horizon_end, config)
    busy_intervals = [
        Interval(evt.starts_at, evt.ends_at)
        for evt in effective_events
        if evt.is_busy and evt.starts_at < horizon_end and evt.ends_at > horizon_start
    ]
    # Add buffer around events
    buffered_busy = []
    for b in busy_intervals:
        buf = config.meeting_buffer_minutes
        buffered_busy.append(Interval(
            b.start - timedelta(minutes=buf),
            b.end + timedelta(minutes=buf),
        ))

    free_intervals = subtract_intervals(working_intervals, buffered_busy)

    # Track capacity
    capacity_minutes = sum(iv.duration_minutes for iv in free_intervals)

    # Step 3: Score and sort tasks
    scored_tasks = sorted(effective_tasks, key=lambda t: score_task(t, now), reverse=True)

    # Step 4: Greedy placement
    scheduled_minutes = 0
    # We'll consume free intervals as we place tasks
    remaining_free = [Interval(iv.start, iv.end) for iv in free_intervals]
    last_block_end: Optional[datetime] = None
    last_scheduled_duration: int = 0
    last_scheduled_title: str = ""

    for task in scored_tasks:
        needed_minutes = task.estimate_minutes
        if needed_minutes <= 0:
            needed_minutes = 60  # default

        # Check for hard deadline violation
        if task.deadline_at and task.deadline_at <= horizon_start:
            unscheduled.append(UnscheduledTask(
                task_id=task.id,
                title=task.title,
                reason="Deadline has already passed",
            ))
            continue

        # Split into focus blocks
        max_block = config.focus_block_minutes
        chunks: list[int] = []
        remaining = needed_minutes
        while remaining > 0:
            chunk = min(remaining, max_block)
            chunks.append(chunk)
            remaining -= chunk

        total_chunks = len(chunks)
        placed_chunks = 0
        chunk_blocks: list[PlannedBlock] = []
        break_blocks_for_task: list[PlannedBlock] = []

        for chunk_idx, chunk_minutes in enumerate(chunks):
            placed = False

            for i, interval in enumerate(remaining_free):
                available = interval.duration_minutes

                # Check if break is needed before this chunk
                needs_break = False
                if config.add_breaks:
                    if placed_chunks > 0 and last_block_end is not None and last_block_end == interval.start:
                        # Split focus session chunks of the same task
                        needs_break = True
                    elif placed_chunks == 0 and interval.preceding_duration >= 45:
                        # Consecutive activities across distinct tasks where preceding activity is >= 45 min
                        needs_break = True

                break_len = config.break_minutes if needs_break else 0

                # Check available capacity for both break (if needed) and chunk
                if available < chunk_minutes + break_len:
                    continue

                if needs_break:
                    b_start = interval.start
                    b_end = b_start + timedelta(minutes=break_len)
                    t_start = b_end
                    t_end = t_start + timedelta(minutes=chunk_minutes)
                else:
                    t_start = interval.start
                    t_end = t_start + timedelta(minutes=chunk_minutes)

                # Check against hard deadline
                if task.deadline_at and task.deadline_is_hard and t_end > task.deadline_at:
                    continue

                # Successful placement in this interval
                if needs_break:
                    break_block = PlannedBlock(
                        id=str(uuid.uuid4()),
                        kind="break",
                        title="Break",
                        starts_at=b_start,
                        ends_at=b_end,
                        rationale=["Recovery break between focus sessions" if placed_chunks > 0 else "Recovery break after focus session"],
                    )
                    break_blocks_for_task.append(break_block)

                rationale = []
                if task.deadline_at:
                    hours = (task.deadline_at - now).total_seconds() / 3600
                    if hours <= 24:
                        rationale.append(f"Due in {int(hours)}h — urgent")
                    else:
                        days = hours / 24
                        rationale.append(f"Due in {days:.1f} days")
                if task.priority == 1:
                    rationale.append("Critical priority")
                elif task.priority == 2:
                    rationale.append("High priority")
                if total_chunks > 1:
                    rationale.append(f"Part {chunk_idx + 1} of {total_chunks} (split for focus)")

                block = PlannedBlock(
                    id=str(uuid.uuid4()),
                    kind="task",
                    title=task.title,
                    task_id=task.id,
                    starts_at=t_start,
                    ends_at=t_end,
                    rationale=rationale,
                    color=task.color,
                    part_of=chunk_idx + 1 if total_chunks > 1 else None,
                    total_parts=total_chunks if total_chunks > 1 else None,
                )
                chunk_blocks.append(block)
                last_block_end = t_end
                last_scheduled_duration = chunk_minutes
                last_scheduled_title = task.title
                scheduled_minutes += chunk_minutes
                placed_chunks += 1

                # Trim the interval in remaining_free
                if t_end < interval.end:
                    remaining_free[i] = Interval(t_end, interval.end, preceding_duration=chunk_minutes, preceding_title=task.title)
                else:
                    remaining_free.pop(i)

                placed = True
                break

            if not placed:
                # Could not place this chunk
                break

        if placed_chunks > 0:
            blocks.extend(break_blocks_for_task)
            blocks.extend(chunk_blocks)

        if placed_chunks < total_chunks:
            if placed_chunks == 0:
                break_conflict = False
                if config.add_breaks and last_scheduled_duration >= 45:
                    for iv in free_intervals:
                        if iv.duration_minutes >= chunks[0]:
                            if not (task.deadline_at and task.deadline_is_hard and iv.start + timedelta(minutes=chunks[0]) > task.deadline_at):
                                break_conflict = True
                                break
                if break_conflict:
                    unscheduled.append(UnscheduledTask(
                        task_id=task.id,
                        title=task.title,
                        reason=f"Insufficient available time to accommodate {config.break_minutes}-minute recovery break before hard deadline/working hours",
                    ))
                    conflicts.append(
                        f"Task '{task.title}' was left unscheduled: requested {config.break_minutes}-minute break after '{last_scheduled_title}' could not fit without violating constraint."
                    )
                else:
                    unscheduled.append(UnscheduledTask(
                        task_id=task.id,
                        title=task.title,
                        reason="Insufficient available time before deadline",
                    ))
            else:
                unscheduled.append(UnscheduledTask(
                    task_id=task.id,
                    title=task.title,
                    reason=f"Only partially scheduled ({placed_chunks}/{total_chunks} sessions fit)",
                ))

    # Sort all blocks by start time
    blocks.sort(key=lambda b: b.starts_at)

    return PlanResult(
        plan_id=plan_id,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
        blocks=blocks,
        unscheduled=unscheduled,
        capacity_minutes=int(capacity_minutes),
        scheduled_minutes=scheduled_minutes,
        conflicts=conflicts,
        is_simulation=is_simulation,
    )

