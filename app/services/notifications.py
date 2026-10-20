"""Notification helpers triggered by key business events."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    message: str,
) -> Notification:
    """Persist a notification for a user (flushed, not committed)."""
    notification = Notification(user_id=user_id, title=title, message=message)
    db.add(notification)
    await db.flush()
    return notification


async def notify_leave_status(
    db: AsyncSession,
    *,
    user_id: int,
    leave_type: str,
    start_date: str,
    end_date: str,
    status: str,
    decided_by: str,
) -> Notification:
    """Notify an employee that their leave request was approved/rejected."""
    return await create_notification(
        db,
        user_id=user_id,
        title=f"Leave request {status.lower()}",
        message=(
            f"Your {leave_type} leave from {start_date} to {end_date} was {status.lower()} "
            f"by {decided_by}."
        ),
    )


async def notify_payroll_generated(
    db: AsyncSession,
    *,
    user_id: int,
    employee_name: str,
    month: str,
    net_salary: float,
) -> Notification:
    """Notify an employee that their payroll slip was generated."""
    return await create_notification(
        db,
        user_id=user_id,
        title="Payroll generated",
        message=(
            f"Salary slip for {employee_name} for {month} has been generated. "
            f"Net pay: {net_salary:,.2f}."
        ),
    )


async def count_unread(db: AsyncSession, user_id: int) -> int:
    """Number of unread notifications for a user."""
    result = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    return int(result or 0)
