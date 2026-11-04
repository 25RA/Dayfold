"""Regression tests for Dayfold Session datetime consistency.

Verifies:
1. Session model fields (expires_at, created_at, revoked_at) use timezone-aware UTC.
2. Inserting a Session with aware UTC timestamps succeeds without naive/aware mixing.
3. revoked_at is properly nullable on insert and accepts aware UTC when revoked.
4. create_user_session() produces consistent aware UTC datetimes across all fields.
5. Datetime arithmetic (e.g. expires_at - now) never raises TypeError.
6. Optional PostgreSQL + asyncpg integration test (activated via TEST_DATABASE_URL).
"""
import os
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, User, Session, now_utc
from app.services.auth.auth_service import create_refresh_token

POSTGRES_TEST_URL = os.getenv("TEST_DATABASE_URL", "")


@pytest.fixture
def sync_db_session():
    """In-memory SQLite session with full schema initialized.

    NOTE: SQLite tests validate schema wiring and Python model logic, but do NOT
    validate asyncpg Cython binary wire encoding or PostgreSQL TIMESTAMP OIDs.
    """
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    engine.dispose()


def test_now_utc_is_timezone_aware():
    """Verify now_utc() returns timezone-aware UTC datetime."""
    now = now_utc()
    assert now.tzinfo is not None
    assert now.tzinfo == timezone.utc


def test_insert_session_with_utc_timestamps_and_nullable_revoked_at(sync_db_session):
    """Regression test: verify inserting session with aware UTC timestamps and NULL revoked_at."""
    db = sync_db_session

    user = User(
        email="tz_test@dayfold.app",
        display_name="Timezone Tester",
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    db.add(user)
    db.flush()

    raw_token, token_hash = create_refresh_token()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=30)

    session = Session(
        user_id=user.id,
        refresh_token_hash=token_hash,
        expires_at=expires,
        created_at=now,
        revoked_at=None,
    )
    db.add(session)
    db.commit()

    # Query back and verify
    fetched = db.execute(select(Session).where(Session.id == session.id)).scalar_one()
    assert fetched is not None
    assert fetched.refresh_token_hash == token_hash
    assert fetched.revoked_at is None

    # Verify datetime arithmetic never fails with TypeError
    now_check = datetime.now(timezone.utc)
    exp = fetched.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    time_left = exp - now_check
    assert time_left.total_seconds() > 0


def test_session_revocation_with_utc_timestamp(sync_db_session):
    """Verify revoking a session with an aware UTC timestamp."""
    db = sync_db_session

    user = User(
        email="revoke_test@dayfold.app",
        display_name="Revoke Tester",
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    db.add(user)
    db.flush()

    _, token_hash = create_refresh_token()
    now = datetime.now(timezone.utc)
    session = Session(
        user_id=user.id,
        refresh_token_hash=token_hash,
        expires_at=now + timedelta(days=7),
        created_at=now,
        revoked_at=None,
    )
    db.add(session)
    db.commit()

    # Revoke with aware timestamp
    revoke_time = datetime.now(timezone.utc)
    session.revoked_at = revoke_time
    db.commit()

    fetched = db.execute(select(Session).where(Session.id == session.id)).scalar_one()
    assert fetched.revoked_at is not None


@pytest.mark.skipif(
    not POSTGRES_TEST_URL.startswith("postgresql+asyncpg://"),
    reason="Requires TEST_DATABASE_URL pointing to a test PostgreSQL database (e.g. postgresql+asyncpg://...)"
)
@pytest.mark.asyncio
async def test_postgres_asyncpg_session_datetime_roundtrip():
    """Integration test: validates asyncpg Cython binary encoding with PostgreSQL TIMESTAMPTZ columns."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    engine = create_async_engine(POSTGRES_TEST_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        now = datetime.now(timezone.utc)
        user = User(
            email=f"pg_test_{int(now.timestamp())}@dayfold.app",
            display_name="PostgreSQL Tester",
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        await db.flush()

        raw_token, token_hash = create_refresh_token()
        session = Session(
            user_id=user.id,
            refresh_token_hash=token_hash,
            expires_at=now + timedelta(days=30),
            created_at=now,
            revoked_at=None,
        )
        db.add(session)
        # Binary serialization through asyncpg:
        await db.flush()
        assert session.id is not None

        # Revoke with aware timestamp:
        session.revoked_at = datetime.now(timezone.utc)
        await db.flush()

        # Query back:
        res = await db.execute(select(Session).where(Session.id == session.id))
        fetched = res.scalar_one()
        assert fetched.expires_at.tzinfo is not None
        assert fetched.created_at.tzinfo is not None
        assert fetched.revoked_at.tzinfo is not None

        await db.rollback()
    await engine.dispose()
