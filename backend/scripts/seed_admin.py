"""Optional admin seed script — run after database is up."""

import asyncio

from sqlalchemy import select

from auth.passwords import hash_password
from database.connection import AsyncSessionLocal
from models.db import User


async def seed_admin() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == "admin@enterprise.local"))
        if result.scalar_one_or_none():
            print("Admin user already exists")
            return

        admin = User(
            email="admin@enterprise.local",
            password_hash=hash_password("admin123"),
            full_name="System Admin",
            role="admin",
            department="General",
        )
        session.add(admin)
        await session.commit()
        print("Created admin@enterprise.local / admin123 (change password in production)")


if __name__ == "__main__":
    asyncio.run(seed_admin())
