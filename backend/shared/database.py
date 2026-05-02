"""XMeet AI — SQLAlchemy 2.0 models and session management.

Provides both async (for FastAPI routes) and sync (for calendar_bp compatibility)
session access.
"""

import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
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

def _build_url(driver: str) -> str:
    ssl_part = "?sslmode=require" if PG_SSL == "require" else ""
    return (
        f"postgresql+{driver}://{PG_USER}:{PG_PASSWORD}"
        f"@{PG_HOST}:{PG_PORT}/{PG_DATABASE}{ssl_part}"
    )


ASYNC_DATABASE_URL = _build_url("asyncpg")
SYNC_DATABASE_URL = _build_url("psycopg2")

# ── Engines ───────────────────────────────────────────────────────────────────

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
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
    created_at = Column(DateTime(timezone=True), default=_now)


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False, default="Untitled Meeting")
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    status = Column(String, nullable=False, default="pending")
    # pending / recording / processing / completed / error
    audio_url = Column(String, nullable=True)
    mode = Column(String, nullable=False, default="meeting")
    language = Column(String, nullable=False, default="zh-TW")
    folder = Column(String, nullable=True)
    source = Column(String, nullable=True)  # upload / record / calendar
    participants = Column(Integer, nullable=True)
    share_token = Column(String, nullable=True, unique=True, index=True)


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


class CalendarToken(Base):
    __tablename__ = "calendar_tokens"

    id = Column(String, primary_key=True)          # f"{user_id}_{provider}"
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String, nullable=False, default="microsoft")
    token_data = Column(JSON, nullable=True)        # {access_token, refresh_token, expires_in, stored_at}
    # Alias columns for async blueprints
    access_token = Column(String, nullable=True)
    refresh_token = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
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

def init_db() -> None:
    """Initialise DB schema on startup.

    Development  → create_all() (fast, no migration tracking).
    Production   → alembic upgrade head (safe, idempotent, tracked).
    """
    import logging
    _log = logging.getLogger(__name__)

    from shared.config import ENVIRONMENT
    if ENVIRONMENT == "production":
        try:
            from alembic.config import Config
            from alembic import command
            import os
            alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
            command.upgrade(alembic_cfg, "head")
            _log.info("Alembic migrations applied (head)")
        except Exception as exc:
            _log.error(f"Alembic migration failed: {exc}")
            raise
    else:
        try:
            Base.metadata.create_all(bind=_sync_engine)
        except Exception as exc:
            _log.warning(f"init_db create_all failed (DB may be unavailable): {exc}")
