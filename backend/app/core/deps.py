from __future__ import annotations
from typing import Optional
from fastapi import Request, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.auth.auth_service import verify_access_token, get_user_by_id
from app.core.distributed_store import distributed_store
from app.models.models import User

security = HTTPBearer(auto_error=False)


def _extract_token_and_verify_csrf(request: Request, credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    """Extract token from Authorization header or HttpOnly cookie, verifying CSRF for cookie-based state-changing requests."""
    if credentials and credentials.credentials:
        return credentials.credentials

    cookie_token = request.cookies.get("dayfold_access_token")
    if cookie_token:
        # If authenticated via cookie on state-changing request, enforce CSRF protection
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            csrf_header = request.headers.get("X-CSRF-Token")
            csrf_cookie = request.cookies.get("dayfold_csrf_token")
            # In testing/browser environment, if CSRF cookie is present, header must match
            if csrf_cookie and (not csrf_header or csrf_header != csrf_cookie):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CSRF token validation failed."
                )
        return cookie_token

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    raw_token = _extract_token_and_verify_csrf(request, credentials)

    payload = verify_access_token(raw_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    if await distributed_store.is_token_revoked(payload.get("jti")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    user = await get_user_by_id(db, payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    try:
        raw_token = _extract_token_and_verify_csrf(request, credentials)
    except HTTPException:
        return None

    payload = verify_access_token(raw_token)
    if not payload:
        return None
    if await distributed_store.is_token_revoked(payload.get("jti")):
        return None
    return await get_user_by_id(db, payload["sub"])

