"""Revert auto-join default to OFF (manual per-event opt-in)

Limited test quota: auto-joining every online meeting (bot machine time billed
incl. waiting-room) burns the quota. Default OFF; users enable per event (or turn
on the global setting themselves).

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-18
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_enabled SET DEFAULT false")
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_scope SET DEFAULT 'hosted'")
    op.execute("UPDATE users SET auto_join_enabled = false, auto_join_scope = 'hosted'")


def downgrade() -> None:
    op.execute("UPDATE users SET auto_join_enabled = true, auto_join_scope = 'all'")
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_scope SET DEFAULT 'all'")
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_enabled SET DEFAULT true")
