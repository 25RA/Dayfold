"""Add conversation_id to pending_actions.

Revision ID: 0005_pending_action_conv
Revises: 0004_session_tz_aware
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_pending_action_conv"
down_revision = "0004_session_tz_aware"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pending_actions",
        sa.Column("conversation_id", sa.String(length=36), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pending_actions", "conversation_id")