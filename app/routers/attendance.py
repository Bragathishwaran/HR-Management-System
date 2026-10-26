"""Module 3 + 10 — Attendance (check-in/out, late, overtime, absence sweep)."""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, get_employee_profile, require_staff
from app.models import (
    Attendance,
    AttendanceStatus,
    Employee,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    Shift,
    User,
    UserRole,
)
from app.schemas import AttendanceRead, AutoMarkAbsentResponse, CheckInOutResponse
from app.services.notifications import create_notification, notify_staff
from app.services.shifts import (
    calculate_early_exit_minutes,
    calculate_late_minutes,
    get_assigned_shift,
)

router = APIRouter(
    prefix="/attendance",
    tags=["Attendance"],
    dependencies=[Depends(get_current_user)],
)


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _today_utc() -> date_type:
    return datetime.now(timezone.utc).date()


def _overtime_hours(working_hours: float) -> float:
    """Hours worked beyond the standard work day (0 when none)."""
    return round(max(0.0, working_hours - settings.standard_work_hours), 2)


@router.post(
    "/check-in",
    response_model=CheckInOutResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record check-in for the current employee",
)
async def check_in(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
) -> CheckInOutResponse:
    today = _today_utc()
    existing = await db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee.id, Attendance.date == today
        )
    )
    if existing is not None and existing.check_in is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already checked in today.",
        )

    now = _utc_now_naive()
    shift = await get_assigned_shift(db, employee.id)
    late_minutes = calculate_late_minutes(shift, now)
    if existing is not None:
        # Convert a previously auto-marked ABSENT row into the real check-in.
        record = existing
        record.check_in = now
        record.check_out = None
        record.status = AttendanceStatus.PRESENT
    else:
        record = Attendance(
            employee_id=employee.id,
            check_in=now,
            date=today,
            status=AttendanceStatus.PRESENT,
        )
        db.add(record)
    record.shift_id = shift.id if shift is not None else None
    record.is_late = late_minutes > 0
    record.late_minutes = late_minutes
    record.is_early_exit = False
    record.early_exit_minutes = None
    record.overtime_hours = None

    if late_minutes > 0:
        shift_label = shift.name.value.lower() if shift is not None else "scheduled"
        await notify_staff(
            db,
            title="Late check-in",
            message=(
                f"{employee.full_name} checked in {late_minutes} minute(s) late "
                f"for the {shift_label} shift at {now:%H:%M} UTC on {today}."
            ),
            exclude_user_id=employee.user_id,
            category="ATTENDANCE",
        )

    await db.commit()
    await db.refresh(record)
    detail = (
        f"Checked in at {record.check_in:%H:%M UTC} — late by {late_minutes} min."
        if late_minutes
        else f"Checked in at {record.check_in:%H:%M UTC} — on time."
    )
    return CheckInOutResponse(
        attendance=AttendanceRead.model_validate(record), message=detail
    )


@router.post(
    "/check-out",
    response_model=CheckInOutResponse,
    summary="Record check-out and calculate working/overtime hours",
)
async def check_out(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
) -> CheckInOutResponse:
    record = await db.scalar(
        select(Attendance)
        .where(
            Attendance.employee_id == employee.id,
            Attendance.check_in.is_not(None),
            Attendance.check_out.is_(None),
        )
        .order_by(Attendance.check_in.desc())
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must check in before checking out.",
        )

    check_out_time = _utc_now_naive()
    hours = (check_out_time - record.check_in).total_seconds() / 3600
    shift = (
        await db.get(Shift, record.shift_id)
        if record.shift_id is not None
        else await get_assigned_shift(db, employee.id)
    )
    if shift is not None:
        record.shift_id = shift.id
    early_minutes = calculate_early_exit_minutes(shift, record.date, check_out_time)

    record.check_out = check_out_time
    record.working_hours = round(hours, 2)
    record.overtime_hours = _overtime_hours(hours)
    record.is_early_exit = early_minutes > 0
    record.early_exit_minutes = early_minutes or None
    record.status = (
        AttendanceStatus.PRESENT
        if hours >= settings.half_day_threshold_hours
        else AttendanceStatus.HALF_DAY
    )

    if early_minutes > 0:
        await notify_staff(
            db,
            title="Early departure",
            message=(
                f"{employee.full_name} checked out {early_minutes} minute(s) early "
                f"at {check_out_time:%H:%M} UTC on {record.date}."
            ),
            exclude_user_id=employee.user_id,
            category="ATTENDANCE",
        )

    await db.commit()
    await db.refresh(record)
    return CheckInOutResponse(
        attendance=AttendanceRead.model_validate(record),
        message=f"Checked out after {record.working_hours} working hours.",
    )


