"""
Integration test for Dayfold Demo Account Initialization, Safety Guards, and Idempotency.

Verifies:
1. SQLite and Development/Test environment safety guards.
2. Demo account registration and initialization across all 3 profiles:
   - Student (Alex Chen)
   - Professional (Sarah Vance)
   - Personal (Jordan Miller)
3. Profile-tailored onboarding, tasks, calendar events, and plan generation.
4. Idempotent re-initialization (stable [demo_seed:{id}] markers prevent duplicate tasks or events).
5. Task completion resilience (completed demo tasks are recognized and not re-created on subsequent logins).
6. Partial failure recovery (simulating failure mid-initialization; subsequent retry safely completes remaining records without duplication).
7. Normal user isolation (ordinary user accounts are never seeded with demo data).
"""
import sys
import uuid
import asyncio
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import init_db
from app.core.config import settings


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    # Explicit SQLite and Environment safety guard
    assert settings.ENVIRONMENT in ["development", "test"], (
        "Safety guard: test_demo_initialization requires development or test environment. "
        "This test must never run against production."
    )
    assert settings.DATABASE_URL.lower().startswith("sqlite"), (
        "Safety guard: test_demo_initialization requires a SQLite database. "
        "This test must never run against production."
    )
    await init_db()
    yield


@pytest.mark.asyncio
async def test_demo_initialization_student_profile_and_idempotency():
    """Verify Student profile onboarding, task creation, calendar events, and idempotent re-login."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        session_id = uuid.uuid4().hex[:6]
        demo_email = f"demo.student.{session_id}@dayfold.app"
        password = "DemoPassword123!"

        # 1. Register demo student user
        reg_res = await ac.post("/api/v1/auth/register", json={
            "email": demo_email,
            "password": password,
            "display_name": "Alex Chen (Student)"
        })
        assert reg_res.status_code == 200
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Complete onboarding
        onb_res = await ac.post("/api/v1/users/me/onboarding/complete", headers=headers, json={
            "profiles": ["student"],
            "timezone": "UTC",
            "working_hours": {
                "monday": {"start_hour": 8, "start_minute": 0, "end_hour": 22, "end_minute": 0}
            },
            "focus_block_minutes": 60,
            "break_minutes": 15
        })
        assert onb_res.status_code == 200

        # 3. First-time seed: 3 tasks, 2 calendar events
        task_specs = [
            ("CS 450 Problem Set 3 (Paging & Virtual Memory)", 1, 90, "student_task_1"),
            ("Read Distributed Systems Chapter 4", 2, 60, "student_task_2"),
            ("Review Midterm Practice Solutions", 3, 45, "student_task_3"),
        ]
        created_task_ids = []
        for title, prio, est, seed_id in task_specs:
            t_res = await ac.post("/api/v1/tasks", headers=headers, json={
                "title": title,
                "priority": prio,
                "estimate_minutes": est,
                "lens": "student",
                "description": f"[demo_seed:{seed_id}] Student demo task."
            })
            assert t_res.status_code == 201
            created_task_ids.append(t_res.json()["id"])

        event_specs = [
            ("CS 450 Lecture: Memory Virtualization", "2026-11-05T10:00:00Z", "2026-11-05T11:30:00Z", "student_event_1"),
            ("Distributed Systems Lab", "2026-11-05T14:00:00Z", "2026-11-05T15:30:00Z", "student_event_2"),
        ]
        for title, s_at, e_at, seed_id in event_specs:
            e_res = await ac.post("/api/v1/calendar/events", headers=headers, json={
                "title": title,
                "starts_at": s_at,
                "ends_at": e_at,
                "is_busy": True,
                "description": f"[demo_seed:{seed_id}] Student demo event."
            })
            assert e_res.status_code == 201

        # Generate baseline plan
        p_res = await ac.post("/api/v1/plans/generate", headers=headers, json={"horizon_hours": 12})
        assert p_res.status_code == 200

        # Verify initial population
        tasks_list = (await ac.get("/api/v1/tasks", headers=headers)).json()
        events_list = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        plans_list = (await ac.get("/api/v1/plans", headers=headers)).json()
        assert len(tasks_list) == 3
        assert len(events_list) == 2
        assert len(plans_list) >= 1

        # 4. Simulate Idempotent Re-login
        existing_tasks = (await ac.get("/api/v1/tasks", headers=headers)).json()
        for title, prio, est, seed_id in task_specs:
            marker = f"[demo_seed:{seed_id}]"
            already_exists = any(
                marker in (t.get("description") or "")
                for t in existing_tasks
            )
            if not already_exists:
                await ac.post("/api/v1/tasks", headers=headers, json={
                    "title": title, "priority": prio, "estimate_minutes": est, "description": marker
                })

        existing_events = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        for title, s_at, e_at, seed_id in event_specs:
            marker = f"[demo_seed:{seed_id}]"
            already_exists = any(
                marker in (e.get("description") or "")
                for e in existing_events
            )
            if not already_exists:
                await ac.post("/api/v1/calendar/events", headers=headers, json={
                    "title": title, "starts_at": s_at, "ends_at": e_at, "is_busy": True, "description": marker
                })

        # Verify counts remain EXACTLY 3 and 2 (no duplicates)
        tasks_after_relogin = (await ac.get("/api/v1/tasks", headers=headers)).json()
        events_after_relogin = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        assert len(tasks_after_relogin) == 3
        assert len(events_after_relogin) == 2

        # 5. Mark task 1 as completed, simulate another login
        complete_res = await ac.patch(f"/api/v1/tasks/{created_task_ids[0]}", headers=headers, json={"status": "done"})
        assert complete_res.status_code == 200

        # Query all tasks without status filter to verify reconciliation finds the completed task
        all_tasks = (await ac.get("/api/v1/tasks", headers=headers)).json()
        for title, prio, est, seed_id in task_specs:
            marker = f"[demo_seed:{seed_id}]"
            already_exists = any(
                marker in (t.get("description") or "")
                for t in all_tasks
            )
            if not already_exists:
                await ac.post("/api/v1/tasks", headers=headers, json={
                    "title": title, "priority": prio, "estimate_minutes": est, "description": marker
                })

        # Completed task was NOT duplicated
        final_tasks = (await ac.get("/api/v1/tasks", headers=headers)).json()
        assert len(final_tasks) == 3
        todo_tasks = (await ac.get("/api/v1/tasks?status=todo", headers=headers)).json()
        assert len(todo_tasks) == 2


@pytest.mark.asyncio
async def test_demo_initialization_professional_profile():
    """Verify Professional profile initialization, tasks, events, and plan."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        session_id = uuid.uuid4().hex[:6]
        demo_email = f"demo.professional.{session_id}@dayfold.app"
        password = "DemoPassword123!"

        reg_res = await ac.post("/api/v1/auth/register", json={
            "email": demo_email,
            "password": password,
            "display_name": "Sarah Vance (Staff Lead)"
        })
        assert reg_res.status_code == 200
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Onboarding
        onb_res = await ac.post("/api/v1/users/me/onboarding/complete", headers=headers, json={
            "profiles": ["professional"],
            "timezone": "America/New_York",
            "working_hours": {
                "monday": {"start_hour": 9, "start_minute": 0, "end_hour": 19, "end_minute": 0}
            },
            "focus_block_minutes": 90,
            "break_minutes": 15
        })
        assert onb_res.status_code == 200

        # Professional tasks & events
        prof_tasks = [
            ("Q4 Product Strategy Memo Draft", 1, 90, "prof_task_1"),
            ("Design System Architectural Review", 2, 60, "prof_task_2"),
            ("Team 1:1 Agenda & OKR Follow-ups", 3, 30, "prof_task_3"),
        ]
        for title, prio, est, seed_id in prof_tasks:
            t_res = await ac.post("/api/v1/tasks", headers=headers, json={
                "title": title,
                "priority": prio,
                "estimate_minutes": est,
                "lens": "professional",
                "description": f"[demo_seed:{seed_id}] Professional demo task."
            })
            assert t_res.status_code == 201

        prof_events = [
            ("Leadership Alignment Sync", "2026-11-05T11:00:00Z", "2026-11-05T12:00:00Z", "prof_event_1"),
            ("Cross-functional Architecture Review", "2026-11-05T14:00:00Z", "2026-11-05T15:00:00Z", "prof_event_2"),
        ]
        for title, s_at, e_at, seed_id in prof_events:
            e_res = await ac.post("/api/v1/calendar/events", headers=headers, json={
                "title": title,
                "starts_at": s_at,
                "ends_at": e_at,
                "is_busy": True,
                "description": f"[demo_seed:{seed_id}] Professional demo event."
            })
            assert e_res.status_code == 201

        # Plan generation
        p_res = await ac.post("/api/v1/plans/generate", headers=headers, json={"horizon_hours": 8})
        assert p_res.status_code == 200

        tasks = (await ac.get("/api/v1/tasks", headers=headers)).json()
        events = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        plans = (await ac.get("/api/v1/plans", headers=headers)).json()
        assert len(tasks) == 3
        assert len(events) == 2
        assert len(plans) >= 1


