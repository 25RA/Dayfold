"""
Dayfold Distributed Shared Store
================================
Provides a unified interface for token revocation and atomic sliding-window rate limiting.
- In production (with settings.REDIS_URL): uses Redis for multi-worker synchronization with
  atomic Lua scripts for rate limiting and fail-closed security for token revocation.
- In development / test (when REDIS_URL is not set): falls back to an in-memory thread-safe store,
  enabling local development without external dependencies.
"""
from __future__ import annotations

import time
import math
import uuid
import logging
import threading
from typing import Optional, Tuple
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as aioredis  # type: ignore
except ImportError:
    aioredis = None


# Atomic Lua script for Redis sliding-window rate limiting
SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_req = tonumber(ARGV[3])
local member = ARGV[4]

local clear_before = now - window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)
local current = redis.call('ZCARD', key)

if current < max_req then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, math.ceil(window))
    return {1, 0}
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry = 1
    if oldest and #oldest >= 2 then
        retry = math.max(1, math.ceil(tonumber(oldest[2]) + window - now))
    end
    return {0, retry}
end
"""


class InMemoryBackend:
    """Thread-safe in-memory store for development and test environments."""
    def __init__(self):
        self._lock = threading.Lock()
        self._revoked: dict[str, float] = {}
        self._rate_limits: dict[str, list[float]] = {}
        self._last_cleanup = time.time()

    def revoke_token(self, jti: str, exp_ts: float) -> None:
        if not jti:
            return
        with self._lock:
            self._cleanup_revocations()
            self._revoked[jti] = exp_ts

    def is_token_revoked(self, jti: Optional[str]) -> bool:
        if not jti:
            return False
        now = time.time()
        with self._lock:
            if jti in self._revoked:
                if self._revoked[jti] > now:
                    return True
                else:
                    del self._revoked[jti]
            return False

    def check_rate_limit(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        now = time.time()
        with self._lock:
            if now - self._last_cleanup > 60:
                self._cleanup_all(now)

            timestamps = self._rate_limits.get(key, [])
            window_start = now - window_seconds
            valid_timestamps = [t for t in timestamps if t > window_start]

            if len(valid_timestamps) >= max_requests:
                oldest_in_window = valid_timestamps[0]
                retry_after = max(1, math.ceil(oldest_in_window + window_seconds - now))
                self._rate_limits[key] = valid_timestamps
                return False, retry_after

            valid_timestamps.append(now)
            self._rate_limits[key] = valid_timestamps
            return True, 0

    def _cleanup_revocations(self) -> None:
        now = time.time()
        expired = [k for k, v in self._revoked.items() if v <= now]
        for k in expired:
            del self._revoked[k]

    def _cleanup_all(self, now: float) -> None:
        self._last_cleanup = now
        self._cleanup_revocations()
        stale_keys = []
        for k, timestamps in self._rate_limits.items():
            valid = [t for t in timestamps if t > now - 86400]
            if not valid:
                stale_keys.append(k)
            else:
                self._rate_limits[k] = valid
        for k in stale_keys:
            del self._rate_limits[k]


class DistributedManager:
    """
    Unified manager that delegates to Redis when REDIS_URL is configured,
    or falls back to InMemoryBackend in development/testing.
    """
    def __init__(self):
        self._in_memory = InMemoryBackend()
        self._redis_client = None
        self._lua_script = None

    def _get_redis(self):
        if not settings.REDIS_URL or aioredis is None:
            return None
        if self._redis_client is None:
            self._redis_client = aioredis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
        return self._redis_client

    async def revoke_token(self, jti: str, exp_ts: float) -> None:
        """Revoke an access token JTI until its expiration."""
        if not jti:
            return
        redis = self._get_redis()
        if redis:
            try:
                ttl = max(1, math.ceil(exp_ts - time.time()))
                await redis.set(f"dayfold:revoked:{jti}", "1", ex=ttl)
                return
            except Exception as e:
                logger.error(f"Redis revoke_token failed: {e}")
                if settings.ENVIRONMENT == "production":
                    # Fail closed in production
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Session invalidation service unavailable. Please retry.",
                    )
        if settings.ENVIRONMENT == "production":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Session invalidation service unavailable. Please retry.",
            )
        # Development fallback
        self._in_memory.revoke_token(jti, exp_ts)

    async def is_token_revoked(self, jti: Optional[str]) -> bool:
        """
        Check if a token has been revoked.
        In production, if Redis is configured but unreachable, FAILS CLOSED
        (raises 503 or treats token as revoked) so compromised tokens are never accepted.
        """
        if not jti:
            return False
        redis = self._get_redis()
        if redis:
            try:
                exists = await redis.exists(f"dayfold:revoked:{jti}")
                return bool(exists)
            except Exception as e:
                logger.critical(f"Redis is_token_revoked unavailable: {e}")
                if settings.ENVIRONMENT == "production":
                    # Fail-closed security policy: reject token when revocation store is unreachable
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Authentication verification service temporarily unavailable.",
                    )
                # In development fallback to in-memory check
                return self._in_memory.is_token_revoked(jti)

        if settings.ENVIRONMENT == "production":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication verification service temporarily unavailable.",
            )
        return self._in_memory.is_token_revoked(jti)

    async def check_rate_limit(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Check and record rate limit using atomic sliding window.
        Returns (is_allowed, retry_after_seconds).
        """
        redis = self._get_redis()
        if redis:
            try:
                now = time.time()
                member = str(uuid.uuid4())
                res = await redis.eval(
                    SLIDING_WINDOW_LUA,
                    1,
                    f"dayfold:ratelimit:{key}",
                    now,
                    window_seconds,
                    max_requests,
                    member,
                )
                allowed = bool(res[0])
                retry_after = int(res[1])
                return allowed, retry_after
            except Exception as e:
                logger.error(f"Redis rate limiting failed: {e}")
                if settings.ENVIRONMENT == "production":
                    # In production with Redis down, fall back to in-memory safety
                    return self._in_memory.check_rate_limit(key, max_requests, window_seconds)

        return self._in_memory.check_rate_limit(key, max_requests, window_seconds)


# Global singleton
distributed_store = DistributedManager()

