"""SQLAlchemy async database connection."""

import asyncio
import logging
import ssl
from collections.abc import AsyncGenerator
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _is_render_internal_postgres(host: str) -> bool:
    """Render internal DB hostnames look like dpg-xxxxx-a (no SSL required)."""
    return host.startswith("dpg-") and host.endswith("-a")


def _is_render_external_postgres(host: str) -> bool:
    return host.endswith(".render.com") and "postgres" in host


def _connect_args(database_url: str) -> dict:
    """Enable SSL for hosted Postgres (Supabase/Neon); skip for local/docker/Render internal."""
    parsed = urlparse(database_url.replace("+asyncpg", ""))
    host = (parsed.hostname or "").lower()
    port = parsed.port or 5432
    args: dict = {"timeout": 10, "command_timeout": 10}

    if host in {"localhost", "127.0.0.1", "postgres"}:
        return args
    if "sslmode=disable" in database_url.lower():
        args["ssl"] = False
        return args
    if _is_render_internal_postgres(host):
        args["ssl"] = False
        return args
    if _is_render_external_postgres(host):
        args["ssl"] = ssl.create_default_context()
        return args

    args["ssl"] = ssl.create_default_context()
    # Supabase pooler (port 6543) does not support prepared statements.
    if port == 6543 or "pooler.supabase.com" in host:
        args["statement_cache_size"] = 0
    return args


def _log_database_target(database_url: str) -> None:
    parsed = urlparse(database_url.replace("+asyncpg", ""))
    logger.info(
        "Database target host=%s database=%s",
        parsed.hostname or "(missing)",
        (parsed.path or "").lstrip("/") or "(missing)",
    )


settings = get_settings()
_log_database_target(settings.database_url)
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_timeout=15,
    connect_args=_connect_args(settings.database_url),
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create tables if they do not exist (dev convenience; use migrations in prod)."""
    async def _create() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    try:
        await asyncio.wait_for(_create(), timeout=10)
    except Exception:
        # Allow the API to start even if the database is temporarily unreachable.
        pass
