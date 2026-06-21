"""Audit logging service — writes to PostgreSQL."""

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from models.db import AuditLog


async def write_audit_log(
    db: AsyncSession,
    *,
    user_id: UUID | None,
    action: str,
    details: dict[str, Any] | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        details=details or {},
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
    )
    db.add(entry)
    await db.flush()
    return entry
