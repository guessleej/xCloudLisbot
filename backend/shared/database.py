"""PostgreSQL database setup with SQLAlchemy."""

import os
import logging
from datetime import datetime, timezone

from contextlib import contextmanager

from sqlalchemy import create_engine, Column, String, Text, Boolean, DateTime, Float, Integer, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, Session

logger = logging.getLogger(__name__)

_engine = None
_SessionLocal = None
Base = declarative_base()


def get_database_url() -> str:
    """Build PostgreSQL connection URL from environment variables."""
    host = os.environ.get("PG_HOST", "localhost")
    port = os.environ.get("PG_PORT", "5432")
    db = os.environ.get("PG_DATABASE", "lisbot")
    user = os.environ.get("PG_USER", "lisbotadmin")
    password = os.environ.get("PG_PASSWORD", "")
    ssl = os.environ.get("PG_SSL", "require")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}?sslmode={ssl}"


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(get_database_url(), pool_pre_ping=True, pool_size=5)
    return _engine


def get_session() -> Session:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine())
    return _SessionLocal()


@contextmanager
def safe_session():
    """Context manager that guarantees rollback on error and close on exit."""
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=get_engine())
    logger.info("Database tables initialized")


# ==================== Models ====================

class User(Base):
    __tablename__ = "users"
    id = Column(String(255), primary_key=True)
    email = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    avatar = Column(Text, default="")
    provider = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(String(255), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)
    title = Column(String(500), default="未命名會議")
    mode = Column(String(50), default="meeting")
    language = Column(String(20), default="zh-TW")
    template_id = Column(String(255), default="standard")
    start_time = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="recording")
    audio_url = Column(Text, nullable=True)
    transcription_job_id = Column(String(255), nullable=True)


class Transcript(Base):
    __tablename__ = "transcripts"
    id = Column(String(255), primary_key=True)
    meeting_id = Column(String(255), nullable=False, index=True)
    speaker = Column(String(100))
    text = Column(Text)
    offset = Column(Integer, default=0)
    duration = Column(Integer, default=0)
    confidence = Column(Float, default=0.95)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Summary(Base):
    __tablename__ = "summaries"
    id = Column(String(255), primary_key=True)
    meeting_id = Column(String(255), nullable=False, index=True)
    summary = Column(Text)
    action_items = Column(JSON, default=list)
    key_decisions = Column(JSON, default=list)
    next_meeting_topics = Column(JSON, default=list)
    template_id = Column(String(255), nullable=True)
    language = Column(String(20), nullable=True)
    generated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Terminology(Base):
    __tablename__ = "terminology"
    id = Column(String(255), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    terms = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Template(Base):
    __tablename__ = "templates"
    id = Column(String(255), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    icon = Column(String(10), default="📋")
    system_prompt_override = Column(Text, default="")
    is_built_in = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Share(Base):
    __tablename__ = "shares"
    id = Column(String(500), primary_key=True)
    meeting_id = Column(String(255), nullable=False, index=True)
    owner_id = Column(String(255), nullable=False)
    owner_name = Column(String(255), default="")
    member_email = Column(String(255), nullable=False, index=True)
    member_name = Column(String(255), default="")
    permission = Column(String(20), default="view")
    invite_message = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CalendarToken(Base):
    __tablename__ = "calendar_tokens"
    id = Column(String(500), primary_key=True)
    user_id = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=False)
    token_data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
