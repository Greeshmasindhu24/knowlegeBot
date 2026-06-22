"""Create local PostgreSQL database and tables for the FastAPI backend."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import asyncpg

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "backend" / "database" / "schema.sql"

# Matches .env.local after setup (postgres superuser from install)
ADMIN_DSN = "postgresql://postgres:2003@localhost:5432/postgres"
APP_DB = "ekb"


async def ensure_database() -> None:
    conn = await asyncpg.connect(ADMIN_DSN)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", APP_DB)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{APP_DB}"')
            print(f"Created database: {APP_DB}")
        else:
            print(f"Database already exists: {APP_DB}")
    finally:
        await conn.close()


async def apply_schema() -> None:
    if not SCHEMA.is_file():
        raise FileNotFoundError(f"Schema file not found: {SCHEMA}")

    sql = SCHEMA.read_text(encoding="utf-8")
    conn = await asyncpg.connect(
        f"postgresql://postgres:2003@localhost:5432/{APP_DB}"
    )
    try:
        await conn.execute(sql)
        print("Applied backend schema successfully.")
    finally:
        await conn.close()


async def main() -> None:
    try:
        await ensure_database()
        await apply_schema()
    except asyncpg.InvalidPasswordError:
        print(
            "ERROR: PostgreSQL rejected password for user 'postgres'.\n"
            "Update ADMIN_DSN in scripts/setup-local-db.py if your install password is not 2003.",
            file=sys.stderr,
        )
        sys.exit(1)
    except OSError as exc:
        print(
            f"ERROR: Cannot connect to PostgreSQL on localhost:5432.\n{exc}\n"
            "Start the PostgreSQL Windows service, then run this script again.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
