"""Leave-calendar overlap helpers (Module 15)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import Employee, Leave, LeaveStatus


async def overlapping_approved_leaves(
    db: AsyncSession,
    *,
    start_date: date,
    end_date: date,
    department: str | None = None,
    exclude_employee_id: int | None = None,
) -> list[Leave]:
    """Approved leave overlapping a date range, optionally by department."""
    stmt = (
        select(Leave)
        .options(selectinload(Leave.employee))
        .join(Employee, Employee.id == Leave.employee_id)
        .where(
            Leave.status == LeaveStatus.APPROVED,
            Leave.start_date <= end_date,
            Leave.end_date >= start_date,
        )
        .order_by(Leave.start_date, Employee.full_name)
    )
    if department:
        stmt = stmt.where(Employee.department.ilike(department.strip()))
    if exclude_employee_id is not None:
        stmt = stmt.where(Leave.employee_id != exclude_employee_id)
    return list((await db.scalars(stmt)).all())


def conflict_limit() -> int:
    """Configured maximum concurrent team leave (0 means unlimited)."""
    return settings.max_concurrent_department_leave


def is_conflict_allowed(conflict_count: int) -> bool:
    limit = conflict_limit()
    return limit == 0 or conflict_count < limit
