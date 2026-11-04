"""
Tests for schema reconciliation, actor persistence, transaction commit safety, and model compatibility.

Verifies:
1. SQLite and dev/test safety guards.
2. task_events table has 'actor', 'change', and 'conversation_id' columns.
3. Task creation successfully inserts task_events with actor='user' and change payload.
4. Task completion and update successfully record corresponding task_events.
5. Explicit transaction commit ensures tasks and events are persisted atomically.
6. Timing header 'X-Response-Time' is populated on API responses.
7. Alembic migration 0006 upgrade & downgrade runs cleanly on disposable database.
8. ORM query and insert compatibility for reconciled models:
   TaskEvent, Conversation, Project, PendingAction, and ActionExecution.
"""
import sys
import uuid
import tempfile
import os

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import get_db
from app.core.config import settings
from app.models.models import (
    Base,
    User,
    Task,
    TaskEvent,
    Conversation,
    Project,
    PendingAction,
    ActionExecution,
)

# ─── Isolated In-Memory Test Engine ───────────────────────────────────────────
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    assert settings.ENVIRONMENT in ["development", "test"], (
        "Safety guard: test_task_events requires development or test environment."
    )
    assert settings.DATABASE_URL.lower().startswith("sqlite"), (
        "Safety guard: test_task_events requires a SQLite database. Never run against production."
    )
    app.dependency_overrides[get_db] = override_get_db
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_task_events_actor_and_change_persistence():
    """Verify that creating a task persists a TaskEvent with actor='user' and valid change payload."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"taskevent.{uuid.uuid4().hex[:6]}@example.com"
        reg = await ac.post("/api/v1/auth/register", json={
            "email": email,
            "password": "Password123!",
            "display_name": "Task Event Tester"
        })
        assert reg.status_code == 200
        token = reg.json()["access_token"]
        user_id = reg.json()["user"]["id"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create task
        create_res = await ac.post("/api/v1/tasks", headers=headers, json={
            "title": "Complete Architecture Review",
            "priority": 1,
            "estimate_minutes": 45,
            "description": "Verify task_events schema reconciliation"
        })
        assert create_res.status_code == 201
        task_id = create_res.json()["id"]

        # 2. Inspect task_events row in database
        async with TestSessionLocal() as session:
            result = await session.execute(
                select(TaskEvent).where(TaskEvent.task_id == task_id)
            )
            events = result.scalars().all()
            assert len(events) >= 1
            create_event = events[0]
            assert create_event.actor == "user"
            assert create_event.user_id == user_id
            assert create_event.change.get("action") == "created"
            assert create_event.change.get("title") == "Complete Architecture Review"

        # 3. Update task and verify update event
        update_res = await ac.patch(f"/api/v1/tasks/{task_id}", headers=headers, json={
            "priority": 2
        })
        assert update_res.status_code == 200

        # 4. Complete task and verify complete event
        complete_res = await ac.post(f"/api/v1/tasks/{task_id}/complete", headers=headers)
        assert complete_res.status_code == 200

        async with TestSessionLocal() as session:
            result = await session.execute(
                select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.at.asc())
            )
            all_events = result.scalars().all()
            assert len(all_events) == 3
            # Event 1: create
            assert all_events[0].actor == "user"
            assert all_events[0].change["action"] == "created"
            # Event 2: update
            assert all_events[1].actor == "user"
            assert all_events[1].change["action"] == "updated"
            assert "priority" in all_events[1].change["changes"]
            # Event 3: complete
            assert all_events[2].actor == "user"
            assert all_events[2].change["action"] == "completed"


@pytest.mark.asyncio
async def test_reconciled_models_orm_read_write():
    """Verify ORM write and query functionality for all reconciled models and fields."""
    async with TestSessionLocal() as session:
        # Create a test user
        user = User(
            email=f"orm_test_{uuid.uuid4().hex[:6]}@example.com",
            hashed_password="hashed_pwd",
            display_name="ORM Tester",
        )
        session.add(user)
        await session.flush()

        # 1. Conversation model with channel, started_at, created_at
        conv = Conversation(
            user_id=user.id,
            channel="voice",
            summary="Test conversation summary",
        )
        session.add(conv)
        await session.flush()
        assert conv.started_at is not None
        assert conv.channel == "voice"

        # 2. Project model with updated_at
        proj = Project(
            user_id=user.id,
            name="Alpha Project",
            description="Project testing updated_at reconciliation",
        )
        session.add(proj)
        await session.flush()
        assert proj.created_at is not None
        assert proj.updated_at is not None

        # 3. PendingAction and ActionExecution with nullable pending_action_id and idempotency_key
        from datetime import datetime, timezone, timedelta
        action = PendingAction(
            user_id=user.id,
            type="test_action",
            payload={"key": "val"},
            payload_hash="dummy_hash",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        session.add(action)
        await session.flush()

        # Execution associated with pending_action
        execution = ActionExecution(
            pending_action_id=action.id,
            operation="test_operation",
            idempotency_key=f"idem_{uuid.uuid4().hex}",
            status="completed",
            attempts=1,
            request={"param": 1},
            response={"result": "ok"},
        )
        session.add(execution)
        await session.flush()

        # Also verify legacy record compatibility (where pending_action_id is None, idempotency_key is None)
        legacy_exec = ActionExecution(
            pending_action_id=None,
            operation="legacy_operation",
            idempotency_key=None,  # Nullable idempotency_key for legacy rows
            status="succeeded",
        )
        session.add(legacy_exec)
        await session.commit()

        # Query back and verify
        result = await session.execute(
            select(ActionExecution).where(ActionExecution.id.in_([execution.id, legacy_exec.id]))
        )
        saved_execs = result.scalars().all()
        assert len(saved_execs) == 2


@pytest.mark.asyncio
async def test_response_timing_header_presence():
    """Verify that HTTP responses contain the X-Response-Time diagnostic header."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/auth/me")
        assert "X-Response-Time" in res.headers
        timing_val = res.headers["X-Response-Time"]
        assert timing_val.endswith("ms")


