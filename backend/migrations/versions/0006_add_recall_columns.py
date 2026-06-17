"""Add recall_bot_id and recall_status columns to meetings

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("recall_bot_id", sa.String(), nullable=True),
    )
    op.add_column(
        "meetings",
        sa.Column("recall_status", sa.String(), nullable=True),
    )
    op.create_index("ix_meetings_recall_bot_id", "meetings", ["recall_bot_id"])
    # Transcript source ('recall' | 'azure') so recall re-ingest only clears its
    # own segments and never deletes Azure Speech transcripts on the same meeting.
    op.add_column(
        "transcripts",
        sa.Column("source", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transcripts", "source")
    op.drop_index("ix_meetings_recall_bot_id", table_name="meetings")
    op.drop_column("meetings", "recall_status")
    op.drop_column("meetings", "recall_bot_id")
