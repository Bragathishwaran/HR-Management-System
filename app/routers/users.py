"""Module 13 — Admin user management (accounts, roles, activation)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin
from app.models import User, UserRole, utcnow
from app.schemas import UserAdminCreate, UserRead, UserUpdate
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["Users (Admin)"])


async def _get_user_or_404(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )
    return user


async def _ensure_unique(
    db: AsyncSession,
    *,
    username: str | None,
    email: str | None,
    exclude_id: int | None = None,
) -> None:
    """Reject duplicate usernames/emails, optionally excluding one user id."""
    conditions = []
    if username is not None:
        conditions.append(User.username == username)
    if email is not None:
        conditions.append(User.email == email)
    if not conditions:
        return
    stmt = select(User).where(or_(*conditions))
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    existing = await db.scalar(stmt)
    if existing is not None:
        field = "username" if username and existing.username == username else "email"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The {field} is already in use.",
        )


async def _active_admin_count(db: AsyncSession) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
    )
    return int(count or 0)


async def _guard_last_admin(db: AsyncSession, target: User) -> None:
    """Prevent removing/deactivating the final active administrator."""
    if target.role != UserRole.ADMIN or not target.is_active:
        return
    if await _active_admin_count(db) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one active ADMIN account must remain.",
        )


@router.get("/", response_model=list[UserRead], summary="List user accounts (Admin)")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    q: Optional[str] = Query(default=None, max_length=120),
    role: Optional[UserRole] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[User]:
    stmt: Select = select(User)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.username.ilike(pattern), User.email.ilike(pattern)))
    if role is not None:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    stmt = stmt.order_by(User.id).offset(skip).limit(limit)
    return list((await db.scalars(stmt)).all())


@router.post(
    "/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user account (Admin)",
)
async def create_user(
    payload: UserAdminCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> User:
    await _ensure_unique(
        db, username=payload.username, email=payload.email.lower()
    )
    user = User(
        username=payload.username,
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
        created_at=utcnow(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead, summary="View a user account (Admin)")
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> User:
    return await _get_user_or_404(db, user_id)


@router.patch("/{user_id}", response_model=UserRead, summary="Update user / role (Admin)")
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> User:
    user = await _get_user_or_404(db, user_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update.",
        )

    username = updates.get("username")
    email = updates.get("email")
    if email is not None:
        email = email.lower()
        updates["email"] = email
    await _ensure_unique(
        db, username=username, email=email, exclude_id=user.id
    )

    new_role = updates.get("role")
    new_active = updates.get("is_active")
    if user.id == current_user.id:
        if new_role is not None and new_role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot remove your own ADMIN role.",
            )
        if new_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own account.",
            )

    demoting = new_role is not None and new_role != UserRole.ADMIN
    deactivating = new_active is False
    if demoting or deactivating:
        await _guard_last_admin(db, user)

    password = updates.pop("password", None)
    if password is not None:
        user.hashed_password = hash_password(password)
    for field, value in updates.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user account (Admin)",
)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    user = await _get_user_or_404(db, user_id)
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )
    await _guard_last_admin(db, user)
    await db.delete(user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
