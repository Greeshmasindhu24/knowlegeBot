"""Audit log endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.rbac import Role, require_permission
from database.connection import get_db
from models.db import AuditLog, User
from models.schemas import AuditLogEntry, AuditLogListResponse

router = APIRouter(tags=["audit"])


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    user: Annotated[User, Depends(require_permission("audit:read"))],
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
) -> AuditLogListResponse:
    query = select(AuditLog).order_by(AuditLog.created_at.desc())

    # Reviewers/admins see all; employees would use a separate endpoint in Phase 2
    if user.role == Role.EMPLOYEE.value:
        query = query.where(AuditLog.user_id == user.id)

    if action:
        query = query.where(AuditLog.action == action)

    result = await db.execute(query)
    all_logs = result.scalars().all()
    total = len(all_logs)
    logs = all_logs[offset : offset + limit]

    return AuditLogListResponse(
        logs=[AuditLogEntry.model_validate(log) for log in logs],
        total=total,
    )
