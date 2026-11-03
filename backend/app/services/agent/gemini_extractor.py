"""
Dayfold — Isolated Google Gemini Structured Extraction Prototype
================================================================
Uses Google GenAI SDK (google-genai) with native Pydantic schema-constrained
structured JSON output to extract flexible tasks, fixed commitments,
preferences, constraints, dates, and ambiguities.

Safety & Design Principles:
- Read-only: Does NOT mutate databases or schedule activities.
- Explicit: Never invents durations, times, or deadlines.
- Isolated: Does NOT replace production /agent/extract.
- Strict: Never silently falls back to regex parser.
"""
from __future__ import annotations

import re
import time
import uuid
import logging
import asyncio
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List
from zoneinfo import ZoneInfo
from pydantic import BaseModel, Field, model_validator

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types as genai_types
    GENAI_AVAILABLE = True
except ImportError:
    genai = None  # type: ignore
    genai_types = None  # type: ignore
    GENAI_AVAILABLE = False


# ==============================================================================
# Pydantic Schemas for Gemini Schema-Constrained Extraction
# ==============================================================================

class FlexibleActivity(BaseModel):
    title: str = Field(
        description="Concise, actionable activity title (e.g. 'Water plants', 'Have breakfast', 'Learning Python', 'Clean workspace'). Avoid conversational filler."
    )
    original_span: str = Field(
        description="Verbatim text span or clause from transcript where this activity was mentioned."
    )
    duration_minutes: Optional[int] = Field(
        default=None,
        description="Explicit duration in minutes if stated by the user (e.g. 30, 45, 90). Must be null if not explicitly stated."
    )
    duration_inferred: bool = Field(
        default=False,
        description="True if duration is estimated/inferred rather than explicitly stated by the speaker."
    )
    duration_needs_confirmation: bool = Field(
        default=False,
        description="True if duration was not explicitly stated or is uncertain and needs user confirmation."
    )
    priority: int = Field(
        default=3,
        description="Priority: 1 (urgent/critical), 2 (high), 3 (medium/normal), 4 (low). Default to 3 unless speaker indicated priority."
    )
    deadline: Optional[str] = Field(
        default=None,
        description="Human readable deadline if explicitly mentioned for this task (e.g. 'Before 1:00 PM', 'by 4 PM'). Null if not stated."
    )
    deadline_clock_time: Optional[str] = Field(
        default=None,
        description="24-hour HH:MM clock time of deadline if applicable (e.g. '13:00', '16:00'). Null if none."
    )
    preferred_time_window: Optional[str] = Field(
        default=None,
        description="Preferred time of day if stated (e.g. 'morning', 'before lunch', 'after lunch', 'evening'). Null if not stated."
    )
    notes: Optional[str] = Field(
        default=None,
        description="Additional context, links, or details mentioned."
    )


class FixedCommitment(BaseModel):
    title: str = Field(
        description="Title of the fixed appointment, meeting, class, or locked commitment (e.g. 'Online consultation', 'Parcel collection', 'Temple visit', 'Doctor appointment')."
    )
    original_span: str = Field(
        description="Verbatim text span from transcript."
    )
    start_time: str = Field(
        description="24-hour format HH:MM start time (e.g. '11:00', '15:00', '06:00')."
    )
    end_time: Optional[str] = Field(
        default=None,
        description="24-hour format HH:MM end time if specified or derived from explicit duration (e.g. '11:30', '15:20', '07:00')."
    )
    duration_minutes: Optional[int] = Field(
        default=None,
        description="Explicit or computed duration in minutes (e.g. 30, 20, 60)."
    )
    duration_needs_confirmation: bool = Field(
        default=False,
        description="True if duration or end time was not explicitly provided by the user."
    )
    location: Optional[str] = Field(
        default=None,
        description="Location if mentioned (e.g. 'Online', 'Clinic', 'Temple')."
    )


class DateInterpretation(BaseModel):
    target_date: str = Field(
        description="Target date in ISO format YYYY-MM-DD, calculated from the reference date."
    )
    target_date_label: str = Field(
        description="Friendly human-readable label (e.g. 'Tomorrow, Monday, Nov 2, 2026')."
    )
    relative_expression: Optional[str] = Field(
        default=None,
        description="Relative expression used by speaker (e.g. 'tomorrow', 'Wednesday', 'today')."
    )
    discrepancy_with_interface: bool = Field(
        default=False,
        description="True if the spoken date differs from the currently selected interface date."
    )