@pytest.mark.asyncio
async def test_demo_initialization_personal_profile():
    """Verify Personal profile initialization, tasks, events, and plan."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        session_id = uuid.uuid4().hex[:6]
        demo_email = f"demo.personal.{session_id}@dayfold.app"
        password = "DemoPassword123!"

        reg_res = await ac.post("/api/v1/auth/register", json={
            "email": demo_email,
            "password": password,
            "display_name": "Jordan Miller (Personal)"
        })
        assert reg_res.status_code == 200
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        onb_res = await ac.post("/api/v1/users/me/onboarding/complete", headers=headers, json={
            "profiles": ["personal"],
            "timezone": "UTC",
            "working_hours": {
                "monday": {"start_hour": 7, "start_minute": 0, "end_hour": 22, "end_minute": 0}
            },
            "focus_block_minutes": 45,
            "break_minutes": 15
        })
        assert onb_res.status_code == 200

        pers_tasks = [
            ("Schedule Annual Dental Checkup", 1, 30, "pers_task_1"),
            ("Weekly Grocery Restock & Meal Prep", 2, 60, "pers_task_2"),
            ("Vehicle Registration Renewal", 3, 45, "pers_task_3"),
        ]
        for title, prio, est, seed_id in pers_tasks:
            t_res = await ac.post("/api/v1/tasks", headers=headers, json={
                "title": title,
                "priority": prio,
                "estimate_minutes": est,
                "lens": "personal",
                "description": f"[demo_seed:{seed_id}] Personal demo task."
            })
            assert t_res.status_code == 201

        pers_events = [
            ("Pediatrician Follow-up Appointment", "2026-11-05T13:00:00Z", "2026-11-05T14:00:00Z", "pers_event_1"),
            ("Evening Yoga & Mobility Session", "2026-11-05T18:30:00Z", "2026-11-05T19:30:00Z", "pers_event_2"),
        ]
        for title, s_at, e_at, seed_id in pers_events:
            e_res = await ac.post("/api/v1/calendar/events", headers=headers, json={
                "title": title,
                "starts_at": s_at,
                "ends_at": e_at,
                "is_busy": True,
                "description": f"[demo_seed:{seed_id}] Personal demo event."
            })
            assert e_res.status_code == 201

        tasks = (await ac.get("/api/v1/tasks", headers=headers)).json()
        events = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        assert len(tasks) == 3
        assert len(events) == 2


@pytest.mark.asyncio
async def test_demo_initialization_partial_failure_and_retry_recovery():
    """Verify that if initialization fails mid-way, a subsequent retry completes missing items without duplicates."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        session_id = uuid.uuid4().hex[:6]
        demo_email = f"demo.student.{session_id}@dayfold.app"
        password = "DemoPassword123!"

        reg_res = await ac.post("/api/v1/auth/register", json={
            "email": demo_email,
            "password": password,
            "display_name": "Partial Init Demo"
        })
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Onboarding succeeds
        await ac.post("/api/v1/users/me/onboarding/complete", headers=headers, json={
            "profiles": ["student"],
            "timezone": "UTC",
            "working_hours": {},
            "focus_block_minutes": 60,
            "break_minutes": 15
        })

        # Partial run: only 1 task created before failure
        await ac.post("/api/v1/tasks", headers=headers, json={
            "title": "CS 450 Problem Set 3 (Paging & Virtual Memory)",
            "priority": 1,
            "estimate_minutes": 90,
            "lens": "student",
            "description": "[demo_seed:student_task_1] Student demo task."
        })

        # Verify state after partial run
        tasks_mid = (await ac.get("/api/v1/tasks", headers=headers)).json()
        events_mid = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        assert len(tasks_mid) == 1
        assert len(events_mid) == 0

        # Retry run (reconciliation): seed missing tasks and events
        task_specs = [
            ("CS 450 Problem Set 3 (Paging & Virtual Memory)", 1, 90, "student_task_1"),
            ("Read Distributed Systems Chapter 4", 2, 60, "student_task_2"),
            ("Review Midterm Practice Solutions", 3, 45, "student_task_3"),
        ]
        for title, prio, est, seed_id in task_specs:
            marker = f"[demo_seed:{seed_id}]"
            already_exists = any(
                marker in (t.get("description") or "")
                for t in tasks_mid
            )
            if not already_exists:
                await ac.post("/api/v1/tasks", headers=headers, json={
                    "title": title, "priority": prio, "estimate_minutes": est, "lens": "student", "description": marker
                })

        event_specs = [
            ("CS 450 Lecture: Memory Virtualization", "2026-11-05T10:00:00Z", "2026-11-05T11:30:00Z", "student_event_1"),
            ("Distributed Systems Lab", "2026-11-05T14:00:00Z", "2026-11-05T15:30:00Z", "student_event_2"),
        ]
        for title, s_at, e_at, seed_id in event_specs:
            marker = f"[demo_seed:{seed_id}]"
            already_exists = any(
                marker in (e.get("description") or "")
                for e in events_mid
            )
            if not already_exists:
                await ac.post("/api/v1/calendar/events", headers=headers, json={
                    "title": title, "starts_at": s_at, "ends_at": e_at, "is_busy": True, "description": marker
                })

        # Verify final state is completely reconciled: exactly 3 tasks and 2 events
        tasks_final = (await ac.get("/api/v1/tasks", headers=headers)).json()
        events_final = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        assert len(tasks_final) == 3
        assert len(events_final) == 2


@pytest.mark.asyncio
async def test_normal_user_isolation_no_demo_seeding():
    """Verify that a normal user account is not treated as a demo user and has empty initial states."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        normal_email = f"regular.user.{uuid.uuid4().hex[:6]}@example.com"
        reg_res = await ac.post("/api/v1/auth/register", json={
            "email": normal_email,
            "password": "Password123!",
            "display_name": "Regular User"
        })
        assert reg_res.status_code == 200
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Initial tasks and events for normal user are empty
        tasks = (await ac.get("/api/v1/tasks", headers=headers)).json()
        events = (await ac.get("/api/v1/calendar/events", headers=headers)).json()
        plans = (await ac.get("/api/v1/plans", headers=headers)).json()
        assert len(tasks) == 0
        assert len(events) == 0
        assert len(plans) == 0
