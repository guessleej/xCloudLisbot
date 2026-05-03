"""Add status CHECK constraint; drop dead CalendarToken columns

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VALID_STATUSES = "('pending','recording','processing','completed','error')"
_CONSTRAINT_NAME = "ck_meetings_status"


def upgrade() -> None:
    # Normalise any out-of-range rows before adding the constraint
    op.execute(
        f"UPDATE meetings SET status = 'error' "
        f"WHERE status NOT IN {_VALID_STATUSES}"
    )
    op.create_check_constraint(
        _CONSTRAINT_NAME,
        "meetings",
        f"status IN {_VALID_STATUSES}",
    )

    # Drop the three legacy plaintext token columns that are now dead code.
    # All calendar token data lives exclusively in the encrypted `token_data`
    # JSON column managed by shared/crypto.py.
    with op.batch_alter_table("calendar_tokens") as batch:
        batch.drop_column("access_token")
        batch.drop_column("refresh_token")
        batch.drop_column("expires_at")


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT_NAME, "meetings", type_="check")

    with op.batch_alter_table("calendar_tokens") as batch:
        batch.add_column(sa.Column("access_token", sa.String(), nullable=True))
        batch.add_column(sa.Column("refresh_token", sa.String(), nullable=True))
        batch.add_column(sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
