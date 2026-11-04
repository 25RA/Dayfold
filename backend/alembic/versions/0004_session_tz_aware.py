"""Convert sessions revoked_at to timezone-aware UTC

Revision ID: 0004_session_tz_aware
Revises: 0003_session_refresh
Create Date: 2026-11-04 00:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0004_session_tz_aware'
down_revision: Union[str, None] = '0003_session_refresh'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('sessions') as batch_op:
            batch_op.alter_column('revoked_at', type_=sa.DateTime(timezone=True))
    else:
        # PostgreSQL / Neon: convert only revoked_at (added in 0003 as TIMESTAMP WITHOUT TIME ZONE).
        # expires_at and created_at were already created as TIMESTAMP WITH TIME ZONE in 0001.
        op.alter_column(
            'sessions',
            'revoked_at',
            type_=sa.DateTime(timezone=True),
            postgresql_using="revoked_at AT TIME ZONE 'UTC'"
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('sessions') as batch_op:
            batch_op.alter_column('revoked_at', type_=sa.DateTime(timezone=False))
    else:
        op.alter_column(
            'sessions',
            'revoked_at',
            type_=sa.DateTime(timezone=False),
            postgresql_using="revoked_at AT TIME ZONE 'UTC'"
        )
