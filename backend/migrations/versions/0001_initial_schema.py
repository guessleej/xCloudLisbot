"""Initial schema — all 8 tables

Revision ID: 0001
Revises:
Create Date: 2026-05-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("avatar", sa.String(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False, server_default="microsoft"),
        sa.Column("job_title", sa.String(), nullable=True),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("language", sa.String(), nullable=True, server_default="zh-TW"),
        sa.Column("timezone", sa.String(), nullable=True, server_default="Asia/Taipei"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "meetings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default="Untitled Meeting"),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("audio_url", sa.String(), nullable=True),
        sa.Column("mode", sa.String(), nullable=False, server_default="meeting"),
        sa.Column("language", sa.String(), nullable=False, server_default="zh-TW"),
        sa.Column("folder", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("participants", sa.Integer(), nullable=True),
        sa.Column("share_token", sa.String(), nullable=True),
    )
    op.create_index("ix_meetings_user_id", "meetings", ["user_id"])
    op.create_index("ix_meetings_share_token", "meetings", ["share_token"], unique=True)

    op.create_table(
        "transcripts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("meeting_id", sa.String(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("speaker", sa.String(), nullable=True),
        sa.Column("speaker_id", sa.String(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("offset_ms", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("language", sa.String(), nullable=True),
    )
    op.create_index("ix_transcripts_meeting_id", "transcripts", ["meeting_id"])

    op.create_table(
        "summaries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("meeting_id", sa.String(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=True),
        sa.Column("action_items", JSON(), nullable=True),
        sa.Column("key_decisions", JSON(), nullable=True),
        sa.Column("next_meeting_topics", JSON(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("template_id", sa.String(), nullable=True),
        sa.Column("template_name", sa.String(), nullable=True),
        sa.UniqueConstraint("meeting_id"),
    )
    op.create_index("ix_summaries_meeting_id", "summaries", ["meeting_id"])

    op.create_table(
        "terminology",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("terms", JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_terminology_user_id", "terminology", ["user_id"])

    op.create_table(
        "templates",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(), nullable=True),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("system_prompt_override", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_templates_user_id", "templates", ["user_id"])

    op.create_table(
        "shares",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("meeting_id", sa.String(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_email", sa.String(), nullable=True),
        sa.Column("member_name", sa.String(), nullable=True),
        sa.Column("permission", sa.String(), nullable=False, server_default="view"),
        sa.Column("shared_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_shares_meeting_id", "shares", ["meeting_id"])

    op.create_table(
        "calendar_tokens",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default="microsoft"),
        sa.Column("token_data", JSON(), nullable=True),
        sa.Column("access_token", sa.String(), nullable=True),
        sa.Column("refresh_token", sa.String(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_calendar_tokens_user_id", "calendar_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("calendar_tokens")
    op.drop_table("shares")
    op.drop_table("templates")
    op.drop_table("terminology")
    op.drop_table("summaries")
    op.drop_table("transcripts")
    op.drop_table("meetings")
    op.drop_table("users")
