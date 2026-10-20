"""Shared FastAPI dependencies: auth, role guards and profile resolution."""

from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Employee, User, UserRole
from app.security import TokenError, decode_token

# HTTPBearer implements the "HTTPBearer" security scheme (OpenAPI "Authorize" button).
bearer_scheme = HTTPBearer(auto_error=False, scheme_name="JWT")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the bearer JWT."""
    if credentials is None:
        raise _unauthorized("Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
    except TokenError as exc:
        raise _unauthorized(str(exc)) from exc

    user = await db.get(User, int(payload["sub"]))
    if user is None:
        raise _unauthorized("User account no longer exists")
    return user


def require_role(roles: list[UserRole]) -> Callable[..., User]:
    """Factory producing a dependency that enforces one of the given roles."""

    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            allowed = ", ".join(role.value for role in roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of the roles: {allowed}",
            )
        return current_user

    return role_checker


# Ready-made guards used across routers
require_staff = require_role([UserRole.HR, UserRole.ADMIN])
require_admin = require_role([UserRole.ADMIN])


async def get_employee_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Employee:
    """Resolve the employee profile linked to the current user (if any)."""
    employee = await db.scalar(
        select(Employee).where(Employee.user_id == current_user.id)
    )
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee profile is linked to this account.",
        )
    return employee
