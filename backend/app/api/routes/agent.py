from __future__ import annotations
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json
from zoneinfo import ZoneInfo

from app.db.session import get_db
from app.models.models import (
    Conversation, Message, PendingAction, User, UserPreferences,
    Task, CalendarEvent, Plan, PlanBlock, PlanUnscheduled
)
from app.core.deps import get_current_user
from app.core.rate_limit import rate_limit_ai
from app.services.agent.extractor import extract_structured_plan_data
from app.services.agent.agent import _make_payload_hash, _prefs_to_config
from app.services.planner.engine import PlanTask, FixedEvent, generate_plan, to_utc_iso, WorkingHours
from app.services.auth.auth_service import write_audit

router = APIRouter(prefix="/agent", tags=["agent"])


class MessageRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    timezone: Optional[str] = None
    reference_date: Optional[str] = None


class ExtractRequest(BaseModel):
    message: str
    reference_date: Optional[str] = None
    timezone: Optional[str] = None
    interface_date: Optional[str] = None


class PlanExtractedRequest(BaseModel):
    target_date: str
    tasks: list[dict]
    fixed_commitments: list[dict]
    preferences: Optional[list[str]] = None
    constraints: Optional[list[str]] = None
    conflicts: Optional[list[dict]] = None
    lens: Optional[str] = None
    conversation_id: Optional[str] = None
    timezone: Optional[str] = None


