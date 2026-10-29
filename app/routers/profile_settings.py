"""Module 27 — Profile & Settings Management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Employee, User
from app.schemas import ChangePasswordRequest, Message, NotificationPreferences, NotificationPreferencesRead, ProfileUpdate
from app.security import hash_password, verify_password

router = APIRouter(
    prefix="/profile",
    tags=["Profile"],
    dependencies=[Depends(get_current_user)],
)

# In-memory preferences store (can be moved to DB table later)
_preferences_store: dict[int, NotificationPreferences] = {}


@router.get("/me")
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = await db.scalar(
        select(Employee).options(selectinload(Employee.user)).where(Employee.user_id == current_user.id)
    )
    if emp is None:
        return {
            "user": {"id": current_user.id, "username": current_user.username, "email": current_user.email, "role": current_user.role.value},
            "employee": None,
        }
    return {
        "user": {"id": current_user.id, "username": current_user.username, "email": current_user.email, "role": current_user.role.value},
        "employee": {
            "id": emp.id,
            "full_name": emp.full_name,
            "designation": emp.designation,
            "department": emp.department,
            "joining_date": emp.joining_date,
            "status": emp.status.value,
        },
    }


@router.put("/me")
async def update_my_profile(
    payload: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(emp, field, value)
    await db.commit()
    await db.refresh(emp)
    return {"detail": "Profile updated successfully", "employee": {"id": emp.id, "full_name": emp.full_name, "designation": emp.designation, "department": emp.department}}


@router.put("/change-password", response_model=Message)
async def change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    db.add(current_user)
    await db.commit()
    return Message(detail="Password changed successfully")


@router.get("/preferences", response_model=NotificationPreferencesRead)
async def get_preferences(current_user: User = Depends(get_current_user)):
    prefs = _preferences_store.get(current_user.id) or NotificationPreferences()
    return NotificationPreferencesRead(user_id=current_user.id, **prefs.model_dump())


@router.put("/preferences", response_model=NotificationPreferencesRead)
async def update_preferences(
    payload: NotificationPreferences,
    current_user: User = Depends(get_current_user),
):
    _preferences_store[current_user.id] = payload
    return NotificationPreferencesRead(user_id=current_user.id, **payload.model_dump())
