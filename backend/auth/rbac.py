"""Role-based access control."""

from enum import Enum
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.jwt import decode_access_token
from database.connection import get_db
from models.db import User

security = HTTPBearer(auto_error=False)


class Role(str, Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"
    REVIEWER = "reviewer"


ROLE_HIERARCHY = {
    Role.EMPLOYEE: 1,
    Role.REVIEWER: 2,
    Role.ADMIN: 3,
}


PERMISSIONS: dict[str, set[Role]] = {
    "chat": {Role.EMPLOYEE, Role.REVIEWER, Role.ADMIN},
    "upload": {Role.EMPLOYEE, Role.REVIEWER, Role.ADMIN},
    "reindex": {Role.REVIEWER, Role.ADMIN},
    "documents:read": {Role.EMPLOYEE, Role.REVIEWER, Role.ADMIN},
    "audit:read": {Role.REVIEWER, Role.ADMIN},
    "audit:read_own": {Role.EMPLOYEE, Role.REVIEWER, Role.ADMIN},
}


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    result = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_permission(permission: str):
    allowed_roles = PERMISSIONS.get(permission, set())

    async def _checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        try:
            user_role = Role(user.role)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid role")

        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission}",
            )
        return user

    return _checker


def can_access_department(user: User, document_department: str) -> bool:
    if user.role in (Role.ADMIN.value, Role.REVIEWER.value):
        return True
    if document_department in ("General", user.department, None):
        return True
    return False
