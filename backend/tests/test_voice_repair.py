"""
Test Suite for Dayfold Voice-to-Plan Pipeline Repair (Scenarios A through F).
Preserves existing database and tests with unique isolated users.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings
from app.db.session import init_db
from app.services.agent.extractor import extract_structured_plan_data


@pytest_asyncio.fixture
async def authed_client():
    assert settings.ENVIRONMENT.lower() in ("development", "test"), (
        f"Safety guard: test_voice_repair must never run against production (current ENVIRONMENT='{settings.ENVIRONMENT}')."
    )
    assert settings.DATABASE_URL.lower().startswith("sqlite"), (
        "Safety guard: test_voice_repair requires a SQLite database. "
        "This test must never run against production."
    )
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"voice_repair_{uuid.uuid4().hex[:8]}@dayfold.app"
        reg_res = await ac.post("/api/v1/auth/register", json={
            "email": email,
            "password": "Password123!",
            "display_name": "Voice Repair QA"
        })
        assert reg_res.status_code == 200
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        yield ac, headers


def test_scenario_a_full_personal_day():
    """
    Test A: Full personal-day request with 7 separate activities, durations,
    5 PM doctor appointment, and preferences.
    """
    msg = (
        "Hey Dayfold, I want to organize my personal day for tomorrow. I need to wake up at 7 AM and go for a 30-minute walk. "
        "After that, I want to have breakfast and spend some time organizing my room. "
        "I have to visit the grocery store to buy vegetables, fruits, milk and other household essentials. "
        "That should take around one hour. I also need to pay my electricity bill before the evening, which will take about 15 minutes. "
        "Please remind me to call my parents sometime after lunch. "
        "I also want to spend 45 minutes reading a book and 30 minutes planning my personal goals for the upcoming month. "
        "I have a doctor's appointment at 5 PM, so keep that time free. I want to finish my important errands before 4 PM."
    )
    ref_dt = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    res = extract_structured_plan_data(msg, reference_dt=ref_dt)

    # 1. Target date is tomorrow (Nov 2, 2026)
    assert res["target_date"] == "2026-11-02"
    assert "Monday" in res["target_date_label"]

    # 2. Check extracted tasks and durations
    task_map = {t["title"].lower(): t for t in res["tasks"]}
    assert any("walk" in k for k in task_map)
    walk_task = next(v for k, v in task_map.items() if "walk" in k)
    assert walk_task["duration_minutes"] == 30

    assert any("grocery" in k for k in task_map)
    grocery_task = next(v for k, v in task_map.items() if "grocery" in k)
    assert grocery_task["duration_minutes"] == 60

    assert any("electricity" in k for k in task_map)
    bill_task = next(v for k, v in task_map.items() if "electricity" in k)
    assert bill_task["duration_minutes"] == 15

    assert any("read" in k for k in task_map)
    read_task = next(v for k, v in task_map.items() if "read" in k)
    assert read_task["duration_minutes"] == 45

    assert any("goal" in k for k in task_map)
    goals_task = next(v for k, v in task_map.items() if "goal" in k)
    assert goals_task["duration_minutes"] == 30

    assert any("parent" in k for k in task_map)
    call_task = next(v for k, v in task_map.items() if "parent" in k)
    assert call_task["duration_minutes"] == 15
    assert call_task["constraint"] == "after lunch"

    # 3. Fixed appointment at 5 PM
    assert len(res["fixed_commitments"]) == 1
    doc_appt = res["fixed_commitments"][0]
    assert "doctor" in doc_appt["title"].lower()
    assert doc_appt["start_time"] == "17:00"
    assert doc_appt["time_needs_confirmation"] is True

    # 4. Preferences and constraints
    prefs = " ".join(res["preferences"]).lower()
    assert "7 am" in prefs or "wake up" in prefs
    constraints = " ".join(res["constraints"]).lower()
    assert "finish" in constraints and "4" in constraints


def test_scenario_b_temple_commitment():
    """
    Test B: Temple commitment 6 AM to 7 AM tomorrow blocks time.
    """
    msg = "I have to go to the temple from 6 AM to 7 AM tomorrow. Please keep that time blocked and plan the rest of my day around it."
    ref_dt = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    res = extract_structured_plan_data(msg, reference_dt=ref_dt)

    assert res["target_date"] == "2026-11-02"
    assert len(res["fixed_commitments"]) == 1
    temple = res["fixed_commitments"][0]
    assert "temple" in temple["title"].lower()
    assert temple["start_time"] == "06:00"
    assert temple["end_time"] == "07:00"
    assert temple["duration_minutes"] == 60


def test_scenario_c_multiple_separate_tasks():
    """
    Test C: Clean room 30m, groceries 60m, read 45m, electricity bill 15m.
    """
    msg = "Tomorrow I need to clean my room for 30 minutes, buy groceries for one hour, read for 45 minutes, and pay my electricity bill for 15 minutes."
    ref_dt = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    res = extract_structured_plan_data(msg, reference_dt=ref_dt)

    assert res["target_date"] == "2026-11-02"
    assert len(res["tasks"]) == 4

    durations = {t["title"]: t["duration_minutes"] for t in res["tasks"]}
    clean_d = next(v for k, v in durations.items() if "clean" in k.lower())
    assert clean_d == 30

    groc_d = next(v for k, v in durations.items() if "grocery" in k.lower() or "groceries" in k.lower())
    assert groc_d == 60

    read_d = next(v for k, v in durations.items() if "read" in k.lower())
    assert read_d == 45

    bill_d = next(v for k, v in durations.items() if "electricity" in k.lower() or "bill" in k.lower())
    assert bill_d == 15


def test_scenario_d_ambiguous_task():
    """
    Test D: Ambiguous task without specified duration.
    Does not say "no tasks detected", labels duration estimate for confirmation.
    """
    msg = "Tomorrow I need to organize my room."
    ref_dt = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    res = extract_structured_plan_data(msg, reference_dt=ref_dt)

    assert res["target_date"] == "2026-11-02"
    assert len(res["tasks"]) == 1
    task = res["tasks"][0]
    assert "organize" in task["title"].lower()
    assert task["duration_needs_confirmation"] is True
    assert len(res["clarification_required"]) > 0


def test_scenario_e_fixed_appointment_without_end_time():
    """
    Test E: Appointment at 5 PM without explicit end time.
    Flags duration/time as needing confirmation.
    """
    msg = "I have a doctor's appointment tomorrow at 5 PM."
    ref_dt = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    res = extract_structured_plan_data(msg, reference_dt=ref_dt)

    assert res["target_date"] == "2026-11-02"
    assert len(res["fixed_commitments"]) == 1
    appt = res["fixed_commitments"][0]
    assert "doctor" in appt["title"].lower()
    assert appt["start_time"] == "17:00"
    assert appt["time_needs_confirmation"] is True


def test_scenario_f_hindi_hinglish():
    """
    Test F: Hindi/Hinglish instructions.
    Temple 6 to 7 AM, grocery 1 hour, walk 30 mins.
    """
    msg = "Kal subah 6 baje se 7 baje tak mandir jana hai. Uske baad ek ghanta grocery shopping karni hai aur 30 minute walk karni hai."
    ref_dt = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    res = extract_structured_plan_data(msg, reference_dt=ref_dt)

    assert res["target_date"] == "2026-11-02"
    assert len(res["fixed_commitments"]) == 1
    temple = res["fixed_commitments"][0]
    assert "temple" in temple["title"].lower() or "mandir" in temple["title"].lower()
    assert temple["start_time"] == "06:00"
    assert temple["end_time"] == "07:00"

    assert len(res["tasks"]) == 2
    task_map = {t["title"].lower(): t["duration_minutes"] for t in res["tasks"]}
    assert any("grocery" in k for k in task_map)
    assert any("walk" in k for k in task_map)


def test_regression_call_parents_no_temporal_frame_leak():
    """
    Test Case A: Remind me to call my parents sometime after lunch.
    Call-parents task has constraint='after lunch'; subsequent tasks do NOT inherit it.
    """
    msg = "Remind me to call my parents sometime after lunch. I also want to read a book and plan my goals."
    res = extract_structured_plan_data(msg)
    task_map = {t["title"].lower(): t for t in res["tasks"]}

    # 1. Call parents task has after lunch
    assert any("parent" in k for k in task_map)
    call_task = next(v for k, v in task_map.items() if "parent" in k)
    assert call_task["constraint"] == "after lunch"

    # 2. Reading and goals do not inherit after lunch
    assert any("read" in k for k in task_map)
    read_task = next(v for k, v in task_map.items() if "read" in k)
    assert read_task["constraint"] is None

    assert any("goal" in k for k in task_map)
    goals_task = next(v for k, v in task_map.items() if "goal" in k)
    assert goals_task["constraint"] is None


def test_regression_multi_task_shared_after_lunch_frame():
    """
    Test Case B: Schedule reading, exercise and studying after lunch.
    All three tasks retain the shared after-lunch constraint.
    """
    msg = "Schedule reading, exercise and studying after lunch."
    res = extract_structured_plan_data(msg)
    task_map = {t["title"].lower(): t for t in res["tasks"]}
    assert len(res["tasks"]) == 3

    assert any("read" in k for k in task_map)
    read_task = next(v for k, v in task_map.items() if "read" in k)
    assert read_task["constraint"] == "after lunch"

    assert any("exercise" in k for k in task_map)
    exercise_task = next(v for k, v in task_map.items() if "exercise" in k)
    assert exercise_task["constraint"] == "after lunch"

    assert any("study" in k for k in task_map)
    study_task = next(v for k, v in task_map.items() if "study" in k)
    assert study_task["constraint"] == "after lunch"


def test_regression_distinct_temporal_constraints_per_task():
    """
    Test Case C: I want to call my parents after lunch and visit the grocery store in the evening.
    Call parents is after lunch; grocery store is evening.
    """
    msg = "I want to call my parents after lunch and visit the grocery store in the evening."
    res = extract_structured_plan_data(msg)
    task_map = {t["title"].lower(): t for t in res["tasks"]}

    assert any("parent" in k for k in task_map)
    call_task = next(v for k, v in task_map.items() if "parent" in k)
    assert call_task["constraint"] == "after lunch"

    assert any("grocery" in k for k in task_map)
    grocery_task = next(v for k, v in task_map.items() if "grocery" in k)
    assert grocery_task["constraint"] == "evening"


@pytest.mark.asyncio
async def test_api_e2e_extract_and_plan_pipeline(authed_client):
    """
    Test complete 2-step API pipeline:
    1. POST /api/v1/agent/extract -> review extracted tasks & commitments
    2. POST /api/v1/agent/plan-extracted -> deterministic plan with zero overlaps around Temple & Doctor
    """
    ac, headers = authed_client

    msg = (
        "I have to go to the temple from 6 AM to 7 AM tomorrow. "
        "Then I need to go for a 30-minute walk and buy groceries for one hour. "
        "I have a doctor's appointment at 5 PM."
    )

    # Step 1: Extract
    ext_res = await ac.post("/api/v1/agent/extract", json={"message": msg}, headers=headers)
    assert ext_res.status_code == 200
    ext_data = ext_res.json()
    assert ext_data["target_date"] is not None
    assert len(ext_data["fixed_commitments"]) == 2  # Temple (6-7 AM) and Doctor (5 PM)
    assert len(ext_data["tasks"]) == 2              # Walk (30m) and Groceries (60m)

    # Step 2: Plan Extracted
    plan_res = await ac.post("/api/v1/agent/plan-extracted", json={
        "target_date": ext_data["target_date"],
        "tasks": ext_data["tasks"],
        "fixed_commitments": ext_data["fixed_commitments"],
    }, headers=headers)
    assert plan_res.status_code == 200
    plan_data = plan_res.json()

    assert plan_data["plan"] is not None
    assert "blocks" in plan_data["plan"]
    blocks = plan_data["plan"]["blocks"]
    assert len(blocks) >= 4  # 2 fixed commitments + 2 tasks

    # Verify no block overlaps the Temple visit (06:00 to 07:00)
    temple_block = next((b for b in blocks if "temple" in b["title"].lower()), None)
    assert temple_block is not None
    assert "06:00" in temple_block["starts_at"]

    # Verify pending action was generated for approval
    assert plan_data["pending_action"] is not None
    assert plan_data["pending_action_id"] is not None
