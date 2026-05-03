"""Add cloud_storage_provider column to meetings

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("cloud_storage_provider", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meetings", "cloud_storage_provider")
