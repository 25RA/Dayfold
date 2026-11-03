"""Add refresh_token_hash and revoked_at to sessions

Revision ID: 0003_add_session_refresh_token_hash
Revises: 0002_add_daily_reflections
Create Date: 2026-11-03 23:55:00.000000

"""
from typing import Sequence, Union
from alembic import op, context
import sqlalchemy as sa

revision: str = '0003_add_session_refresh_token_hash'
down_revision: Union[str, None] = '0002_add_daily_reflections'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('sessions') as batch_op:
            batch_op.add_column(sa.Column('refresh_token_hash', sa.String(length=255), nullable=True))
            batch_op.add_column(sa.Column('revoked_at', sa.DateTime(), nullable=True))

        # Semantically safe migration of any existing legacy sessions:
        # Rather than assuming legacy tokens match modern SHA-256 refresh tokens,
        # assign a non-colliding unique marker and explicitly mark the session revoked.
        op.execute(
            "UPDATE sessions SET "
            "refresh_token_hash = 'legacy_revoked_' || id, "
            "revoked_at = CURRENT_TIMESTAMP "
            "WHERE refresh_token_hash IS NULL"
        )

        with op.batch_alter_table('sessions') as batch_op:
            batch_op.alter_column('refresh_token_hash', nullable=False)
            batch_op.create_unique_constraint('uq_sessions_refresh_token_hash', ['refresh_token_hash'])
            batch_op.create_index('ix_sessions_user_id', ['user_id'], unique=False)
            batch_op.alter_column('token_hash', nullable=True)
    else:
        # PostgreSQL / Neon production: direct, transactional DDL without batch table copy
        op.add_column('sessions', sa.Column('refresh_token_hash', sa.String(length=255), nullable=True))
        op.add_column('sessions', sa.Column('revoked_at', sa.DateTime(), nullable=True))

        # Semantically safe migration of any existing legacy sessions:
        # Rather than assuming legacy tokens match modern SHA-256 refresh tokens,
        # assign a non-colliding unique marker and explicitly mark the session revoked.
        op.execute(
            "UPDATE sessions SET "
            "refresh_token_hash = 'legacy_revoked_' || id, "
            "revoked_at = CURRENT_TIMESTAMP "
            "WHERE refresh_token_hash IS NULL"
        )

        op.alter_column('sessions', 'refresh_token_hash', nullable=False)
        op.create_unique_constraint('uq_sessions_refresh_token_hash', 'sessions', ['refresh_token_hash'])
        op.create_index('ix_sessions_user_id', 'sessions', ['user_id'], unique=False)
        op.alter_column('sessions', 'token_hash', nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Safe precondition check (online mode):
    # Under schema version 0002, token_hash has a NOT NULL constraint and represents
    # legacy authentication tokens. Sessions created under version 0003 have token_hash = NULL
    # and cannot function under the legacy authentication system.
    # To prevent silent data destruction, we do NOT delete sessions automatically.
    # If modern sessions exist with NULL token_hash, we halt the downgrade with an explicit error.
    if not context.is_offline_mode():
        conn = op.get_bind()
        null_count = conn.execute(
            sa.text("SELECT COUNT(*) FROM sessions WHERE token_hash IS NULL")
        ).scalar()
        if null_count and null_count > 0:
            raise RuntimeError(
                f"Cannot downgrade migration 0003: Found {null_count} session(s) where token_hash is NULL. "
                "These modern sessions cannot satisfy the legacy NOT NULL constraint on token_hash. "
                "To prevent accidental data loss, downgrade has been stopped. "
                "Please review and archive/clean modern sessions manually before downgrading."
            )

    if dialect == 'sqlite':
        with op.batch_alter_table('sessions') as batch_op:
            batch_op.drop_index('ix_sessions_user_id')
            batch_op.drop_constraint('uq_sessions_refresh_token_hash', type_='unique')
            batch_op.drop_column('revoked_at')
            batch_op.drop_column('refresh_token_hash')
            batch_op.alter_column('token_hash', nullable=False)
    else:
        # PostgreSQL / Neon production:
        # Precondition assertion in SQL for offline generation & script safety:
        # Aborts transaction before executing any destructive DDL if modern sessions exist.
        op.execute(
            "DO $$\n"
            "DECLARE\n"
            "    null_count integer;\n"
            "BEGIN\n"
            "    SELECT COUNT(*) INTO null_count FROM sessions WHERE token_hash IS NULL;\n"
            "    IF null_count > 0 THEN\n"
            "        RAISE EXCEPTION 'Cannot downgrade migration 0003: Found % session(s) where token_hash is NULL. "
            "These modern sessions cannot satisfy the legacy NOT NULL constraint on token_hash. "
            "Aborting downgrade to prevent accidental data loss.', null_count;\n"
            "    END IF;\n"
            "END $$"
        )

        op.drop_index('ix_sessions_user_id', table_name='sessions')
        op.drop_constraint('uq_sessions_refresh_token_hash', 'sessions', type_='unique')
        op.drop_column('sessions', 'revoked_at')
        op.drop_column('sessions', 'refresh_token_hash')
        op.alter_column('sessions', 'token_hash', nullable=False)
