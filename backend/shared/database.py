"""xCloud Lisbot — SQLAlchemy 2.0 models and session management.

Provides both async (for FastAPI routes) and sync (for calendar_bp compatibility)
session access.
"""

import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, create_engine,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import JSON

from shared.config import (
    PG_DATABASE, PG_HOST, PG_PASSWORD, PG_PORT, PG_SSL, PG_USER,
)

# ── Connection URLs ───────────────────────────────────────────────────────────

# asyncpg: SSL via connect_args, not URL query
ASYNC_DATABASE_URL = (
    f"postgresql+asyncpg://{PG_USER}:{PG_PASSWORD}"
    f"@{PG_HOST}:{PG_PORT}/{PG_DATABASE}"
)

# psycopg2: SSL via URL query parameter
_sync_ssl_param = "?sslmode=require" if PG_SSL == "require" else ""
SYNC_DATABASE_URL = (
    f"postgresql+psycopg2://{PG_USER}:{PG_PASSWORD}"
    f"@{PG_HOST}:{PG_PORT}/{PG_DATABASE}{_sync_ssl_param}"
)

# ── Engines ───────────────────────────────────────────────────────────────────

_async_connect_args = {}
if PG_SSL == "require":
    _async_connect_args["ssl"] = True

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=_async_connect_args,
)

_sync_engine = create_engine(
    SYNC_DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# ── Session factories ─────────────────────────────────────────────────────────

AsyncSessionLocal = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)

SyncSessionLocal = sessionmaker(bind=_sync_engine, expire_on_commit=False)


# ── ORM Base ──────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Models ────────────────────────────────────────────────────────────────────

def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    provider = Column(String, nullable=False, default="microsoft")
    job_title = Column(String, nullable=True)
    department = Column(String, nullable=True)
    language = Column(String, nullable=True, default="zh-TW")
    timezone = Column(String, nullable=True, default="Asia/Taipei")
    custom_folders = Column(JSON, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), default=_now)
    # Recall.ai Calendar V2: connected calendar id + auto-join preference.
    recall_calendar_id = Column(String, nullable=True)
    auto_join_enabled = Column(Boolean, nullable=False, default=True)
    auto_join_scope = Column(String, nullable=False, default="all")  # 'all' | 'hosted'

    __table_args__ = (
        CheckConstraint(
            "auto_join_scope IN ('all','hosted')",
            name="ck_users_auto_join_scope",
        ),
    )


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False, default="Untitled Meeting")
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    status = Column(String, nullable=False, default="pending")
    audio_url = Column(String, nullable=True)
    mode = Column(String, nullable=False, default="meeting")
    language = Column(String, nullable=False, default="zh-TW")
    folder = Column(String, nullable=True)
    source = Column(String, nullable=True)
    participants = Column(Integer, nullable=True)
    share_token = Column(String, nullable=True, unique=True, index=True)
    cloud_storage_provider = Column(String, nullable=True)  # onedrive / google_drive / azure_blob
    # Recall.ai meeting-bot recording (replaces in-browser Azure Speech for remote calls)
    recall_bot_id = Column(String, nullable=True, index=True)
    recall_status = Column(String, nullable=True)  # recall.ai bot lifecycle event (e.g. bot.in_call_recording)
    # Recall Calendar V2 event this meeting was auto/manually scheduled from (for webhook reconcile + dedup).
    calendar_event_id = Column(String, nullable=True, index=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','recording','processing','completed','error')",
            name="ck_meetings_status",
        ),
    )


class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(String, primary_key=True, default=_uuid)
    meeting_id = Column(String, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    speaker = Column(String, nullable=True)
    speaker_id = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=True)
    offset_ms = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=True)
    language = Column(String, nullable=True)
    source = Column(String, nullable=True)  # 'recall' | 'azure' | null — used for source-scoped re-ingest


class Summary(Base):
    __tablename__ = "summaries"

    id = Column(String, primary_key=True, default=_uuid)
    meeting_id = Column(String, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    markdown = Column(Text, nullable=True)
    action_items = Column(JSON, nullable=True)
    key_decisions = Column(JSON, nullable=True)
    next_meeting_topics = Column(JSON, nullable=True)
    generated_at = Column(DateTime(timezone=True), default=_now)
    template_id = Column(String, nullable=True)
    template_name = Column(String, nullable=True)


class Terminology(Base):
    __tablename__ = "terminology"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    terms = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class Template(Base):
    __tablename__ = "templates"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True)
    is_builtin = Column(Boolean, nullable=False, default=False)
    system_prompt_override = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)


