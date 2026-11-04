from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import secrets
import uuid
import threading

from jose import JWTError, jwt
import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.models.models import User, Session, AuditLog

# Constant dummy hash for constant-time comparison on nonexistent users
DUMMY_BCRYPT_HASH = "$2b$12$e8YdH1hE0l2e2kYyQ8L.bOH9vjK4h6c0W0M8h.eGZ2Gq7T9V1X5C6"


class TokenRevocationStore:
    """Thread-safe in-memory store for revoked access token JTIs with TTL pruning."""
    def __init__(self):
        self._lock = threading.Lock()
        self._revoked: dict[str, float] = {}

    def revoke(self, jti: str, exp: datetime | float | int | None = None) -> None:
        if not jti:
            return
        if isinstance(exp, datetime):
            exp_ts = exp.timestamp()
        elif isinstance(exp, (int, float)):
            exp_ts = float(exp)
        else:
            exp_ts = datetime.now(timezone.utc).timestamp() + (settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
        with self._lock:
            self._clean()
            self._revoked[jti] = exp_ts

    def is_revoked(self, jti: Optional[str]) -> bool:
        if not jti:
            return False
        now = datetime.now(timezone.utc).timestamp()
        with self._lock:
            if jti in self._revoked:
                if self._revoked[jti] > now:
                    return True
                else:
                    del self._revoked[jti]
            return False

    def _clean(self) -> None:
        now = datetime.now(timezone.utc).timestamp()
        expired = [k for k, v in self._revoked.items() if v <= now]
        for k in expired:
            del self._revoked[k]


revocation_store = TokenRevocationStore()


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token_jti = str(uuid.uuid4())
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "type": "access",
        "jti": token_jti,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, hashed_token)."""
    token = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(token.encode()).hexdigest()
    return token, hashed


async def create_user_session(db: AsyncSession, user_id: str) -> tuple[str, Session]:
    """Create a persistent session record for refresh token tracking."""
    raw_token, hashed_token = create_refresh_token()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session = Session(
        user_id=user_id,
        refresh_token_hash=hashed_token,
        expires_at=expires,
        created_at=now,
    )
    db.add(session)
    await db.flush()
    return raw_token, session


async def get_session_by_token(db: AsyncSession, raw_token: str) -> Optional[Session]:
    """Retrieve session by raw refresh token hash."""
    hashed = hashlib.sha256(raw_token.encode()).hexdigest()
    result = await db.execute(select(Session).where(Session.refresh_token_hash == hashed))
    return result.scalar_one_or_none()


async def revoke_all_user_sessions(db: AsyncSession, user_id: str) -> None:
    """Revoke all active sessions for a user (e.g. on reuse detection or full logout)."""
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Session)
        .where(Session.user_id == user_id, Session.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await db.flush()


def verify_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, email: str, display_name: str, password: Optional[str] = None) -> User:
    user = User(
        email=email,
        display_name=display_name,
        hashed_password=hash_password(password) if password else None,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def write_audit(db: AsyncSession, user_id: Optional[str], actor: str, action: str,
                      entity_type: Optional[str] = None, entity_id: Optional[str] = None,
                      metadata: Optional[dict] = None) -> None:
    log = AuditLog(
        user_id=user_id,
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        extra=metadata or {},
    )
    db.add(log)
