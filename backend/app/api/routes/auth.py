from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User, UserPreferences, Session, AuditLog
from app.services.auth.auth_service import (
    get_user_by_email, get_user_by_id, create_user, verify_password,
    create_access_token, create_refresh_token, create_user_session,
    get_session_by_token, revoke_all_user_sessions, verify_access_token,
    hash_password, write_audit, DUMMY_BCRYPT_HASH
)
from app.core.config import settings
from app.core.deps import get_current_user, security
from app.core.rate_limit import rate_limit_by_ip
from app.core.distributed_store import distributed_store
import hashlib
import logging
import secrets

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: dict


def _get_cookie_security_settings() -> tuple[bool, str]:
    """Derive Secure and SameSite cookie attributes from the explicit production environment."""
    is_production = settings.ENVIRONMENT.lower() == "production"
    is_secure = is_production
    samesite = "none" if is_production else "lax"
    return is_secure, samesite


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Helper to attach secure SameSite cookies and CSRF token."""
    is_secure, samesite = _get_cookie_security_settings()
    response.set_cookie(
        key="dayfold_access_token",
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite=samesite,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key="dayfold_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite=samesite,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )
    csrf_token = secrets.token_hex(16)
    response.set_cookie(
        key="dayfold_csrf_token",
        value=csrf_token,
        httponly=False,
        secure=is_secure,
        samesite=samesite,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Helper to clear auth cookies consistently with the environment cookie policy."""
    is_secure, samesite = _get_cookie_security_settings()
    response.delete_cookie("dayfold_access_token", secure=is_secure, samesite=samesite)
    response.delete_cookie("dayfold_refresh_token", path="/api/v1/auth", secure=is_secure, samesite=samesite)
    response.delete_cookie("dayfold_csrf_token", secure=is_secure, samesite=samesite)


@router.post("/register", response_model=AuthResponse, dependencies=[Depends(rate_limit_by_ip(max_requests=10, window_seconds=60, scope="register"))])
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    if len(body.password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password must be at least 8 characters")

    user = await create_user(db, body.email, body.display_name, body.password)

    # Seed default preferences
    prefs = UserPreferences(user_id=user.id)
    db.add(prefs)
    await db.flush()

    await write_audit(db, user.id, "user", "register", "user", user.id)

    access_token = create_access_token(user.id, user.email)
    raw_refresh, _ = await create_user_session(db, user.id)

    _set_auth_cookies(response, access_token, raw_refresh)

    return AuthResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user={"id": user.id, "email": user.email, "display_name": user.display_name, "is_onboarded": user.is_onboarded}
    )


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(rate_limit_by_ip(max_requests=10, window_seconds=60, scope="login"))])
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, body.email)
    if not user or not user.hashed_password:
        # Constant-time mitigation against user enumeration
        verify_password(body.password, DUMMY_BCRYPT_HASH)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    await write_audit(db, user.id, "user", "login", "user", user.id)

    access_token = create_access_token(user.id, user.email)
    raw_refresh, _ = await create_user_session(db, user.id)

    _set_auth_cookies(response, access_token, raw_refresh)

    return AuthResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user={"id": user.id, "email": user.email, "display_name": user.display_name, "is_onboarded": user.is_onboarded}
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh_access_token(
    request: Request,
    response: Response,
    body: Optional[RefreshRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    raw_token = (body.refresh_token if body and body.refresh_token else "") or request.cookies.get("dayfold_refresh_token", "")
    raw_token = raw_token.strip()
    if not raw_token:
        logger.warning(
            "Auth refresh rejected: missing_refresh_token (has_body=%s, has_cookie=%s)",
            bool(body and body.refresh_token),
            "dayfold_refresh_token" in request.cookies,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")

    session = await get_session_by_token(db, raw_token)
    if not session:
        logger.warning("Auth refresh rejected: session_not_found")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    now = datetime.now(timezone.utc)

    # Reuse detection: if a revoked refresh token is re-submitted
    if session.revoked_at is not None:
        logger.warning("Auth refresh rejected: revoked_token_reuse (user_id=%s)", session.user_id)
        await revoke_all_user_sessions(db, session.user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Revoked refresh token reuse detected. All active sessions have been terminated."
        )

    exp = session.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now:
        session.revoked_at = now
        logger.warning("Auth refresh rejected: session_expired (user_id=%s)", session.user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expired refresh token")

    user = await get_user_by_id(db, session.user_id)
    if not user or user.status != "active":
        logger.warning("Auth refresh rejected: user_inactive_or_not_found (user_id=%s)", session.user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive or not found")

    # Rotate refresh token: revoke current session, issue a fresh session
    session.revoked_at = now
    new_raw_refresh, _ = await create_user_session(db, user.id)
    new_access_token = create_access_token(user.id, user.email)

    logger.info("Auth refresh successful (user_id=%s)", user.id)

    await write_audit(db, user.id, "user", "token.refresh", "user", user.id)

    _set_auth_cookies(response, new_access_token, new_raw_refresh)

    return AuthResponse(
        access_token=new_access_token,
        refresh_token=new_raw_refresh,
        user={"id": user.id, "email": user.email, "display_name": user.display_name, "is_onboarded": user.is_onboarded}
    )


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "timezone": current_user.timezone,
        "is_onboarded": current_user.is_onboarded,
        "created_at": str(current_user.created_at),
    }


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    body: Optional[LogoutRequest] = None,
    current_user: User = Depends(get_current_user),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    # Revoke access token JTI immediately across all workers
    raw_token = None
    if credentials and credentials.credentials:
        raw_token = credentials.credentials
    elif "dayfold_access_token" in request.cookies:
        raw_token = request.cookies.get("dayfold_access_token")

    if raw_token:
        payload = verify_access_token(raw_token)
        if payload and payload.get("jti"):
            exp_ts = payload.get("exp") or (datetime.now(timezone.utc).timestamp() + (settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60))
            await distributed_store.revoke_token(payload["jti"], exp_ts)

    # Revoke refresh token session
    raw_refresh = (body.refresh_token if body and body.refresh_token else "") or request.cookies.get("dayfold_refresh_token", "")
    if raw_refresh:
        session = await get_session_by_token(db, raw_refresh)
        if session and session.user_id == current_user.id:
            session.revoked_at = datetime.now(timezone.utc)
    else:
        await revoke_all_user_sessions(db, current_user.id)

    # Clear auth cookies
    _clear_auth_cookies(response)

    await write_audit(db, current_user.id, "user", "logout", "user", current_user.id)
    return {"message": "Logged out"}