@router.get(
    "/today",
    response_model=Optional[AttendanceRead],
    summary="Current employee's attendance for today",
)
async def today_attendance(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
) -> Attendance | None:
    return await db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee.id, Attendance.date == _today_utc()
        )
    )


@router.post(
    "/auto-mark-absent",
    response_model=AutoMarkAbsentResponse,
    summary="Auto-mark active employees absent for a day (HR/Admin)",
)
async def auto_mark_absent(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
    target_date: Optional[date_type] = Query(
        default=None,
        alias="date",
        description="Day to sweep (defaults to today; future dates are rejected)",
    ),
) -> AutoMarkAbsentResponse:
    day = target_date or _today_utc()
    if day > _today_utc():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark attendance for a future date.",
        )

    active_employees = list(
        (
            await db.scalars(
                select(Employee).where(Employee.status == EmployeeStatus.ACTIVE)
            )
        ).all()
    )
    active_ids = [employee.id for employee in active_employees]
    employee_map = {employee.id: employee for employee in active_employees}
    marked_ids = set(
        (
            await db.scalars(
                select(Attendance.employee_id).where(Attendance.date == day)
            )
        ).all()
    )
    on_leave_ids = set(
        (
            await db.scalars(
                select(Leave.employee_id).where(
                    Leave.status == LeaveStatus.APPROVED,
                    Leave.start_date <= day,
                    Leave.end_date >= day,
                )
            )
        ).all()
    )

    created_ids: list[int] = []
    skipped_on_leave = 0
    for employee_id in active_ids:
        if employee_id in marked_ids:
            continue
        if employee_id in on_leave_ids:
            skipped_on_leave += 1
            continue
        db.add(
            Attendance(
                employee_id=employee_id,
                date=day,
                status=AttendanceStatus.ABSENT,
                is_late=False,
                late_minutes=None,
                overtime_hours=None,
            )
        )
        created_ids.append(employee_id)
        absent_employee = employee_map[employee_id]
        await create_notification(
            db,
            user_id=absent_employee.user_id,
            title="Attendance marked absent",
            message=(
                f"You have been marked absent for {day}. "
                "Contact HR if you were on approved leave or worked remotely."
            ),
        )

    await db.commit()
    return AutoMarkAbsentResponse(
        date=day,
        created=len(created_ids),
        skipped_existing=len(marked_ids),
        skipped_on_leave=skipped_on_leave,
        employee_ids=created_ids,
    )


@router.get(
    "/history",
    response_model=list[AttendanceRead],
    summary="Attendance history (own for employees, all for HR/Admin)",
)
async def attendance_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    employee_id: Optional[int] = Query(
        default=None,
        gt=0,
        description="Filter by employee (HR/Admin only; ignored for regular employees)",
    ),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Attendance]:
    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)

    stmt: Select = select(Attendance)
    if is_staff:
        if employee_id is not None:
            stmt = stmt.where(Attendance.employee_id == employee_id)
    else:
        own = await db.scalar(
            select(Employee).where(Employee.user_id == current_user.id)
        )
        if own is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee profile is linked to this account.",
            )
        stmt = stmt.where(Attendance.employee_id == own.id)

    if start_date is not None:
        stmt = stmt.where(Attendance.date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Attendance.date <= end_date)

    stmt = stmt.order_by(Attendance.date.desc()).offset(skip).limit(limit)
    return list((await db.scalars(stmt)).all())
