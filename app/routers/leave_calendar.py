"""Module 15 — leave calendar, team availability and conflict checks."""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Attendance,
    Employee,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    User,
    UserRole,
)
from app.schemas import (
    LeaveCalendarEntry,
    LeaveConflictEntry,
    LeaveConflictResponse,
    ShiftRead,
    TeamAvailability,
    TeamMemberRead,
)
from app.services.leave_calendar import (
    conflict_limit,
    is_conflict_allowed,
    overlapping_approved_leaves,
)
from app.services.shifts import shift_map, today_utc

router = APIRouter(
    prefix="/leave-calendar",
    tags=["Leave Calendar"],
    dependencies=[Depends(get_current_user)],
)


def _month_bounds(month: Optional[str]) -> tuple[date_type, date_type]:
    """Resolve ``YYYY-MM`` to inclusive first/last dates (defaults to now)."""
    if not month:
        today = today_utc()
        start = today.replace(day=1)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        return start, next_month - timedelta(days=1)
    try:
        year, month_number = (int(part) for part in month.split("-", 1))
        start = date_type(year, month_number, 1)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='month must use the YYYY-MM format (e.g. "2026-11").',
        ) from exc
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, next_month - timedelta(days=1)


async def _own_employee(db: AsyncSession, user: User) -> Employee:
    employee = await db.scalar(select(Employee).where(Employee.user_id == user.id))
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee profile is linked to this account.",
        )
    return employee


def _calendar_entry(leave: Leave, *, own_employee_id: int | None) -> LeaveCalendarEntry:
    return LeaveCalendarEntry(
        id=leave.id,
        employee_id=leave.employee_id,
        employee_name=leave.employee.full_name,
        department=leave.employee.department,
        leave_type=leave.leave_type,
        start_date=leave.start_date,
        end_date=leave.end_date,
        status=leave.status,
        is_own=own_employee_id is not None and leave.employee_id == own_employee_id,
    )


@router.get(
    "/",
    response_model=list[LeaveCalendarEntry],
    summary="Leave calendar events (team-scoped for employees)",
)
async def leave_calendar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    month: Optional[str] = Query(default=None, description='YYYY-MM, e.g. "2026-11"'),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    department: Optional[str] = Query(default=None, max_length=120),
    status_filter: Optional[LeaveStatus] = Query(default=None, alias="status"),
) -> list[LeaveCalendarEntry]:
    if start_date is None or end_date is None:
        month_start, month_end = _month_bounds(month)
        start_date = start_date or month_start
        end_date = end_date or month_end
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date.",
        )
    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date range cannot exceed 366 days.",
        )

    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)
    own = None if is_staff else await _own_employee(db, current_user)
    scoped_department = department.strip() if department else None
    if own is not None:
        # Employees only see their own department's approved leave, plus their
        # own pending requests so they can track them on the calendar.
        scoped_department = own.department

    stmt = (
        select(Leave)
        .options(selectinload(Leave.employee))
        .join(Employee, Employee.id == Leave.employee_id)
        .where(
            Leave.start_date <= end_date,
            Leave.end_date >= start_date,
        )
        .order_by(Leave.start_date, Employee.full_name)
    )
    if scoped_department:
        stmt = stmt.where(Employee.department.ilike(scoped_department))
    if status_filter is not None:
        stmt = stmt.where(Leave.status == status_filter)
    elif own is not None:
        stmt = stmt.where(
            or_(
                Leave.status == LeaveStatus.APPROVED,
                Leave.employee_id == own.id,
            )
        )
    else:
        stmt = stmt.where(Leave.status.in_([LeaveStatus.APPROVED, LeaveStatus.PENDING]))

    leaves = list((await db.scalars(stmt)).all())
    return [
        _calendar_entry(leave, own_employee_id=own.id if own is not None else None)
        for leave in leaves
    ]


@router.get(
    "/team",
    response_model=TeamAvailability,
    summary="Team availability for a day (who is in and who is on leave)",
)
async def team_availability(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    day: Optional[date_type] = Query(default=None, alias="date"),
    department: Optional[str] = Query(default=None, max_length=120),
) -> TeamAvailability:
    target = day or today_utc()
    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)
    own = None if is_staff else await _own_employee(db, current_user)
    scoped_department = department.strip() if department else None
    if own is not None:
        scoped_department = own.department

    employee_stmt = select(Employee).where(Employee.status == EmployeeStatus.ACTIVE)
    if scoped_department:
        employee_stmt = employee_stmt.where(
            Employee.department.ilike(scoped_department)
        )
    employees = list(
        (await db.scalars(employee_stmt.order_by(Employee.full_name))).all()
    )
    employee_ids = {employee.id for employee in employees}

    leaves = [
        leave
        for leave in await overlapping_approved_leaves(
            db,
            start_date=target,
            end_date=target,
            department=scoped_department,
        )
        if leave.employee_id in employee_ids
    ]
    on_leave_ids = {leave.employee_id for leave in leaves}

    shifts = await shift_map(db)
    attendance_by_employee = {
        record.employee_id: record
        for record in (
            await db.scalars(select(Attendance).where(Attendance.date == target))
        ).all()
    }

    available: list[TeamMemberRead] = []
    for employee in employees:
        if employee.id in on_leave_ids:
            continue
        shift = shifts.get(employee.id)
        record = attendance_by_employee.get(employee.id)
        available.append(
            TeamMemberRead(
                employee_id=employee.id,
                full_name=employee.full_name,
                designation=employee.designation,
                department=employee.department,
                shift=ShiftRead.model_validate(shift) if shift is not None else None,
                today_attendance=record.status if record is not None else None,
            )
        )

    return TeamAvailability(
        date=target,
        department=scoped_department,
        total_employees=len(employees),
        available=available,
        on_leave=[
            _calendar_entry(leave, own_employee_id=own.id if own is not None else None)
            for leave in leaves
        ],
    )


@router.get(
    "/conflicts",
    response_model=LeaveConflictResponse,
    summary="Check overlapping approved leave for a team/date range",
)
async def check_leave_conflicts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start_date: date_type = Query(...),
    end_date: date_type = Query(...),
    department: Optional[str] = Query(default=None, max_length=120),
    exclude_employee_id: Optional[int] = Query(default=None, gt=0),
) -> LeaveConflictResponse:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date.",
        )
    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)
    own = None if is_staff else await _own_employee(db, current_user)
    scoped_department = department.strip() if department else None
    if own is not None:
        scoped_department = own.department

    conflicts = await overlapping_approved_leaves(
        db,
        start_date=start_date,
        end_date=end_date,
        department=scoped_department,
        exclude_employee_id=exclude_employee_id,
    )
    limit = conflict_limit()
    return LeaveConflictResponse(
        start_date=start_date,
        end_date=end_date,
        department=scoped_department,
        max_concurrent=limit,
        allowed=is_conflict_allowed(len(conflicts)),
        conflict_count=len(conflicts),
        conflicts=[
            LeaveConflictEntry(
                id=leave.id,
                employee_id=leave.employee_id,
                employee_name=leave.employee.full_name,
                department=leave.employee.department,
                leave_type=leave.leave_type,
                start_date=leave.start_date,
                end_date=leave.end_date,
                status=leave.status,
            )
            for leave in conflicts
        ],
    )
