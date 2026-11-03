"""
Dayfold API Rate Limiter
========================
Provides thread-safe in-memory sliding-window rate limiting for local development
and single-node deployments, with Redis support when settings.REDIS_URL is configured.
"""
from __future__ import annotations

import time
import math
import threading
from typing import Optional, Callable
from fastapi import Request, HTTPException, status, Depends

from app.core.config import settings
from app.models.models import User
from app.core.deps import get_current_user, get_current_user_optional
from app.core.distributed_store import distributed_store


class SlidingWindowRateLimiter:
    """Thread-safe sliding window rate limiter."""

    def __init__(self):
        self._lock = threading.Lock()
        self._records: dict[str, list[float]] = {}
        self._last_cleanup = time.time()

    def check_and_record(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        """
        Returns (is_allowed, retry_after_seconds).
        """
        now = time.time()
        with self._lock:
            # Periodic cleanup every 60 seconds
            if now - self._last_cleanup > 60:
                self._cleanup(now)

            timestamps = self._records.get(key, [])
            window_start = now - window_seconds
            valid_timestamps = [t for t in timestamps if t > window_start]

            if len(valid_timestamps) >= max_requests:
                oldest_in_window = valid_timestamps[0]
                retry_after = max(1, math.ceil(oldest_in_window + window_seconds - now))
                self._records[key] = valid_timestamps
                return False, retry_after

            valid_timestamps.append(now)
            self._records[key] = valid_timestamps
            return True, 0

    def _cleanup(self, now: float) -> None:
        self._last_cleanup = now
        stale_keys = []
        for key, ts_list in self._records.items():
            # Prune records older than 24h
            active = [t for t in ts_list if t > now - 86400]
            if active:
                self._records[key] = active
            else:
                stale_keys.append(key)
        for k in stale_keys:
            del self._records[k]


limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract real client IP considering forward headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit_by_ip(max_requests: int, window_seconds: int, scope: str = "ip"):
    """Dependency that rate-limits by client IP (e.g. for login)."""
    async def dependency(request: Request):
        ip = get_client_ip(request)
        key = f"rl:{scope}:{ip}"
        allowed, retry_after = await distributed_store.check_rate_limit(key, max_requests, window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
    return dependency


def rate_limit_ai(scope: str = "ai"):
    """
    Dependency that enforces user-based AI limits (hourly and daily)
    from settings.AI_REQUESTS_PER_HOUR and settings.AI_REQUESTS_PER_DAY.
    """
    async def dependency(request: Request, current_user: Optional[User] = Depends(get_current_user_optional)):
        ident = current_user.id if current_user else get_client_ip(request)

        # Check hourly limit
        hourly_key = f"rl:{scope}:hour:{ident}"
        allowed_hr, retry_hr = await distributed_store.check_rate_limit(
            hourly_key, settings.AI_REQUESTS_PER_HOUR, 3600
        )
        if not allowed_hr:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"AI request hourly quota reached ({settings.AI_REQUESTS_PER_HOUR}/hr). Retry in {retry_hr}s.",
                headers={"Retry-After": str(retry_hr)},
            )

        # Check daily limit
        daily_key = f"rl:{scope}:day:{ident}"
        allowed_day, retry_day = await distributed_store.check_rate_limit(
            daily_key, settings.AI_REQUESTS_PER_DAY, 86400
        )
        if not allowed_day:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"AI request daily quota reached ({settings.AI_REQUESTS_PER_DAY}/day). Retry in {retry_day}s.",
                headers={"Retry-After": str(retry_day)},
            )

    return dependency

