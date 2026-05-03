"""Add custom_folders JSON column to users table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("custom_folders", JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "custom_folders")