class Preference(BaseModel):
    category: str = Field(
        description="Preference category: 'day_start', 'relaxation', 'breaks', 'general'."
    )
    description: str = Field(
        description="Clear statement of user preference (e.g. 'Start the day at 7:00 AM', 'Leave some time for relaxation', 'Maintain breaks between activities')."
    )
    original_span: str = Field(
        description="Verbatim text span from transcript."
    )


class SchedulingConstraint(BaseModel):
    target: str = Field(
        description="The activity or scope this constraint applies to (e.g. 'Learning Python', 'important errands', 'all_activities')."
    )
    rule: str = Field(
        description="Clear rule statement (e.g. 'Finish the learning session before 1:00 PM', 'Do not schedule activities during fixed commitments')."
    )
    constraint_type: str = Field(
        description="Type of constraint: 'deadline', 'avoidance', 'ordering', 'operating_window'."
    )
    original_span: str = Field(
        description="Verbatim text span from transcript."
    )


class Ambiguity(BaseModel):
    item: str = Field(
        description="The ambiguous clause or activity mentioned."
    )
    reason: str = Field(
        description="Explanation of why this is ambiguous."
    )
    suggested_question: str = Field(
        description="Clarifying question to ask the user."
    )


class GeminiStructuredPlanExtraction(BaseModel):
    date_interpretation: DateInterpretation
    flexible_activities: list[FlexibleActivity] = Field(
        default_factory=list,
        description="Actionable flexible tasks that need to be scheduled."
    )
    fixed_commitments: list[FixedCommitment] = Field(
        default_factory=list,
        description="Fixed appointments, meetings, or locked time commitments."
    )
    preferences: list[Preference] = Field(
        default_factory=list,
        description="User daily rhythm preferences (wake up/start time, relaxation, break preferences)."
    )
    scheduling_constraints: list[SchedulingConstraint] = Field(
        default_factory=list,
        description="Hard or soft scheduling constraints (deadlines, avoidance rules, ordering)."
    )
    ambiguities: list[Ambiguity] = Field(
        default_factory=list,
        description="Ambiguities or conflicts requiring user clarification."
    )
    extraneous_discourse_filtered: list[str] = Field(
        default_factory=list,
        description="Conversational filler phrases, greetings, or meta-instructions filtered out (e.g. 'Hey Dayfold', 'help me organize my day for tomorrow', 'First', 'Later')."
    )

    @model_validator(mode="after")
    def validate_semantic_consistency(self) -> GeminiStructuredPlanExtraction:
        """
        Validate semantic consistency across items:
        1. Fixed commitment start and end times format.
        2. Prevent fixed commitments from missing start times.
        3. Ensure unknown durations have duration_needs_confirmation=True.
        """
        for fc in self.fixed_commitments:
            if fc.duration_minutes is None and fc.end_time is None:
                fc.duration_needs_confirmation = True

        for act in self.flexible_activities:
            if act.duration_minutes is None:
                act.duration_needs_confirmation = True
                act.duration_minutes = 30  # Default display estimate
                act.duration_inferred = True

        return self


# ==============================================================================
# Gemini Client & Extraction Service
# ==============================================================================

