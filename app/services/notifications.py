"""Notification helpers triggered by key business events."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, User, UserRole


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    message: str,
    category: str = "GENERAL",
    dedupe_key: str | None = None,
) -> Notification:
    """Persist a notification for a user (flushed, not committed)."""
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        category=category,
        dedupe_key=dedupe_key,
    )
    db.add(notification)
    await db.flush()
    return notification


async def alert_already_sent(
    db: AsyncSession, *, user_id: int, dedupe_key: str
) -> bool:
    """True when an alert with the same idempotency key already exists."""
    return (
        await db.scalar(
            select(Notification.id).where(
                Notification.user_id == user_id,
                Notification.dedupe_key == dedupe_key,
            )
        )
        is not None
    )


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
        category="LEAVE",
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
        category="PAYROLL",
    )


async def notify_staff(
    db: AsyncSession,
    *,
    title: str,
    message: str,
    roles: Iterable[UserRole] = (UserRole.HR, UserRole.ADMIN),
    exclude_user_id: int | None = None,
    category: str = "GENERAL",
) -> int:
    """Fan a notification out to every active user with a staff role."""
    stmt = select(User.id).where(User.role.in_(list(roles)), User.is_active.is_(True))
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    recipient_ids = list((await db.scalars(stmt)).all())
    for user_id in recipient_ids:
        await create_notification(
            db,
            user_id=user_id,
            title=title,
            message=message,
            category=category,
        )
    return len(recipient_ids)


async def count_unread(db: AsyncSession, user_id: int) -> int:
    """Number of unread notifications for a user."""
    result = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    return int(result or 0)
