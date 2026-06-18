"""Default auto-join to ON / all online meetings

Product decision: the recording bot should auto-join all online meetings by
default. Flip the column defaults and bring existing users to the new default.

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-18
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_enabled SET DEFAULT true")
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_scope SET DEFAULT 'all'")
    # Apply the new default to existing users.
    op.execute("UPDATE users SET auto_join_enabled = true, auto_join_scope = 'all'")


def downgrade() -> None:
    op.execute("UPDATE users SET auto_join_enabled = false, auto_join_scope = 'hosted'")
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_scope SET DEFAULT 'hosted'")
    op.execute("ALTER TABLE users ALTER COLUMN auto_join_enabled SET DEFAULT false")