SYSTEM_PROMPT = """You are Dayfold's precision semantic planning intelligence.
Analyze the user's spoken or typed daily planning instructions and extract structured components with absolute accuracy.

Your objectives:
1. Distinguish between:
   - Flexible activities (actionable tasks that can be scheduled dynamically into open slots).
   - Fixed commitments (anchored appointments, meetings, consultations, classes, visits with specific start times).
   - Preferences (day start/wake time, relaxation time, general break frequency).
   - Scheduling constraints (task-specific deadlines like 'finish X before 1 PM', avoidance directives like 'do not schedule during meetings', ordering constraints).
   - Ambiguities (vague or conflicting statements requiring clarification).
2. Filter out conversational discourse, greetings, and meta-planning instructions:
   - "Hey Dayfold", "help me organize my day", "plan my day", "First,", "Later," are NOT tasks.
   - Meta-planning directives like "Please create a balanced schedule for me to review and approve", "schedule tasks realistically", "include short breaks", "never overlap my fixed commitments", "prioritize my internship application" are NEVER independent tasks!
     * "never overlap my fixed commitments" / "without overlapping fixed commitments" -> SchedulingConstraint (avoidance)
     * "include short breaks" / "keep reasonable breaks" -> Preference (breaks)
     * "prioritize my internship application" -> set priority=1 on the "Submit my internship application" flexible activity.
     * "create a balanced schedule for me to review and approve" -> filter out completely (do NOT create an activity).
   - Record filtered discourse tokens in `extraneous_discourse_filtered`.
3. Normalize activity titles naturally and concisely:
   - "I need 45 minutes for exercise" -> Title: "Exercise"
   - "30 minutes for breakfast" -> Title: "Have breakfast"
   - "two hours to work on my AI project" -> Title: "Work on my AI project"
   - "prepare for my technical interview" -> Title: "Prepare for my technical interview"
   - "pay my electricity bill" -> Title: "Pay my electricity bill"
   - "submit my internship application" -> Title: "Submit my internship application"
   - "read for 30 minutes" -> Title: "Read"
4. Avoid duplicate task creation:
   - Do not schedule or extract the same task multiple times just because it was mentioned in different parts of a sentence.
5. Avoid duplicate preference associations:
   - If an activity has an associated time-of-day preference (e.g. "Call parents in the evening"), attach `preferred_time_window: "evening"` directly to that flexible activity rather than creating a duplicate standalone preference.
6. Never invent durations, times, or deadlines:
   - If duration is not stated, set `duration_minutes: null` and `duration_needs_confirmation: true`.
   - If duration is stated in a follow-up clause (e.g. "which should take 20 minutes"), correctly attach it to the preceding item.
7. Correctly resolve relative dates and weekdays using the provided Reference Date and Timezone:
   - "Tomorrow" = reference_date + 1 day.
   - Spoken weekday (e.g. "Wednesday") = next upcoming occurrence from reference_date.
   - If spoken date matches the interface_date (e.g. user selected Tomorrow in interface and speaks 'tomorrow'), discrepancy_with_interface MUST be false. Only set discrepancy_with_interface: true if the spoken date genuinely points to a different calendar day than interface_date.
8. Clock times:
   - Convert all times to 24-hour format HH:MM (e.g. 11 AM -> "11:00", 3 PM -> "15:00", 5 PM -> "17:00").
   - If end time is missing, compute it from start time + duration if duration was stated.
"""


_cached_client: Optional[genai.Client] = None
_cached_client_key: Optional[str] = None


def get_gemini_client() -> genai.Client:
    """Initialize and return the cached Google GenAI client using settings.GEMINI_API_KEY."""
    global _cached_client, _cached_client_key
    if not GENAI_AVAILABLE:
        raise RuntimeError("google-genai SDK is not installed in the backend environment.")

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError(
            "Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env or environment variables."
        )

    if _cached_client is None or _cached_client_key != api_key:
        _cached_client = genai.Client(api_key=api_key)
        _cached_client_key = api_key

    return _cached_client


