"""Module 7 — Notifications System (list + mark as read)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Notification, User
from app.schemas import (
    NotificationListResponse,
    NotificationRead,
    NotificationReadAllResponse,
)
from app.services.notifications import count_unread

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "/",
    response_model=NotificationListResponse,
    summary="Fetch notifications for the current user",
)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    unread_only: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> NotificationListResponse:
    base = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        base = base.where(Notification.is_read.is_(False))

    total = int(
        await db.scalar(
            select(func.count()).select_from(base.subquery())
        )
        or 0
    )
    unread = await count_unread(db, current_user.id)

    rows = await db.scalars(
        base.order_by(Notification.is_read, Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return NotificationListResponse(
        total=total,
        unread=unread,
        items=[NotificationRead.model_validate(row) for row in rows],
    )


@router.patch(
    "/read-all",
    response_model=NotificationReadAllResponse,
    summary="Mark every notification as read",
)
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationReadAllResponse:
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
    return NotificationReadAllResponse(updated=int(result.rowcount or 0))


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationRead,
    summary="Mark a notification as read",
)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Notification:
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != current_user.id:
        # 404 for both missing and foreign notifications — no data leakage.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification {notification_id} not found",
        )
    if not notification.is_read:
        notification.is_read = True
        await db.commit()
        await db.refresh(notification)
    return notification
