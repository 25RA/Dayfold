"""Add daily_reflections table and plan_unscheduled index

Revision ID: 0002_add_daily_reflections
Revises: 0001_initial_schema
Create Date: 2026-11-02 23:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0002_add_daily_reflections'
down_revision: Union[str, None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. daily_reflections table
    op.create_table(
        'daily_reflections',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('target_date', sa.String(length=10), nullable=False),
        sa.Column('went_well', sa.Text(), nullable=False),
        sa.Column('remained_unfinished', sa.Text(), nullable=False),
        sa.Column('do_differently', sa.Text(), nullable=False),
        sa.Column('additional_notes', sa.Text(), nullable=True),
        sa.Column('voice_used', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    # Composite lookup index
    op.create_index(
        'ix_reflections_user_target_date',
        'daily_reflections',
        ['user_id', 'target_date'],
        unique=False
    )
    # Partial unique index enforcing at most one active reflection per user per calendar day
    op.create_index(
        'uq_reflections_user_date',
        'daily_reflections',
        ['user_id', 'target_date'],
        unique=True,
        sqlite_where=sa.text('deleted_at IS NULL'),
        postgresql_where=sa.text('deleted_at IS NULL')
    )

    # 2. plan_unscheduled index on plan_id
    op.create_index(
        'ix_plan_unscheduled_plan_id',
        'plan_unscheduled',
        ['plan_id'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_plan_unscheduled_plan_id', table_name='plan_unscheduled')
    op.drop_index('uq_reflections_user_date', table_name='daily_reflections')
    op.drop_index('ix_reflections_user_target_date', table_name='daily_reflections')
    op.drop_table('daily_reflections')

