from __future__ import annotations
from typing import Optional, Union, List
import json
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
import secrets

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_DEFAULT_DB = (_BASE_DIR / "dayfold.db").as_posix()

DEV_FALLBACK_SECRET: str = "dayfold-local-development-secret-key-32chars-min"


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Dayfold"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Security
    # In development, a stable deterministic secret is used if not configured.
    # In production, SECRET_KEY must be explicitly provided via environment variables.
    SECRET_KEY: str = DEV_FALLBACK_SECRET
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"

    # Optional Redis for distributed multi-worker rate limiting
    REDIS_URL: Optional[str] = None

    # Database
    DATABASE_URL: str = f"sqlite+aiosqlite:///{_DEFAULT_DB}"
    DATABASE_URL_SYNC: str = f"sqlite:///{_DEFAULT_DB}"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_async_db_url(cls, v: str) -> str:
        if not v:
            return v
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://") and not v.startswith("postgresql+asyncpg://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("DATABASE_URL_SYNC", mode="before")
    @classmethod
    def assemble_sync_db_url(cls, v: str) -> str:
        if not v:
            return v
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        elif "asyncpg" in v:
            v = v.replace("postgresql+asyncpg://", "postgresql://", 1)
        elif "aiosqlite" in v:
            v = v.replace("sqlite+aiosqlite://", "sqlite://", 1)
        return v

    @model_validator(mode="after")
    def sync_database_urls(self) -> Settings:
        if "postgresql" in self.DATABASE_URL and "sqlite" in self.DATABASE_URL_SYNC:
            sync_url = self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
            self.DATABASE_URL_SYNC = sync_url
        return self

    @model_validator(mode="after")
    def validate_security_settings(self) -> Settings:
        if self.ENVIRONMENT.lower() == "production":
            if (
                not self.SECRET_KEY
                or self.SECRET_KEY == DEV_FALLBACK_SECRET
                or len(self.SECRET_KEY) < 32
            ):
                raise ValueError(
                    "Production configuration error: SECRET_KEY must be explicitly set via environment "
                    "variables with at least 32 cryptographically secure characters. "
                    "Do not use the local development default in production."
                )
            if not self.REDIS_URL or not self.REDIS_URL.strip():
                raise ValueError(
                    "Production configuration error: REDIS_URL must be explicitly configured in production "
                    "for distributed token revocation and multi-worker rate limiting (e.g. Upstash Redis). "
                    "In-memory storage is not permitted in production."
                )
            if "sqlite" in self.DATABASE_URL.lower():
                raise ValueError(
                    "Production configuration error: DATABASE_URL must point to a persistent PostgreSQL database "
                    "(e.g. Neon PostgreSQL). Ephemeral SQLite storage is not permitted in production."
                )
        return self

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []

    # Gemini AI
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.6-flash"
    GEMINI_EXTRACT_MODEL: str = "gemini-3.6-flash"

    # Rate limiting
    AI_REQUESTS_PER_HOUR: int = 60
    AI_REQUESTS_PER_DAY: int = 200

    # Google OAuth (optional for MVP)
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=(_BASE_DIR / ".env").as_posix(),
        env_file_encoding="utf-8",
        extra="ignore"
    )


Settings.model_rebuild()
settings = Settings()

