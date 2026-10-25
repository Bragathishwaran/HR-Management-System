"""Async SQLAlchemy engine, session factory and FastAPI dependency."""

from collections.abc import AsyncIterator

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    """Declarative base shared by all ORM models."""


engine = create_async_engine(
    settings.database_url,
    echo=False,
    # SQLite ignores pooling args but keeps other drivers (Postgres) happy.
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields a request-scoped async session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# Columns introduced after the initial schema. ``create_all`` only creates new
# tables, so existing SQLite databases need an idempotent ADD COLUMN pass.
_SQLITE_COLUMN_MIGRATIONS: dict[str, dict[str, str]] = {
    "users": {
        "is_active": "BOOLEAN NOT NULL DEFAULT 1",
    },
    "attendance": {
        "is_late": "BOOLEAN NOT NULL DEFAULT 0",
        "late_minutes": "INTEGER",
        "overtime_hours": "FLOAT",
    },
    "payroll": {
        "allowances": "FLOAT NOT NULL DEFAULT 0",
    },
}


def _migrate_sqlite_schema(conn: Connection) -> None:
    """Add Phase 2 columns to pre-existing SQLite tables (safe to re-run)."""
    inspector = inspect(conn)
    table_names = set(inspector.get_table_names())
    for table, columns in _SQLITE_COLUMN_MIGRATIONS.items():
        if table not in table_names:
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        for name, ddl in columns.items():
            if name not in existing:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {ddl}'))


async def init_db() -> None:
    """Create all tables and apply lightweight, idempotent schema upgrades."""
    # Import models so they are registered on Base.metadata before create_all.
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if conn.dialect.name == "sqlite":
            await conn.run_sync(_migrate_sqlite_schema)