def test_alembic_0006_schema_reconciliation_migration():
    """Verify that Alembic migration 0006 upgrades and downgrades cleanly on a disposable database."""
    from alembic.config import Config
    from alembic import command
    import sqlite3

    temp_db = os.path.join(tempfile.gettempdir(), f"disp_test_{uuid.uuid4().hex[:6]}.db")
    db_url = f"sqlite:///{temp_db}"
    old_sync_url = os.environ.get("DATABASE_URL_SYNC")
    os.environ["DATABASE_URL_SYNC"] = db_url

    try:
        cfg = Config("backend/alembic.ini")
        cfg.set_main_option("script_location", "backend/alembic")
        cfg.set_main_option("sqlalchemy.url", db_url)

        # Upgrade to head (includes 0006)
        command.upgrade(cfg, "head")

        conn = sqlite3.connect(temp_db)
        c = conn.cursor()

        # Verify task_events columns
        c.execute("PRAGMA table_info(task_events)")
        te_cols = [r[1] for r in c.fetchall()]
        assert "actor" in te_cols
        assert "change" in te_cols
        assert "conversation_id" in te_cols

        # Verify conversations columns
        c.execute("PRAGMA table_info(conversations)")
        conv_info = c.fetchall()
        conv_cols = [r[1] for r in conv_info]
        assert "channel" in conv_cols
        assert "started_at" in conv_cols
        assert "ended_at" in conv_cols
        assert "summary" in conv_cols
        assert "created_at" in conv_cols

        # Verify created_at in conversations is NOT NULL (notnull flag == 1)
        created_at_row = next(r for r in conv_info if r[1] == "created_at")
        assert created_at_row[3] == 1, "conversations.created_at constraint must remain NOT NULL!"

        # Verify projects columns
        c.execute("PRAGMA table_info(projects)")
        p_cols = [r[1] for r in c.fetchall()]
        assert "updated_at" in p_cols

        # Verify action_executions columns
        c.execute("PRAGMA table_info(action_executions)")
        ae_cols = [r[1] for r in c.fetchall()]
        assert "pending_action_id" in ae_cols
        assert "step_index" in ae_cols
        assert "operation" in ae_cols
        assert "idempotency_key" in ae_cols
        assert "attempts" in ae_cols
        assert "request" in ae_cols
        assert "response" in ae_cols
        assert "error_code" in ae_cols
        # Legacy columns preserved
        assert "action_id" in ae_cols
        assert "user_id" in ae_cols
        assert "error_message" in ae_cols
        assert "rollback_payload" in ae_cols

        # ── Test Non-destructive Safety Abort on Unsafe Downgrade ─────────────
        # Insert a post-migration record with NULL action_id and user_id
        unsafe_id = str(uuid.uuid4())
        c.execute(
            "INSERT INTO action_executions (id, step_index, operation, status, started_at) "
            "VALUES (?, 0, 'test_op', 'very_long_status_name_exceeding_20', CURRENT_TIMESTAMP)",
            (unsafe_id,)
        )
        conn.commit()
        conn.close()

        # Attempt downgrade: must be aborted with RuntimeError, refusing to delete or truncate records
        with pytest.raises(RuntimeError) as exc_info:
            command.downgrade(cfg, "0005_pending_action_conv")
        assert "Cannot safely downgrade migration 0006" in str(exc_info.value)
        assert "To prevent data loss" in str(exc_info.value)

        # Verify record was preserved intact (not deleted, not silently modified)
        conn_check = sqlite3.connect(temp_db)
        c_check = conn_check.cursor()
        c_check.execute("SELECT status, action_id FROM action_executions WHERE id = ?", (unsafe_id,))
        preserved = c_check.fetchone()
        assert preserved is not None, "Record must not be deleted during aborted downgrade"
        assert preserved[0] == "very_long_status_name_exceeding_20", "Status must not be mutated"
        assert preserved[1] is None

        # Clean the test record so clean rollback can be verified
        c_check.execute("DELETE FROM action_executions WHERE id = ?", (unsafe_id,))
        conn_check.commit()
        conn_check.close()

        # Clean downgrade to 0005
        command.downgrade(cfg, "0005_pending_action_conv")

        conn2 = sqlite3.connect(temp_db)
        c2 = conn2.cursor()
        c2.execute("PRAGMA table_info(task_events)")
        downgraded_te_cols = [r[1] for r in c2.fetchall()]
        assert "actor" not in downgraded_te_cols
        assert "change" not in downgraded_te_cols
        assert "conversation_id" not in downgraded_te_cols

        c2.execute("PRAGMA table_info(conversations)")
        downgraded_conv_cols = [r[1] for r in c2.fetchall()]
        assert "channel" not in downgraded_conv_cols
        assert "started_at" not in downgraded_conv_cols

        c2.execute("PRAGMA table_info(projects)")
        downgraded_proj_cols = [r[1] for r in c2.fetchall()]
        assert "updated_at" not in downgraded_proj_cols

        c2.execute("PRAGMA table_info(action_executions)")
        downgraded_ae_cols = [r[1] for r in c2.fetchall()]
        assert "pending_action_id" not in downgraded_ae_cols
        assert "operation" not in downgraded_ae_cols

        conn2.close()

    finally:
        if old_sync_url is not None:
            os.environ["DATABASE_URL_SYNC"] = old_sync_url
        else:
            os.environ.pop("DATABASE_URL_SYNC", None)
        if os.path.exists(temp_db):
            try:
                os.remove(temp_db)
            except Exception:
                pass