@router.post("/extract", dependencies=[Depends(rate_limit_ai("extract"))])
async def extract_tasks_endpoint(
    body: ExtractRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Step 1 of voice/text planning:
    Processes natural-language instructions using Google Gemini structured extraction (gemini-3.6-flash).
    Extracts flexible tasks, fixed commitments, preferences, constraints, dates, and ambiguities.
    If Gemini is unavailable, rate-limited, or fails, safely uses heuristic extraction as an explicit fallback.
    """
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="Spoken or typed instruction cannot be empty.")

    tz_str = body.timezone or current_user.timezone or "UTC"
    try:
        user_tz = ZoneInfo(tz_str)
        now_in_tz = datetime.now(user_tz)
    except Exception:
        user_tz = timezone.utc
        now_in_tz = datetime.now(timezone.utc)

    if body.reference_date:
        try:
            ref_d = date.fromisoformat(body.reference_date)
            now_in_tz = datetime(ref_d.year, ref_d.month, ref_d.day, now_in_tz.hour, now_in_tz.minute, tzinfo=user_tz)
        except Exception:
            pass

    from app.core.config import settings

    gemini_key = getattr(settings, "GEMINI_API_KEY", "")
    target_model = getattr(settings, "GEMINI_EXTRACT_MODEL", None) or getattr(settings, "GEMINI_MODEL", None) or "gemini-3.6-flash"

    # 1. Attempt Gemini Structured Extraction if API key is present
    if gemini_key:
        try:
            from app.services.agent.gemini_extractor import extract_with_gemini

            max_attempts = 2
            last_err = None
            for attempt in range(1, max_attempts + 1):
                try:
                    gemini_result = await extract_with_gemini(
                        text=body.message,
                        reference_dt=now_in_tz,
                        tz_name=tz_str,
                        interface_date=body.interface_date,
                        model_override=target_model,
                        timeout_seconds=25.0,
                    )
                    payload = gemini_result["standard_payload"]
                    payload["extraction_source"] = "gemini"
                    payload["model_name"] = gemini_result["metadata"]["model"]
                    payload["fallback_used"] = False
                    payload["fallback_reason"] = None
                    payload["latency_ms"] = gemini_result["metadata"]["latency_ms"]
                    payload["token_usage"] = gemini_result["metadata"].get("token_usage", {})
                    return payload
                except Exception as call_err:
                    last_err = call_err
                    err_str = str(call_err).lower()
                    if attempt < max_attempts and ("503" in err_str or "504" in err_str or "deadline" in err_str):
                        import asyncio
                        await asyncio.sleep(1.0)
                        continue
                    break

            err_msg = str(last_err) if last_err else "Unknown Gemini error"
            err_lower = err_msg.lower()
            if "429" in err_lower or "resource_exhausted" in err_lower:
                fallback_reason = "Google Gemini quota/rate limit reached. Switched to rule-based parser."
            elif "503" in err_lower or "high demand" in err_lower:
                fallback_reason = "Google Gemini service currently experiencing high demand. Switched to rule-based parser."
            elif "504" in err_lower or "timeout" in err_lower or "deadline" in err_lower:
                fallback_reason = "Google Gemini request timed out. Switched to rule-based parser."
            else:
                fallback_reason = f"Gemini extraction unavailable ({type(last_err).__name__}). Switched to rule-based parser."
        except Exception as outer_err:
            fallback_reason = f"Gemini initialization error ({type(outer_err).__name__}). Switched to rule-based parser."
    else:
        fallback_reason = "GEMINI_API_KEY not configured on server. Used rule-based parser."

    # 2. Heuristic Fallback
    fallback_extracted = extract_structured_plan_data(body.message, now_in_tz, tz_str, body.interface_date)
    fallback_extracted["extraction_source"] = "heuristic_fallback"
    fallback_extracted["model_name"] = None
    fallback_extracted["fallback_used"] = True
    fallback_extracted["fallback_reason"] = fallback_reason
    return fallback_extracted


@router.post("/extract-gemini-prototype", dependencies=[Depends(rate_limit_ai("extract_prototype"))])
async def extract_gemini_prototype_endpoint(
    body: ExtractRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Isolated prototype endpoint:
    Direct structured extraction using Google Gemini with strict Pydantic JSON schema enforcement.
    Strictly read-only: does NOT create database records or schedule activities.
    Strictly isolated: does NOT replace /agent/extract.
    Strict: never silently falls back to the old regex parser.
    """
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="Spoken or typed instruction cannot be empty.")

    tz_str = body.timezone or current_user.timezone or "UTC"
    try:
        user_tz = ZoneInfo(tz_str)
        now_in_tz = datetime.now(user_tz)
    except Exception:
        user_tz = timezone.utc
        now_in_tz = datetime.now(timezone.utc)

    if body.reference_date:
        try:
            ref_d = date.fromisoformat(body.reference_date)
            now_in_tz = datetime(ref_d.year, ref_d.month, ref_d.day, now_in_tz.hour, now_in_tz.minute, tzinfo=user_tz)
        except Exception:
            pass

    try:
        from app.services.agent.gemini_extractor import extract_with_gemini
        result = await extract_with_gemini(
            text=body.message,
            reference_dt=now_in_tz,
            tz_name=tz_str,
            interface_date=body.interface_date,
        )
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except RuntimeError as run_err:
        raise HTTPException(status_code=503, detail=str(run_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini prototype extraction error: {str(e)}")


@router.post("/plan-extracted")
async def plan_extracted_endpoint(
    body: PlanExtractedRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2 of voice planning:
    Persists user-confirmed tasks and fixed commitments, deterministically schedules
    for the target date, and creates an approval pending action.
    """
    import re
    try:
        target_d = date.fromisoformat(body.target_date)
    except Exception:
        target_d = datetime.now(timezone.utc).date()

    tz_str = body.timezone or current_user.timezone or "UTC"
    try:
        user_tz = ZoneInfo(tz_str)
    except Exception:
        user_tz = timezone.utc

    created_events = []
    # 1. Persist confirmed fixed commitments on target_date
    for fc in body.fixed_commitments:
        title = fc.get("title", "Fixed Commitment").strip()
        if not title:
            continue
        s_time = fc.get("start_time", "09:00")
        e_time = fc.get("end_time", "10:00")
        try:
            sh, sm = map(int, s_time.split(":"))
            eh, em = map(int, e_time.split(":"))
            starts_at = datetime(target_d.year, target_d.month, target_d.day, sh, sm, tzinfo=user_tz).astimezone(timezone.utc)
            ends_at = datetime(target_d.year, target_d.month, target_d.day, eh, em, tzinfo=user_tz).astimezone(timezone.utc)
            if ends_at <= starts_at:
                ends_at = starts_at + timedelta(minutes=fc.get("duration_minutes", 60))

            event = CalendarEvent(
                user_id=current_user.id,
                title=title,
                starts_at=starts_at,
                ends_at=ends_at,
                timezone=tz_str,
                is_busy=True,
                is_fixed=True,
                source="voice",
            )
            db.add(event)
            created_events.append(event)
        except Exception:
            continue

    # Parse preferences & constraints for wake up time & errand deadlines & breaks
    wake_up_hour = None
    wake_up_minute = 0
    errand_deadline_hour = None
    break_duration_minutes = None
    explicit_no_breaks = False
    for pref in (body.preferences or []) + (body.constraints or []):
        pref_lower = pref.lower().strip()
        m_wake = re.search(
            r'\b(?:wake\s*up|wake|start\s+(?:the\s+|my\s+)?(?:day|workday|morning|schedule)?|begin\s+(?:the\s+|my\s+)?(?:day|workday|morning)?|day\s+starts?|start|begin)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b',
            pref_lower
        )
        if m_wake:
            hr = int(m_wake.group(1))
            mn = int(m_wake.group(2)) if m_wake.group(2) else 0
            meridiem = m_wake.group(3)
            if meridiem == 'pm' and hr < 12:
                hr += 12
            elif meridiem == 'am' and hr == 12:
                hr = 0
            wake_up_hour = hr
            wake_up_minute = mn

        m_err = re.search(r'(?:finish|complete|do)?\s*(?:important\s*)?errands?\s*before\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', pref_lower)
        if m_err:
            ehr = int(m_err.group(1))
            em = m_err.group(3)
            if em == 'pm' and ehr < 12:
                ehr += 12
            elif em == 'am' and ehr == 12:
                ehr = 0
            errand_deadline_hour = ehr

        m_break = re.search(r'(?:at\s+least\s+)?(\d{1,3})\s*(?:-| )?min(?:ute)?s?\s*breaks?', pref_lower)
        if not m_break:
            m_break = re.search(r'breaks?\s*(?:of\s*(?:at\s+least\s*)?)?(\d{1,3})\s*(?:-| )?min(?:ute)?s?', pref_lower)
        if m_break:
            break_duration_minutes = int(m_break.group(1))

        if any(nb in pref_lower for nb in ["no break", "without break", "no breaks", "without breaks"]):
            explicit_no_breaks = True

    # 2. Persist confirmed tasks with deadline on target_date
    created_tasks = []
    day_end = datetime(target_d.year, target_d.month, target_d.day, 23, 59, 59, tzinfo=user_tz).astimezone(timezone.utc)
    errand_deadline = datetime(target_d.year, target_d.month, target_d.day, errand_deadline_hour, 0, 0, tzinfo=user_tz).astimezone(timezone.utc) if errand_deadline_hour else None

    for t in body.tasks:
        title = t.get("title", "").strip()
        if not title:
            continue
        duration = t.get("duration_minutes") or 45
        priority = t.get("priority") or 3

        desc = ""
        if body.lens and body.lens != "all":
            desc = f"[lens:{body.lens.lower()}]"

        is_errand = any(k in title.lower() for k in ["errand", "groceries", "grocery", "bank", "dry clean", "post office", "pharmacy"])
        t_constraint = t.get("constraint")
        t_dl_raw = t.get("deadline")

        t_deadline = day_end
        t_hard = False

        if is_errand and errand_deadline:
            t_deadline = errand_deadline
            t_hard = True
        elif t_constraint == "before lunch":
            t_deadline = datetime(target_d.year, target_d.month, target_d.day, 13, 0, 0, tzinfo=user_tz).astimezone(timezone.utc)
            t_hard = True
        elif t_dl_raw and "before" in str(t_dl_raw).lower():
            m_dl_hr = re.search(r'before\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', str(t_dl_raw).lower())
            if m_dl_hr:
                dl_h = int(m_dl_hr.group(1))
                dl_mer = m_dl_hr.group(3)
                if dl_mer == 'pm' and dl_h < 12:
                    dl_h += 12
                elif dl_mer == 'am' and dl_h == 12:
                    dl_h = 0
                t_deadline = datetime(target_d.year, target_d.month, target_d.day, dl_h, 0, 0, tzinfo=user_tz).astimezone(timezone.utc)
                t_hard = True

        task = Task(
            user_id=current_user.id,
            title=title,
            description=desc,
            priority=priority,
            estimate_minutes=duration,
            deadline_at=t_deadline,
            deadline_is_hard=t_hard,
            source="voice",
        )
        db.add(task)
        created_tasks.append(task)

    await db.flush()

    # 3. Retrieve user preferences for operating hours
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = prefs_result.scalar_one_or_none()
    config = _prefs_to_config(prefs, tz_str)
    config.timezone_name = tz_str
    if break_duration_minutes is not None:
        config.break_minutes = break_duration_minutes
        config.add_breaks = True
    elif explicit_no_breaks:
        config.add_breaks = False

    # 4. Determine horizon boundaries for target date
    weekday_name = target_d.strftime("%A").lower()
    wh_start_hour = 9
    wh_start_minute = 0
    wh_end_hour = 18
    wh_end_minute = 0
    if prefs and prefs.working_hours and prefs.working_hours.get(weekday_name):
        wh_start_hour = prefs.working_hours[weekday_name].get("start_hour", 9)
        wh_start_minute = prefs.working_hours[weekday_name].get("start_minute", 0)
        wh_end_hour = prefs.working_hours[weekday_name].get("end_hour", 18)
        wh_end_minute = prefs.working_hours[weekday_name].get("end_minute", 0)

    # Strictly enforce per-plan requested start time on flexible task operating window
    if wake_up_hour is not None:
        wh_start_hour = wake_up_hour
        wh_start_minute = wake_up_minute
        # Clamp target weekday working hours
        target_wh = config.working_hours.get(weekday_name, WorkingHours())
        target_wh.start_hour = wake_up_hour
        target_wh.start_minute = wake_up_minute
        config.working_hours[weekday_name] = target_wh
        # Also clamp all days in config.working_hours so flexible tasks cannot start before requested start time
        for day_name, d_wh in config.working_hours.items():
            if d_wh.start_hour < wake_up_hour or (d_wh.start_hour == wake_up_hour and d_wh.start_minute < wake_up_minute):
                d_wh.start_hour = wake_up_hour
                d_wh.start_minute = wake_up_minute

    default_start_dt = datetime(target_d.year, target_d.month, target_d.day, wh_start_hour, wh_start_minute, tzinfo=user_tz).astimezone(timezone.utc)
    default_end_dt = datetime(target_d.year, target_d.month, target_d.day, wh_end_hour, wh_end_minute, tzinfo=user_tz).astimezone(timezone.utc)

    # Fixed events outside flexible operating hours are preserved
    earliest_event_start = min([e.starts_at for e in created_events], default=default_start_dt)
    latest_event_end = max([e.ends_at for e in created_events], default=default_end_dt)

    horizon_start = min(default_start_dt, earliest_event_start)
    horizon_end = max(default_end_dt, latest_event_end)

    # 5. Build inputs for deterministic planner
    plan_tasks = [
        PlanTask(
            id=t.id,
            title=t.title,
            priority=t.priority or 3,
            estimate_minutes=t.estimate_minutes or 45,
            deadline_at=t.deadline_at,
            deadline_is_hard=t.deadline_is_hard,
        )
        for t in created_tasks
    ]

    fixed_events = [
        FixedEvent(
            id=e.id,
            title=e.title,
            starts_at=e.starts_at,
            ends_at=e.ends_at,
            is_busy=e.is_busy,
        )
        for e in created_events
    ]

    # Run deterministic planner
    plan_result = generate_plan(
        tasks=plan_tasks,
        fixed_events=fixed_events,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
        config=config,
    )

    # Validation Guard: ensure every fixed commitment starts at the exact requested time
    for ev in created_events:
        matching_block = next((b for b in plan_result.blocks if b.calendar_event_id == ev.id or (b.kind == "fixed_event" and b.title == ev.title)), None)
        if matching_block:
            if abs((matching_block.starts_at - ev.starts_at).total_seconds()) > 60:
                ev_local = ev.starts_at.astimezone(user_tz).strftime("%I:%M %p")
                blk_local = matching_block.starts_at.astimezone(user_tz).strftime("%I:%M %p")
                raise HTTPException(
                    status_code=400,
                    detail=f"Appointment mismatch: Requested at {ev_local} but scheduled at {blk_local}. Proposal blocked."
                )

    # 6. Save proposed Plan
    task_blocks = [b for b in plan_result.blocks if b.kind == "task"]
    unique_task_ids = set(b.task_id for b in task_blocks if b.task_id)
    blocks_without_id = [b for b in task_blocks if not b.task_id]
    unique_no_id_titles = set(b.title for b in blocks_without_id)
    unique_task_count = len(unique_task_ids) + len(unique_no_id_titles)
    if unique_task_count == 0:
        unique_task_count = len(task_blocks)

    scheduled_blocks_count = len(task_blocks)
    event_count = len(created_events)
    unscheduled_count = len(plan_result.unscheduled)
    total_blocks_count = len(plan_result.blocks)

    plan_db = Plan(
        user_id=current_user.id,
        horizon_start=horizon_start,
        horizon_end=horizon_end,
        status="proposed",
        summary=f"Plan for {target_d.strftime('%A, %b %d')}",
        metrics={
            "capacity_minutes": plan_result.capacity_minutes,
            "scheduled_minutes": plan_result.scheduled_minutes,
            "unique_tasks_count": unique_task_count,
            "scheduled_tasks_count": unique_task_count,
            "scheduled_blocks_count": scheduled_blocks_count,
            "fixed_commitments_count": event_count,
            "unscheduled_tasks_count": unscheduled_count,
        },
        inputs={"target_date": target_d.isoformat(), "lens": body.lens},
        is_simulation=False,
    )
    db.add(plan_db)
    await db.flush()

    for block in plan_result.blocks:
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

    for u in plan_result.unscheduled:
        pu = PlanUnscheduled(
            plan_id=plan_db.id,
            task_id=u.task_id,
            task_title=u.title,
            reason=u.reason,
        )
        db.add(pu)

    # 7. Create Pending Action for user approval (with Stale Proposal Protection)
    pending_action_data = None
    if task_blocks or created_events:
        # Supersede older pending actions for this user and target_date
        old_actions = await db.execute(
            select(PendingAction).where(
                PendingAction.user_id == current_user.id,
                PendingAction.status == "proposed",
            )
        )
        for old_act in old_actions.scalars().all():
            if old_act.payload and old_act.payload.get("target_date") == target_d.isoformat():
                old_act.status = "superseded"

        payload = {
            "type": "plan_commit",
            "plan_id": plan_db.id,
            "summary": plan_db.summary,
            "blocks_count": total_blocks_count,
            "target_date": target_d.isoformat(),
            "unique_tasks_count": unique_task_count,
            "scheduled_tasks_count": unique_task_count,
            "scheduled_blocks_count": scheduled_blocks_count,
            "fixed_commitments_count": event_count,
            "unscheduled_tasks_count": unscheduled_count,
            "total_blocks_count": total_blocks_count,
        }
        payload_hash = _make_payload_hash(payload)
        now_utc = datetime.now(timezone.utc)

        if scheduled_blocks_count > unique_task_count:
            blocks_desc = f"{unique_task_count} tasks across {scheduled_blocks_count} focus blocks"
        else:
            blocks_desc = f"{unique_task_count} tasks"

        action = PendingAction(
            user_id=current_user.id,
            type="plan_commit",
            payload=payload,
            payload_hash=payload_hash,
            risk_level="medium",
            status="proposed",
            title=f"Approve Schedule: {plan_db.summary}",
            description=f"Commit {blocks_desc} to your timeline for {target_d.strftime('%A, %b %d')}",
            proposed_at=now_utc,
            expires_at=now_utc + timedelta(minutes=30),
        )
        db.add(action)
        await db.flush()
        pending_action_data = {
            "id": action.id,
            "payload_hash": action.payload_hash,
            "title": action.title,
            "description": action.description,
            "expires_at": to_utc_iso(action.expires_at),
        }

    # 8. Human-readable spoken and UI summary
    date_str = target_d.strftime("%A, %b %d")

    first_act = plan_result.blocks[0].title if plan_result.blocks else "None"
    last_act = plan_result.blocks[-1].title if plan_result.blocks else "None"

    event_summary = f" around your {', '.join(e.title for e in created_events)}" if created_events else ""
    if unscheduled_count:
        unsch_names = ", ".join(u.title for u in plan_result.unscheduled)
        unscheduled_note = f" Note: {unscheduled_count} task(s) ({unsch_names}) could not fit in operating hours."
    else:
        unscheduled_note = ""

    if scheduled_blocks_count > unique_task_count:
        tasks_spoken = f"{unique_task_count} tasks across {scheduled_blocks_count} focus blocks"
    else:
        tasks_spoken = f"{unique_task_count} task(s)"

    reply = (
        f"Your {date_str} plan is ready. I've scheduled {tasks_spoken}{event_summary} on your timeline.{unscheduled_note} "
        f"Review the proposal and approve when ready!"
    )

    await write_audit(db, current_user.id, "user", "plan.generate", "plan", plan_db.id, {"target_date": target_d.isoformat()})

    return {
        "reply": reply,
        "target_date": target_d.isoformat(),
        "target_date_label": target_d.strftime("%A, %b %d, %Y"),
        "plan_id": plan_db.id,
        "plan": {
            "id": plan_db.id,
            "summary": plan_db.summary,
            "blocks": [
                {
                    "id": b.id,
                    "kind": b.kind,
                    "title": b.title,
                    "starts_at": to_utc_iso(b.starts_at),
                    "ends_at": to_utc_iso(b.ends_at),
                    "task_id": b.task_id,
                    "rationale": b.rationale,
                    "pinned": b.pinned,
                }
                for b in plan_result.blocks
            ],
            "unscheduled": [
                {"task_id": u.task_id, "title": u.title, "reason": u.reason}
                for u in plan_result.unscheduled
            ],
            "metrics": {
                "capacity_minutes": plan_result.capacity_minutes,
                "scheduled_minutes": plan_result.scheduled_minutes,
            },
        },
        "pending_action": pending_action_data,
        "pending_action_id": pending_action_data["id"] if pending_action_data else None,
        "stats": {
            "tasks_extracted": len(created_tasks),
            "events_extracted": event_count,
            "tasks_scheduled": unique_task_count,
            "blocks_scheduled": scheduled_blocks_count,
            "tasks_unscheduled": unscheduled_count,
            "first_activity": first_act,
            "last_activity": last_act,
        }
    }


@router.post("/messages")
async def send_message(
    body: MessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Direct endpoint for conversational text or voice submission.
    Runs extraction and scheduling pipeline end-to-end.
    """
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="Spoken or typed instruction cannot be empty.")

    tz_str = body.timezone or current_user.timezone or "UTC"
    try:
        user_tz = ZoneInfo(tz_str)
        now_in_tz = datetime.now(user_tz)
    except Exception:
        user_tz = timezone.utc
        now_in_tz = datetime.now(timezone.utc)

    if body.reference_date:
        try:
            ref_d = date.fromisoformat(body.reference_date)
            now_in_tz = datetime(ref_d.year, ref_d.month, ref_d.day, now_in_tz.hour, now_in_tz.minute, tzinfo=user_tz)
        except Exception:
            pass

    if body.conversation_id:
        conv_res = await db.execute(
            select(Conversation).where(
                Conversation.id == body.conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
        if not conv_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Conversation not found or not accessible")

    # Extract structured items
    extracted = extract_structured_plan_data(body.message, now_in_tz, tz_str)

    tasks = extracted.get("tasks", [])
    events = extracted.get("fixed_commitments", [])
    target_date = extracted.get("target_date", now_in_tz.date().isoformat())

    # If user provided actionable tasks or fixed commitments, plan them!
    if tasks or events:
        plan_req = PlanExtractedRequest(
            target_date=target_date,
            tasks=tasks,
            fixed_commitments=events,
            preferences=extracted.get("preferences", []),
            constraints=extracted.get("constraints", []),
            conflicts=extracted.get("conflicts", []),
            conversation_id=body.conversation_id,
            timezone=tz_str,
        )
        plan_res = await plan_extracted_endpoint(plan_req, current_user, db)
        return {
            "conversation_id": body.conversation_id,
            "reply": plan_res["reply"],
            "target_date": target_date,
            "target_date_label": extracted.get("target_date_label"),
            "extracted_tasks": tasks,
            "extracted_events": events,
            "extracted_preferences": extracted.get("preferences", []),
            "extracted_constraints": extracted.get("constraints", []),
            "conflicts": extracted.get("conflicts", []),
            "plan": plan_res["plan"],
            "pending_action_id": plan_res.get("pending_action_id"),
            "actions_taken": ["extract_tasks", "generate_schedule"] + (["propose_plan"] if plan_res.get("pending_action_id") else []),
            "stats": plan_res.get("stats"),
        }

    # Check if user asked to "plan my day" with zero new tasks
    msg_lower = body.message.lower()
    if any(p in msg_lower for p in ["plan my day", "plan today", "schedule today", "organize my day", "plan tomorrow", "organize tomorrow"]):
        # Check open tasks
        tasks_res = await db.execute(
            select(Task).where(Task.user_id == current_user.id, Task.status == "todo").limit(20)
        )
        existing_tasks = tasks_res.scalars().all()
        if not existing_tasks:
            return {
                "conversation_id": body.conversation_id,
                "reply": "You have no open tasks. Please speak your commitments or add tasks, and Dayfold will schedule your day.",
                "extracted_tasks": [],
                "extracted_events": [],
                "plan": None,
                "pending_action_id": None,
                "actions_taken": [],
            }
        else:
            tasks_data = [{"title": t.title, "duration_minutes": t.estimate_minutes or 45, "priority": t.priority} for t in existing_tasks]
            plan_req = PlanExtractedRequest(
                target_date=target_date,
                tasks=tasks_data,
                fixed_commitments=[],
                timezone=tz_str,
            )
            plan_res = await plan_extracted_endpoint(plan_req, current_user, db)
            return {
                "conversation_id": body.conversation_id,
                "reply": f"I've organized your {len(existing_tasks)} open tasks into {extracted.get('target_date_label', 'your day')}'s timeline.",
                "target_date": target_date,
                "target_date_label": extracted.get("target_date_label"),
                "extracted_tasks": tasks_data,
                "extracted_events": [],
                "plan": plan_res["plan"],
                "pending_action_id": plan_res.get("pending_action_id"),
                "actions_taken": ["generate_schedule", "propose_plan"],
            }

    # Non-actionable conversation
    return {
        "conversation_id": body.conversation_id,
        "reply": "I couldn't detect any specific tasks or events. Tell me what tasks, meetings, or appointments you have, and I will plan your day!",
        "extracted_tasks": [],
        "extracted_events": [],
        "plan": None,
        "pending_action_id": None,
        "actions_taken": [],
    }


@router.get("/conversations")
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(Conversation.user_id == current_user.id)
        .order_by(Conversation.started_at.desc()).limit(20)
    )
    convs = result.scalars().all()
    return [
        {
            "id": c.id,
            "channel": c.channel,
            "started_at": to_utc_iso(c.started_at),
            "ended_at": to_utc_iso(c.ended_at) if c.ended_at else None,
            "summary": c.summary,
        }
        for c in convs
    ]


@router.get("/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == current_user.id)
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Message).where(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc()).limit(100)
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": to_utc_iso(m.created_at),
        }
        for m in messages
    ]
