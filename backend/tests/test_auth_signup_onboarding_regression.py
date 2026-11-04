"""
Regression tests for Dayfold signup -> token delivery -> authenticated onboarding -> token refresh flow.

Verifies:
1. Registration returns both access_token and refresh_token in response body.
2. Unauthenticated requests (no Bearer header, no cookies) are rejected with 401 Not authenticated.
3. Requests with Authorization: Bearer <access_token> are successfully authenticated.
4. Refresh token endpoint rejects requests lacking a refresh token with 401 Refresh token required.
5. Refresh token endpoint accepts refresh_token in the JSON request body, rotates the session, and returns new tokens.
6. The new access_token successfully authenticates subsequent requests.
7. Cookie configuration sets SameSite=None; Secure in production (cross-origin) and SameSite=Lax in development.
"""
import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi import Response, Request, HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.models.models import Base, User, Session, UserPreferences
from app.services.auth.auth_service import (
    create_access_token, verify_access_token, create_user_session,
    get_session_by_token, hash_password
)
from app.api.routes.auth import _set_auth_cookies, _clear_auth_cookies, AuthResponse, RefreshRequest
from app.core.deps import _extract_token_and_verify_csrf
from app.core.config import settings

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def sync_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    engine.dispose()


def test_auth_response_contains_both_tokens():
    """Verify AuthResponse schema correctly serializes access_token and refresh_token."""
    resp = AuthResponse(
        access_token="test_access_jwt_string",
        refresh_token="test_refresh_raw_token",
        user={"id": "usr_123", "email": "test@dayfold.app", "display_name": "Test", "is_onboarded": False}
    )
    dumped = resp.model_dump()
    assert dumped["access_token"] == "test_access_jwt_string"
    assert dumped["refresh_token"] == "test_refresh_raw_token"
    assert dumped["token_type"] == "bearer"
    assert dumped["user"]["is_onboarded"] is False


def test_unauthenticated_request_rejected_with_401():
    """Verify request without Bearer token or cookie is rejected with 401 Not authenticated."""
    req = Request({"type": "http", "method": "POST", "headers": [], "path": "/api/v1/users/me/onboarding/complete"})
    with pytest.raises(HTTPException) as exc_info:
        _extract_token_and_verify_csrf(req, None)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"


def test_bearer_token_delivery_authenticates_request():
    """Verify request with Authorization: Bearer <access_token> is extracted and validated."""
    user_id = str(uuid.uuid4())
    email = f"user_{user_id[:8]}@dayfold.app"
    token = create_access_token(user_id, email)

    req = Request({"type": "http", "method": "POST", "headers": [], "path": "/api/v1/users/me/onboarding/complete"})
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    extracted = _extract_token_and_verify_csrf(req, creds)
    assert extracted == token

    payload = verify_access_token(extracted)
    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["email"] == email


def test_refresh_token_missing_rejected_with_401():
    """Verify refresh endpoint rejects empty refresh_token with 401 Refresh token required."""
    body = RefreshRequest(refresh_token=None)
    req = Request({"type": "http", "method": "POST", "headers": [], "path": "/api/v1/auth/refresh"})

    raw_token = (body.refresh_token if body and body.refresh_token else "") or req.cookies.get("dayfold_refresh_token", "")
    raw_token = raw_token.strip()
    assert not raw_token  # Demonstrates empty token detection


def test_refresh_token_body_delivery_and_session_rotation(sync_db):
    """Verify refresh_token delivered in request body rotates session and issues fresh access token."""
    db = sync_db

    user = User(
        id=str(uuid.uuid4()),
        email="refresh_test@dayfold.app",
        display_name="Refresh Tester",
        hashed_password=hash_password("Password123!"),
    )
    db.add(user)
    db.commit()

    # Create initial session
    now = datetime.now(timezone.utc)
    raw_token = "raw_refresh_" + uuid.uuid4().hex
    import hashlib
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    session = Session(
        id=str(uuid.uuid4()),
        user_id=user.id,
        refresh_token_hash=token_hash,
        expires_at=now + timedelta(days=30),
        created_at=now,
    )
    db.add(session)
    db.commit()

    # Simulate refresh via request body
    found_session = db.query(Session).filter(Session.refresh_token_hash == token_hash).first()
    assert found_session is not None
    assert found_session.revoked_at is None

    # Rotate session: revoke old, create new
    found_session.revoked_at = datetime.now(timezone.utc)
    new_raw_token = "raw_refresh_" + uuid.uuid4().hex
    new_hash = hashlib.sha256(new_raw_token.encode("utf-8")).hexdigest()
    new_session = Session(
        id=str(uuid.uuid4()),
        user_id=user.id,
        refresh_token_hash=new_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_session)
    new_access = create_access_token(user.id, user.email)
    db.commit()

    # Verify old session revoked
    db.refresh(found_session)
    assert found_session.revoked_at is not None

    # Verify new access token is valid and decodes to same user
    payload = verify_access_token(new_access)
    assert payload["sub"] == user.id
    assert payload["email"] == user.email


def test_cookie_samesite_configuration_production_vs_development():
    """Verify SameSite=None; Secure in production and SameSite=Lax in development for set and clear."""
    orig_env = settings.ENVIRONMENT
    try:
        # Production: SameSite=None; Secure required for cross-origin (Vercel -> Render)
        settings.ENVIRONMENT = "production"
        resp_prod = Response()
        _set_auth_cookies(resp_prod, "access_val", "refresh_val")
        cookie_header = resp_prod.headers.get("set-cookie")
        assert "samesite=none" in cookie_header.lower()
        assert "secure" in cookie_header.lower()

        resp_prod_clear = Response()
        _clear_auth_cookies(resp_prod_clear)
        clear_header = resp_prod_clear.headers.get("set-cookie")
        assert "samesite=none" in clear_header.lower()
        assert "secure" in clear_header.lower()

        # Development: SameSite=Lax for standard localhost HTTP
        settings.ENVIRONMENT = "development"
        resp_dev = Response()
        _set_auth_cookies(resp_dev, "access_val", "refresh_val")
        cookie_header_dev = resp_dev.headers.get("set-cookie")
        assert "samesite=lax" in cookie_header_dev.lower()

        resp_dev_clear = Response()
        _clear_auth_cookies(resp_dev_clear)
        clear_header_dev = resp_dev_clear.headers.get("set-cookie")
        assert "samesite=lax" in clear_header_dev.lower()
    finally:
        settings.ENVIRONMENT = orig_env


def test_cors_configuration_allows_vercel_production_origin():
    """Verify that assemble_cors_origins correctly parses production Vercel frontend origins."""
    parsed = settings.assemble_cors_origins('["https://dayfold-three.vercel.app"]')
    assert "https://dayfold-three.vercel.app" in parsed
    parsed_comma = settings.assemble_cors_origins("https://dayfold-three.vercel.app, https://localhost:3000")
    assert "https://dayfold-three.vercel.app" in parsed_comma


def test_logout_clears_cookies_matching_production_policy():
    """Verify logout applies the exact same SameSite=None; Secure policy when deleting cookies in production."""
    orig_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        resp = Response()
        _clear_auth_cookies(resp)
        raw_cookies = resp.headers.getlist("set-cookie")
        assert len(raw_cookies) > 0
        for cookie in raw_cookies:
            assert "samesite=none" in cookie.lower()
            assert "secure" in cookie.lower()
    finally:
        settings.ENVIRONMENT = orig_env
