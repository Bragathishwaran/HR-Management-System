"""Module 3 — Attendance Management (check-in / check-out / history)."""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_employee_profile, require_staff
from app.models import Attendance, AttendanceStatus, Employee, User, UserRole
from app.schemas import AttendanceRead, CheckInOutResponse

router = APIRouter(
    prefix="/attendance",
    tags=["Attendance"],
    dependencies=[Depends(get_current_user)],
)

# Hours below this threshold on check-out count as a HALF_DAY.
HALF_DAY_THRESHOLD_HOURS = 4.0


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _today_utc() -> date_type:
    return datetime.now(timezone.utc).date()


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
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already checked in today.",
        )

    record = Attendance(
        employee_id=employee.id,
        check_in=_utc_now_naive(),
        date=today,
        status=AttendanceStatus.PRESENT,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return CheckInOutResponse(
        attendance=AttendanceRead.model_validate(record),
        message=f"Checked in at {record.check_in:%H:%M UTC}.",
    )


@router.post(
    "/check-out",
    response_model=CheckInOutResponse,
    summary="Record check-out and calculate working hours",
)
async def check_out(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
) -> CheckInOutResponse:
    today = _today_utc()
    record = await db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee.id, Attendance.date == today
        )
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must check in before checking out.",
        )
    if record.check_out is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already checked out today.",
        )

    check_out_time = _utc_now_naive()
    hours = (check_out_time - record.check_in).total_seconds() / 3600
    record.check_out = check_out_time
    record.working_hours = round(hours, 2)
    record.status = (
        AttendanceStatus.PRESENT if hours >= HALF_DAY_THRESHOLD_HOURS else AttendanceStatus.HALF_DAY
    )
    await db.commit()
    await db.refresh(record)
    return CheckInOutResponse(
        attendance=AttendanceRead.model_validate(record),
        message=f"Checked out after {record.working_hours} working hours.",
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
