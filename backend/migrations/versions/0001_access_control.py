"""Access control: family, member, member_credential, session.

Revision ID: 0001
Revises:
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "family",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("timezone", sqlmodel.AutoString(length=64), nullable=False),
        sa.Column("passcode_hash", sqlmodel.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "member",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("nickname", sqlmodel.AutoString(length=20), nullable=False),
        sa.Column("avatar_emoji", sqlmodel.AutoString(length=16), nullable=False),
        sa.Column(
            "role",
            sa.Enum("parent", "child", name="role", native_enum=False, create_constraint=True),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("family_id", "nickname"),
    )
    op.create_index("ix_member_family_id", "member", ["family_id"])
    op.create_table(
        "member_credential",
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("pin_hash", sqlmodel.AutoString(), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["member_id"], ["member.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("member_id"),
    )
    op.create_table(
        "session",
        sa.Column("id", sqlmodel.AutoString(length=64), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("acting_member_id", sa.Uuid(), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acting_member_last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["acting_member_id"], ["member.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_family_id", "session", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_session_family_id", table_name="session")
    op.drop_table("session")
    op.drop_table("member_credential")
    op.drop_index("ix_member_family_id", table_name="member")
    op.drop_table("member")
    op.drop_table("family")