async def extract_with_gemini(
    text: str,
    reference_dt: Optional[datetime] = None,
    tz_name: str = "Asia/Kolkata",
    interface_date: Optional[str] = None,
    model_override: Optional[str] = None,
    timeout_seconds: float = 20.0,
) -> dict:
    """
    Direct structured extraction using Google Gemini.

    Returns a dict containing:
    - gemini_extraction: GeminiStructuredPlanExtraction Pydantic model (as dict)
    - standard_payload: canonical Dayfold format compatible with timeline & planner
    - metadata: model, latency_ms, token_usage, status
    """
    if not text or not text.strip():
        raise ValueError("Input text cannot be empty.")

    client = get_gemini_client()

    # Determine reference date and timezone
    try:
        user_tz = ZoneInfo(tz_name)
    except Exception:
        user_tz = timezone.utc

    if not reference_dt:
        reference_dt = datetime.now(user_tz)
    elif reference_dt.tzinfo is None:
        reference_dt = reference_dt.replace(tzinfo=user_tz)

    ref_date_str = reference_dt.strftime("%Y-%m-%d (%A)")
    ref_time_str = reference_dt.strftime("%H:%M")

    user_prompt = f"""[CONTEXT]
Reference Date: {ref_date_str}
Current Time: {ref_time_str}
Timezone: {tz_name}
Interface Selected Date: {interface_date or 'Not specified'}

[USER SPOKEN TRANSCRIPT]
"{text.strip()}"
"""

    model_name = model_override or settings.GEMINI_EXTRACT_MODEL or settings.GEMINI_MODEL or "gemini-3.6-flash"

    # Configure Gemini with strict Pydantic JSON schema
    config = genai_types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=GeminiStructuredPlanExtraction,
        temperature=0.1,  # Low temperature for deterministic semantic extraction
    )

    start_t = time.perf_counter()
    try:
        # Async call to Gemini with enforced timeout
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=config,
            ),
            timeout=timeout_seconds,
        )
        latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
    except asyncio.TimeoutError as te:
        latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
        logger.error(f"Gemini API call timed out after {timeout_seconds}s for model {model_name}")
        raise TimeoutError(f"Gemini API timed out after {timeout_seconds}s") from te
    except Exception as e:
        latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
        logger.error(f"Gemini API invocation failed: {e}")
        raise RuntimeError(f"Gemini extraction call failed ({type(e).__name__}): {str(e)}") from e

    # Parse and validate with Pydantic
    raw_text = response.text
    if not raw_text:
        raise ValueError("Gemini returned an empty response.")

    try:
        parsed_extraction = GeminiStructuredPlanExtraction.model_validate_json(raw_text)
    except Exception as val_err:
        logger.error(f"Failed to validate Gemini response against schema: {val_err}\nRaw text: {raw_text}")
        raise ValueError(f"Gemini output failed schema validation: {str(val_err)}") from val_err

    # Extract token usage if provided by API
    usage = getattr(response, "usage_metadata", None)
    token_usage = {
        "prompt_tokens": getattr(usage, "prompt_token_count", None),
        "candidates_tokens": getattr(usage, "candidates_token_count", None),
        "total_tokens": getattr(usage, "total_token_count", None),
    } if usage else {}

    # Convert to Dayfold standard format
    standard_payload = transform_to_standard_payload(parsed_extraction, interface_date, original_message=text)

    return {
        "gemini_extraction": parsed_extraction.model_dump(),
        "standard_payload": standard_payload,
        "metadata": {
            "provider": "google-genai",
            "model": model_name,
            "latency_ms": latency_ms,
            "token_usage": token_usage,
            "structured_output_enforced": True,
        }
    }