class Share(Base):
    __tablename__ = "shares"

    id = Column(String, primary_key=True, default=_uuid)
    meeting_id = Column(String, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    member_email = Column(String, nullable=True)
    member_name = Column(String, nullable=True)
    permission = Column(String, nullable=False, default="view")  # view / edit
    shared_at = Column(DateTime(timezone=True), default=_now)


class Subscription(Base):
    """One subscription record per user. Created on first login with free defaults."""
    __tablename__ = "subscriptions"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    plan_name = Column(String, nullable=False, default="免費試用")
    price_per_seat = Column(Float, nullable=False, default=0.0)
    seats_total = Column(Integer, nullable=False, default=1)
    upload_total_min = Column(Integer, nullable=False, default=300)
    next_invoice_date = Column(String, nullable=True)
    next_amount = Column(Float, nullable=False, default=0.0)
    card_last4 = Column(String, nullable=True)
    card_brand = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")  # active / cancelled / past_due
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_no = Column(String, nullable=False)          # INV-YYYY-MM
    date = Column(String, nullable=False)
    description = Column(String, nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    period = Column(String, nullable=False, default="")
    amount = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="pending")  # paid / pending / failed
    created_at = Column(DateTime(timezone=True), default=_now)


class CalendarToken(Base):
    __tablename__ = "calendar_tokens"

    id = Column(String, primary_key=True)   # f"{user_id}_{provider}"
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String, nullable=False, default="microsoft")
    token_data = Column(JSON, nullable=True)  # encrypted: {access_token, refresh_token, expires_in, stored_at}
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


# ── Session helpers ───────────────────────────────────────────────────────────

async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI Depends — async session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def get_session() -> Session:
    """Synchronous session (used by calendar_bp.py)."""
    return SyncSessionLocal()


# ── Init ──────────────────────────────────────────────────────────────────────

_BUILTIN_TEMPLATES = [
    {
        "id": "builtin-meeting",
        "name": "一般會議",
        "description": "適用於日常工作會議、進度回顧、決策討論",
        "icon": "Users",
        "system_prompt_override": "你是一位專業的會議記錄助手。請根據逐字稿產生繁體中文的會議摘要。",
    },
    {
        "id": "builtin-interview",
        "name": "面試記錄",
        "description": "適用於人才招募面試、評估記錄",
        "icon": "UserCheck",
        "system_prompt_override": "你是一位人資面試記錄助手。請根據逐字稿產生繁體中文的面試摘要。",
    },
    {
        "id": "builtin-brainstorm",
        "name": "腦力激盪",
        "description": "適用於創意發想、概念討論",
        "icon": "Lightbulb",
        "system_prompt_override": "你是一位創意腦力激盪記錄助手。請根據逐字稿產生繁體中文的腦力激盪摘要。",
    },
    {
        "id": "builtin-lecture",
        "name": "課程講座",
        "description": "適用於教育訓練、課程記錄",
        "icon": "GraduationCap",
        "system_prompt_override": "你是一位課程記錄助手。請根據逐字稿產生繁體中文的課程摘要。",
    },
    {
        "id": "builtin-standup",
        "name": "站立會議",
        "description": "適用於敏捷開發每日 standup",
        "icon": "Zap",
        "system_prompt_override": "你是一位敏捷開發站立會議助手。請根據逐字稿產生繁體中文的站立會議摘要。",
    },
    {
        "id": "builtin-review",
        "name": "程式碼審查",
        "description": "適用於 code review、技術討論",
        "icon": "Code",
        "system_prompt_override": "你是一位程式碼審查記錄助手。請根據逐字稿產生繁體中文的審查摘要。",
    },
    {
        "id": "builtin-client",
        "name": "客戶會議",
        "description": "適用於客戶溝通、需求訪談、銷售會議",
        "icon": "Briefcase",
        "system_prompt_override": "你是一位客戶會議記錄助手。請根據逐字稿產生繁體中文的客戶會議摘要。",
    },
]


def _seed_builtin_templates() -> None:
    import logging
    _log = logging.getLogger(__name__)
    from datetime import datetime, timezone
    try:
        with SyncSessionLocal() as session:
            from sqlalchemy import select as _select
            for tpl in _BUILTIN_TEMPLATES:
                exists = session.execute(
                    _select(Template).where(Template.id == tpl["id"])
                ).scalar_one_or_none()
                if exists is None:
                    session.add(Template(
                        id=tpl["id"],
                        user_id=None,
                        name=tpl["name"],
                        description=tpl["description"],
                        icon=tpl["icon"],
                        is_builtin=True,
                        system_prompt_override=tpl["system_prompt_override"],
                        created_at=datetime.now(timezone.utc),
                    ))
            session.commit()
        _log.info("Builtin templates seeded (%d templates)", len(_BUILTIN_TEMPLATES))
    except Exception as exc:
        _log.warning("Failed to seed builtin templates: %s", exc)


def init_db() -> None:
    """Initialise DB schema on startup.

    Always applies Alembic migrations (idempotent) regardless of ENVIRONMENT — the
    cloud test env runs ENVIRONMENT=development but still needs schema migrations
    applied on deploy. create_all() is only a fallback for a brand-new DB. The DB
    must be stamped at the current head once (alembic stamp head) so the upgrade is
    a clean no-op against an already-provisioned schema.
    """
    import logging
    import os
    _log = logging.getLogger(__name__)

    try:
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
        command.upgrade(alembic_cfg, "head")
        _log.info("Alembic migrations applied (head)")
    except Exception as exc:
        _log.warning("Alembic upgrade failed (%s); falling back to create_all", exc)
        try:
            Base.metadata.create_all(bind=_sync_engine)
        except Exception as exc2:
            _log.warning("init_db create_all fallback failed: %s", exc2)

    _seed_builtin_templates()
