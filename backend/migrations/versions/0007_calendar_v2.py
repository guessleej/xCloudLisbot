"""Add Recall Calendar V2 columns (users.recall_calendar_id/auto_join_*, meetings.calendar_event_id)

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("recall_calendar_id", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column("auto_join_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("auto_join_scope", sa.String(), nullable=False, server_default="hosted"),
    )
    op.create_check_constraint(
        "ck_users_auto_join_scope", "users", "auto_join_scope IN ('all','hosted')"
    )
    op.add_column("meetings", sa.Column("calendar_event_id", sa.String(), nullable=True))
    op.create_index("ix_meetings_calendar_event_id", "meetings", ["calendar_event_id"])


def downgrade() -> None:
    op.drop_index("ix_meetings_calendar_event_id", table_name="meetings")
    op.drop_column("meetings", "calendar_event_id")
    op.drop_constraint("ck_users_auto_join_scope", "users", type_="check")
    op.drop_column("users", "auto_join_scope")
    op.drop_column("users", "auto_join_enabled")
    op.drop_column("users", "recall_calendar_id")
