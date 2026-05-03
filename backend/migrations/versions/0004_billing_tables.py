"""Add subscriptions and invoices tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id",               sa.String(),  primary_key=True),
        sa.Column("user_id",          sa.String(),  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_name",        sa.String(),  nullable=False, server_default="免費試用"),
        sa.Column("price_per_seat",   sa.Float(),   nullable=False, server_default="0"),
        sa.Column("seats_total",      sa.Integer(), nullable=False, server_default="1"),
        sa.Column("upload_total_min", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("next_invoice_date",sa.String(),  nullable=True),
        sa.Column("next_amount",      sa.Float(),   nullable=False, server_default="0"),
        sa.Column("card_last4",       sa.String(),  nullable=True),
        sa.Column("card_brand",       sa.String(),  nullable=True),
        sa.Column("status",           sa.String(),  nullable=False, server_default="active"),
        sa.Column("created_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at",       sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])

    op.create_table(
        "invoices",
        sa.Column("id",          sa.String(),  primary_key=True),
        sa.Column("user_id",     sa.String(),  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_no",  sa.String(),  nullable=False),
        sa.Column("date",        sa.String(),  nullable=False),
        sa.Column("description", sa.String(),  nullable=False),
        sa.Column("qty",         sa.Integer(), nullable=False, server_default="1"),
        sa.Column("period",      sa.String(),  nullable=False, server_default=""),
        sa.Column("amount",      sa.Float(),   nullable=False, server_default="0"),
        sa.Column("status",      sa.String(),  nullable=False, server_default="pending"),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_invoices_user_id", "invoices", ["user_id"])


def downgrade() -> None:
    op.drop_table("invoices")
    op.drop_table("subscriptions")
