from logging.config import fileConfig
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context

from app.core.config import settings
from app.models.models import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set database URL from settings (sync driver for migrations)
target_metadata = Base.metadata

def get_url():
    # Use sync URL for alembic CLI operations
    url = os.getenv("DATABASE_URL_SYNC", settings.DATABASE_URL_SYNC)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if "asyncpg" in url:
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if "aiosqlite" in url:
        url = url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    return url

def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

