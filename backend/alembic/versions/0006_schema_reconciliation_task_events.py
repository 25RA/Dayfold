"""Schema reconciliation: task_events, conversations, projects, action_executions.

Revision ID: 0006_schema_reconciliation
Revises: 0005_pending_action_conv
Create Date: 2026-11-04 21:40:00

Resolves production schema drift and reconciles with SQLAlchemy models:
1. task_events: adds actor, change, conversation_id; makes legacy event_type nullable with default.
2. conversations: adds channel, started_at, ended_at, summary; preserves created_at NOT NULL.
3. projects: adds missing updated_at column, backfilled from created_at.
4. action_executions: reconciles pending_action_id, step_index, operation, idempotency_key,
   status (expanded to VARCHAR(32)), attempts, request, response, error_code, started_at;
   preserves legacy action_id, user_id, error_message, rollback_payload independently.
"""

from alembic import op, context
import sqlalchemy as sa


revision = "0006_schema_reconciliation"
down_revision = "0005_pending_action_conv"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. task_events reconciliation
    with op.batch_alter_table("task_events") as batch_op:
        batch_op.add_column(sa.Column("actor", sa.String(length=16), server_default="user", nullable=False))
        batch_op.add_column(sa.Column("change", sa.JSON(), server_default="{}", nullable=False))
        batch_op.add_column(sa.Column("conversation_id", sa.String(length=36), nullable=True))
        batch_op.alter_column("event_type", nullable=True, server_default="generic", existing_type=sa.String(length=50))

    # 2. conversations reconciliation (preserving existing created_at NOT NULL constraint)
    with op.batch_alter_table("conversations") as batch_op:
        batch_op.add_column(sa.Column("channel", sa.String(length=16), server_default="text", nullable=False))
        batch_op.add_column(sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
        batch_op.add_column(sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("summary", sa.Text(), nullable=True))

    # Safe backfill: initialize started_at from created_at for existing conversations
    op.execute("UPDATE conversations SET started_at = created_at WHERE started_at IS NULL")

    # 3. projects reconciliation
    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))

    # Safe backfill: initialize updated_at from created_at for existing projects
    op.execute("UPDATE projects SET updated_at = created_at WHERE updated_at IS NULL")

    # 4. action_executions reconciliation
    # Pre-check & backfill any legacy NULLs before applying NOT NULL constraints
    op.execute("UPDATE action_executions SET status = 'pending' WHERE status IS NULL")
    op.execute("UPDATE action_executions SET started_at = CURRENT_TIMESTAMP WHERE started_at IS NULL")

    with op.batch_alter_table("action_executions") as batch_op:
        batch_op.add_column(sa.Column("pending_action_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("step_index", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("operation", sa.String(length=64), server_default="execute", nullable=False))
        batch_op.add_column(sa.Column("idempotency_key", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("attempts", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("request", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("response", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("error_code", sa.String(length=64), nullable=True))

        # Reconcile status length expansion (20 -> 32)
        batch_op.alter_column("status", type_=sa.String(length=32), existing_type=sa.String(length=20), nullable=False, server_default="pending")

        # Ensure started_at has server_default=now() and is NOT NULL
        batch_op.alter_column("started_at", existing_type=sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)

        # Allow nullable legacy action_id & user_id for new records created by current models
        batch_op.alter_column("action_id", nullable=True, existing_type=sa.String(length=36))
        batch_op.alter_column("user_id", nullable=True, existing_type=sa.String(length=36))

        # Constraints & indexes
        batch_op.create_unique_constraint("uq_action_executions_idempotency_key", ["idempotency_key"])
        batch_op.create_index("ix_action_executions_pending_action_id", ["pending_action_id"])
        batch_op.create_foreign_key(
            "fk_action_executions_pending_action_id",
            "pending_actions",
            ["pending_action_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    # ── Non-destructive pre-rollback safety checks ───────────────────────────
    # If running online against an actual database, inspect existing data before
    # attempting destructive DDL changes (NOT NULL or VARCHAR length reductions).
    # If data does not strictly satisfy the legacy 0005 schema, abort immediately
    # without deleting or altering any records.
    if not context.is_offline_mode():
        conn = op.get_bind()

        # Check 1: action_executions with NULL action_id or user_id
        null_action_or_user = conn.execute(
            sa.text("SELECT id FROM action_executions WHERE action_id IS NULL OR user_id IS NULL")
        ).fetchall()
        if null_action_or_user:
            sample_ids = [r[0] for r in null_action_or_user[:5]]
            raise RuntimeError(
                f"Cannot safely downgrade migration 0006: {len(null_action_or_user)} record(s) in "
                f"'action_executions' have NULL action_id or user_id (sample IDs: {sample_ids}). "
                "The target schema requires NOT NULL for both columns. "
                "To prevent data loss, downgrade has been aborted and no records were modified or deleted."
            )

        # Check 2: action_executions with status length > 20
        long_statuses = conn.execute(
            sa.text("SELECT id, status FROM action_executions WHERE LENGTH(status) > 20")
        ).fetchall()
        if long_statuses:
            samples = [(r[0], r[1]) for r in long_statuses[:5]]
            raise RuntimeError(
                f"Cannot safely downgrade migration 0006: {len(long_statuses)} record(s) in "
                f"'action_executions' have status exceeding VARCHAR(20) (samples: {samples}). "
                "The target schema limits status to VARCHAR(20). "
                "To prevent data loss or silent truncation, downgrade has been aborted and no records were modified or deleted."
            )

        # Check 3: task_events with NULL event_type
        null_events = conn.execute(
            sa.text("SELECT id FROM task_events WHERE event_type IS NULL")
        ).fetchall()
        if null_events:
            sample_events = [r[0] for r in null_events[:5]]
            raise RuntimeError(
                f"Cannot safely downgrade migration 0006: {len(null_events)} record(s) in "
                f"'task_events' have NULL event_type (sample IDs: {sample_events}). "
                "The target schema requires NOT NULL for event_type. "
                "To prevent data loss, downgrade has been aborted and no records were modified or deleted."
            )

    # 4. action_executions downgrade
    with op.batch_alter_table("action_executions") as batch_op:
        batch_op.drop_constraint("fk_action_executions_pending_action_id", type_="foreignkey")
        batch_op.drop_index("ix_action_executions_pending_action_id")
        batch_op.drop_constraint("uq_action_executions_idempotency_key", type_="unique")

        batch_op.alter_column("user_id", nullable=False, existing_type=sa.String(length=36))
        batch_op.alter_column("action_id", nullable=False, existing_type=sa.String(length=36))
        batch_op.alter_column("started_at", server_default=None, existing_type=sa.DateTime(timezone=True), nullable=False)
        batch_op.alter_column("status", type_=sa.String(length=20), existing_type=sa.String(length=32), nullable=False)

        batch_op.drop_column("error_code")
        batch_op.drop_column("response")
        batch_op.drop_column("request")
        batch_op.drop_column("attempts")
        batch_op.drop_column("idempotency_key")
        batch_op.drop_column("operation")
        batch_op.drop_column("step_index")
        batch_op.drop_column("pending_action_id")

    # 3. projects downgrade
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_column("updated_at")

    # 2. conversations downgrade
    with op.batch_alter_table("conversations") as batch_op:
        batch_op.drop_column("summary")
        batch_op.drop_column("ended_at")
        batch_op.drop_column("started_at")
        batch_op.drop_column("channel")

    # 1. task_events downgrade
    with op.batch_alter_table("task_events") as batch_op:
        batch_op.alter_column("event_type", nullable=False, server_default=None, existing_type=sa.String(length=50))
        batch_op.drop_column("conversation_id")
        batch_op.drop_column("change")
        batch_op.drop_column("actor")
