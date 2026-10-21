"""Habits, weekly targets, check-ins, streak savers, gem transactions, prizes, claims, adjustments.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def _member_fk(column: str, ondelete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint([column], ["member.id"], ondelete=ondelete)


def upgrade() -> None:
    op.create_table(
        "habit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("title", sqlmodel.AutoString(length=40), nullable=False),
        sa.Column("goal_note", sqlmodel.AutoString(length=60), nullable=True),
        sa.Column("frequency", _enum("frequency", "daily", "weekly"), nullable=False),
        sa.Column("created_on", sa.Date(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("restarted_on", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="CASCADE"),
        _member_fk("member_id", "CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_habit_family_id", "habit", ["family_id"])
    op.create_index("ix_habit_member_id", "habit", ["member_id"])

    op.create_table(
        "weekly_target",
        sa.Column("habit_id", sa.Uuid(), nullable=False),
        sa.Column("effective_from_week", sa.Date(), nullable=False),
        sa.Column("target", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["habit_id"], ["habit.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("habit_id", "effective_from_week"),
    )

    op.create_table(
        "check_in",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("habit_id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_by_member_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["habit_id"], ["habit.id"], ondelete="CASCADE"),
        _member_fk("member_id", "CASCADE"),
        _member_fk("created_by_member_id", "SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("habit_id", "date"),
    )
    op.create_index("ix_check_in_member_id", "check_in", ["member_id"])

    op.create_table(
        "streak_saver",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("habit_id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("cost", sa.Integer(), nullable=False),
        sa.Column("created_by_member_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["habit_id"], ["habit.id"], ondelete="CASCADE"),
        _member_fk("member_id", "CASCADE"),
        _member_fk("created_by_member_id", "SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("habit_id", "period_start"),
    )
    op.create_index("ix_streak_saver_member_id", "streak_saver", ["member_id"])

    op.create_table(
        "prize",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("title", sqlmodel.AutoString(length=40), nullable=False),
        sa.Column("gem_cost", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prize_family_id", "prize", ["family_id"])

    op.create_table(
        "prize_claim",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("prize_id", sa.Uuid(), nullable=True),
        sa.Column("prize_title", sqlmodel.AutoString(length=40), nullable=False),
        sa.Column("gem_cost", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            _enum("claimstatus", "pending", "approved", "declined", "cancelled"),
            nullable=False,
        ),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by_member_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prize_id"], ["prize.id"], ondelete="SET NULL"),
        _member_fk("member_id", "CASCADE"),
        _member_fk("decided_by_member_id", "SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prize_claim_family_id", "prize_claim", ["family_id"])
    op.create_index("ix_prize_claim_member_id", "prize_claim", ["member_id"])

    op.create_table(
        "gem_transaction",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            _enum(
                "gemtransactionkind",
                "streak_saver",
                "prize_hold",
                "prize_release",
                "correction_writeoff",
            ),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("streak_saver_id", sa.Uuid(), nullable=True),
        sa.Column("prize_claim_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        _member_fk("member_id", "CASCADE"),
        # Spent gems stay spent when a habit (and so its savers) is deleted (REQ-009).
        sa.ForeignKeyConstraint(["streak_saver_id"], ["streak_saver.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["prize_claim_id"], ["prize_claim.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gem_transaction_member_id", "gem_transaction", ["member_id"])

    op.create_table(
        "adjustment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("target_member_id", sa.Uuid(), nullable=False),
        sa.Column("actor_member_id", sa.Uuid(), nullable=True),
        sa.Column(
            "kind",
            _enum(
                "adjustmentkind",
                "habit_created",
                "habit_updated",
                "habit_archived",
                "habit_deleted",
                "check_in_added",
                "check_in_removed",
                "streak_saver_used",
                "pin_reset",
            ),
            nullable=False,
        ),
        sa.Column("habit_id", sa.Uuid(), nullable=True),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="CASCADE"),
        _member_fk("target_member_id", "CASCADE"),
        _member_fk("actor_member_id", "SET NULL"),
        sa.ForeignKeyConstraint(["habit_id"], ["habit.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_adjustment_family_id", "adjustment", ["family_id"])
    op.create_index("ix_adjustment_target_member_id", "adjustment", ["target_member_id"])


def downgrade() -> None:
    for table in (
        "adjustment",
        "gem_transaction",
        "prize_claim",
        "prize",
        "streak_saver",
        "check_in",
        "weekly_target",
        "habit",
    ):
        for index in sa.inspect(op.get_bind()).get_indexes(table):
            op.drop_index(index["name"], table_name=table)
        op.drop_table(table)