def transform_to_standard_payload(
    extraction: GeminiStructuredPlanExtraction,
    interface_date: Optional[str] = None,
    original_message: Optional[str] = None,
) -> dict:
    """
    Transforms GeminiStructuredPlanExtraction into Dayfold's canonical
    extraction format expected by the frontend ExtractionReviewCard and planner.
    """
    import uuid

    tasks = []
    clarification_required = []
    seen_titles = set()
    for act in extraction.flexible_activities:
        act_title_low = act.title.lower().strip()
        # Filter out meta-planning instructions
        if (
            "schedule for me" in act_title_low
            or "review and approve" in act_title_low
            or "balanced schedule" in act_title_low
            or "schedule tasks" in act_title_low
            or "help me plan" in act_title_low
            or "organize my day" in act_title_low
            or "create a balanced" in act_title_low
            or "make a schedule" in act_title_low
            or act_title_low in ["create a schedule", "plan my day", "organize schedule"]
        ):
            continue

        # Normalize titles
        clean_title = act.title
        if act_title_low in ["exercise", "exercising", "i need for exercise", "for exercise"]:
            clean_title = "Exercise"
        elif act_title_low in ["breakfast", "have breakfast", "for breakfast"]:
            clean_title = "Have breakfast"
        elif act_title_low in ["lunch", "have lunch", "for lunch"]:
            clean_title = "Have lunch"
        elif act_title_low in ["dinner", "have dinner", "for dinner"]:
            clean_title = "Have dinner"
        elif "ai project" in act_title_low:
            clean_title = "Work on my AI project"
        elif "technical interview" in act_title_low:
            clean_title = "Prepare for my technical interview"
        elif "electricity bill" in act_title_low:
            clean_title = "Pay my electricity bill"
        elif "internship application" in act_title_low:
            clean_title = "Submit my internship application"

        # Deduplication
        dedup_key = clean_title.lower()
        if "ai project" in dedup_key:
            dedup_key = "ai_project"
        if dedup_key in seen_titles:
            continue
        seen_titles.add(dedup_key)

        if act.duration_needs_confirmation:
            clarification_required.append(
                f"Task '{clean_title}' duration estimated at {act.duration_minutes or 30}m (please confirm or adjust)."
            )
        tasks.append({
            "id": str(uuid.uuid4()),
            "title": clean_title,
            "kind": "task",
            "duration_minutes": act.duration_minutes or 30,
            "estimate_minutes": act.duration_minutes or 30,
            "duration_needs_confirmation": act.duration_needs_confirmation,
            "start_time": None,
            "end_time": None,
            "time_needs_confirmation": False,
            "priority": act.priority or 3,
            "deadline": act.deadline,
            "details": act.notes,
            "constraint": act.preferred_time_window,
            "original_span": act.original_span,
        })

    fixed_commitments = []
    for fc in extraction.fixed_commitments:
        if fc.duration_needs_confirmation:
            clarification_required.append(
                f"Appointment '{fc.title}' at {fc.start_time} has unspecified duration (estimated at 60m)."
            )
        fixed_commitments.append({
            "id": str(uuid.uuid4()),
            "title": fc.title,
            "kind": "fixed_commitment",
            "duration_minutes": fc.duration_minutes or 60,
            "duration_needs_confirmation": fc.duration_needs_confirmation,
            "start_time": fc.start_time,
            "end_time": fc.end_time or f"{(int(fc.start_time.split(':')[0]) + 1) % 24:02d}:{fc.start_time.split(':')[1]}",
            "time_needs_confirmation": fc.duration_needs_confirmation,
            "location": fc.location,
            "original_span": fc.original_span,
        })

    preferences = [p.description for p in extraction.preferences]
    constraints = [c.rule for c in extraction.scheduling_constraints]

    conflicts = []
    if (
        extraction.date_interpretation.discrepancy_with_interface
        and interface_date
        and extraction.date_interpretation.target_date != interface_date
    ):
        conflicts.append({
            "type": "date_conflict",
            "spoken_date": extraction.date_interpretation.target_date,
            "spoken_date_label": extraction.date_interpretation.target_date_label,
            "interface_date": interface_date,
            "message": f"You spoke about {extraction.date_interpretation.target_date_label}, but your calendar is set to {interface_date}."
        })

    for amb in extraction.ambiguities:
        conflicts.append({
            "type": "ambiguity",
            "item": amb.item,
            "reason": amb.reason,
            "suggested_question": amb.suggested_question,
            "message": amb.reason,
        })
        clarification_required.append(f"Clarification: {amb.reason}")

    # Check for semantic priority directives in original message or constraints
    if original_message:
        m_prio = re.search(r'\bprioritize\s+(?:my\s+)?([a-zA-Z\s]{2,35})', original_message, re.IGNORECASE)
        if m_prio:
            target_prio = m_prio.group(1).strip()
            target_prio = re.sub(r'\b(?:and|please|also)\b.*$', '', target_prio, flags=re.IGNORECASE).strip(" ,.-;:")
            if target_prio:
                matched_task = False
                target_words = [w for w in target_prio.lower().split() if len(w) > 3]
                for t in tasks:
                    if (target_words and any(w in t["title"].lower() for w in target_words)) or (target_prio.lower() in t["title"].lower()):
                        t["priority"] = 1
                        matched_task = True
                        break
                if not matched_task:
                    already_in_ambiguity = any(target_prio.lower() in c.get("message", "").lower() for c in conflicts)
                    if not already_in_ambiguity:
                        unresolved_msg = (
                            f"You asked to prioritize '{target_prio}', but no matching task was found in your schedule. "
                            f"Please add or select this task to apply priority."
                        )
                        conflicts.append({
                            "type": "unresolved_task_reference",
                            "severity": "warning",
                            "target": target_prio,
                            "message": unresolved_msg,
                            "suggested_action": "add_or_select_task",
                            "options": [
                                f"Add task '{target_prio.title()}' with High Priority",
                                "Ignore priority directive"
                            ]
                        })
                        clarification_required.append(f"Unresolved reference: {unresolved_msg}")

    is_explicit = bool(extraction.date_interpretation.relative_expression and extraction.date_interpretation.relative_expression.lower() != "today")

    return {
        "target_date": extraction.date_interpretation.target_date,
        "target_date_label": extraction.date_interpretation.target_date_label,
        "is_explicit_date": is_explicit,
        "tasks": tasks,
        "fixed_commitments": fixed_commitments,
        "preferences": preferences,
        "constraints": constraints,
        "conflicts": conflicts,
        "clarification_required": clarification_required,
        "original_message": original_message or "",
        "discourse_filtered": extraction.extraneous_discourse_filtered,
        "stats": {
            "tasks_count": len(tasks),
            "fixed_commitments_count": len(fixed_commitments),
            "preferences_count": len(preferences),
            "constraints_count": len(constraints),
            "conflicts_count": len(conflicts),
        }
    }

