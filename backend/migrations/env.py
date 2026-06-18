"""Alembic migration environment — synchronous engine.

Uses the synchronous (psycopg2) engine so migrations can run safely from inside
FastAPI's lifespan startup (which is already in a running event loop — an async
engine + asyncio.run() would raise "cannot be called from a running event loop").
SYNC_DATABASE_URL carries ?sslmode=require for Azure PostgreSQL.
"""

import logging
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from shared.database import Base, SYNC_DATABASE_URL

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")
target_metadata = Base.metadata


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    """Generate SQL script without a live DB connection."""
    context.configure(
        url=SYNC_DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply migrations against a live DB using the sync engine."""
    engine = create_engine(SYNC_DATABASE_URL)
    with engine.connect() as connection:
        do_run_migrations(connection)
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
