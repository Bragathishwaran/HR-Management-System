"""Module 14 — automated attendance & shift management."""

from __future__ import annotations

from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import (
    Attendance,
    Employee,
    EmployeeShift,
    Leave,
    LeaveStatus,
    Shift,
    User,
    UserRole,
    utcnow,
)
from app.schemas import (
    AutoAttendanceResponse,
    EmployeeShiftRead,
    ShiftAssign,
    ShiftCreate,
    ShiftRead,
    ShiftScheduleEntry,
)
from app.services.notifications import create_notification
from app.services.shifts import auto_process_attendance, shift_map, today_utc

router = APIRouter(
    prefix="/shifts",
    tags=["Shifts"],
    dependencies=[Depends(get_current_user)],
)


def _assignment_read(assignment: EmployeeShift) -> EmployeeShiftRead:
    return EmployeeShiftRead(
        id=assignment.id,
        employee_id=assignment.employee_id,
        shift_id=assignment.shift_id,
        assigned_at=assignment.assigned_at,
        employee_name=assignment.employee.full_name,
        department=assignment.employee.department,
        shift=ShiftRead.model_validate(assignment.shift),
    )


async def _load_assignment(
    db: AsyncSession, employee_id: int
) -> EmployeeShift | None:
    return await db.scalar(
        select(EmployeeShift)
        .options(
            selectinload(EmployeeShift.employee),
            selectinload(EmployeeShift.shift),
        )
        .where(EmployeeShift.employee_id == employee_id)
    )


@router.get(
    "/",
    response_model=list[ShiftRead],
    summary="List shift definitions",
)
async def list_shifts(db: AsyncSession = Depends(get_db)) -> list[Shift]:
    return list((await db.scalars(select(Shift).order_by(Shift.start_time))).all())


@router.post(
    "/",
    response_model=ShiftRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a shift definition (HR/Admin)",
)
async def create_shift(
    payload: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Shift:
    duplicate = await db.scalar(select(Shift).where(Shift.name == payload.name))
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {payload.name.value.lower()} shift already exists.",
        )
    shift = Shift(
        name=payload.name,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return shift


@router.post(
    "/assign",
    response_model=EmployeeShiftRead,
    summary="Assign (or change) an employee's shift (HR/Admin)",
)
async def assign_shift(
    payload: ShiftAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> EmployeeShiftRead:
    employee = await db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {payload.employee_id} not found",
        )
    shift = await db.get(Shift, payload.shift_id)
    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift {payload.shift_id} not found",
        )

    assignment = await _load_assignment(db, employee.id)
    if assignment is None:
        assignment = EmployeeShift(
            employee_id=employee.id,
            shift_id=shift.id,
            assigned_at=utcnow(),
        )
        db.add(assignment)
    else:
        assignment.shift_id = shift.id
        assignment.assigned_at = utcnow()

    await create_notification(
        db,
        user_id=employee.user_id,
        title="Shift assignment updated",
        message=(
            f"You are now assigned to the {shift.name.value.lower()} shift "
            f"({shift.start_time:%H:%M}–{shift.end_time:%H:%M} UTC)."
        ),
        category="SHIFT",
    )
    await db.commit()
    assignment = await _load_assignment(db, employee.id)
    assert assignment is not None
    return _assignment_read(assignment)


@router.delete(
    "/assignments/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove an employee's shift assignment (HR/Admin)",
)
async def remove_assignment(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Response:
    assignment = await _load_assignment(db, employee_id)
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No shift assignment for employee {employee_id}",
        )
    await db.delete(assignment)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/assignments",
    response_model=list[EmployeeShiftRead],
    summary="Shift assignments (own for employees, all for HR/Admin)",
)
async def list_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    department: Optional[str] = Query(default=None, max_length=120),
) -> list[EmployeeShiftRead]:
    stmt = select(EmployeeShift).options(
        selectinload(EmployeeShift.employee),
        selectinload(EmployeeShift.shift),
    )
    if current_user.role not in (UserRole.HR, UserRole.ADMIN):
        own = await db.scalar(
            select(Employee).where(Employee.user_id == current_user.id)
        )
        if own is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee profile is linked to this account.",
            )
        stmt = stmt.where(EmployeeShift.employee_id == own.id)
    elif department:
        stmt = stmt.join(Employee).where(
            Employee.department.ilike(department.strip())
        )

    assignments = (
        await db.scalars(stmt.order_by(EmployeeShift.employee_id))
    ).all()
    return [_assignment_read(assignment) for assignment in assignments]


@router.get(
    "/me",
    response_model=Optional[EmployeeShiftRead],
    summary="Current employee's shift assignment",
)
async def my_shift(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Optional[EmployeeShiftRead]:
    own = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
    if own is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee profile is linked to this account.",
        )
    assignment = await _load_assignment(db, own.id)
    return _assignment_read(assignment) if assignment is not None else None


@router.get(
    "/schedule",
    response_model=list[ShiftScheduleEntry],
    summary="Daily shift schedule with attendance status",
)
async def shift_schedule(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    day: Optional[date_type] = Query(default=None, alias="date"),
    department: Optional[str] = Query(default=None, max_length=120),
) -> list[ShiftScheduleEntry]:
    target = day or today_utc()
    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)

    employee_stmt = select(Employee)
    if not is_staff:
        employee_stmt = employee_stmt.where(Employee.user_id == current_user.id)
    if department:
        employee_stmt = employee_stmt.where(
            Employee.department.ilike(department.strip())
        )
    employees = list((await db.scalars(employee_stmt.order_by(Employee.full_name))).all())
    if not is_staff and not employees:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee profile is linked to this account.",
        )

    shifts = await shift_map(db)
    attendance_by_employee = {
        record.employee_id: record
        for record in (
            await db.scalars(select(Attendance).where(Attendance.date == target))
        ).all()
    }
    leaving_ids = set(
        (
            await db.scalars(
                select(Leave.employee_id).where(
                    Leave.status == LeaveStatus.APPROVED,
                    Leave.start_date <= target,
                    Leave.end_date >= target,
                )
            )
        ).all()
    )

    entries: list[ShiftScheduleEntry] = []
    for employee in employees:
        record = attendance_by_employee.get(employee.id)
        shift = shifts.get(employee.id)
        entry_status = record.status if record is not None else None
        if employee.id in leaving_ids:
            entry_status = None
        entries.append(
            ShiftScheduleEntry(
                employee_id=employee.id,
                employee_name=employee.full_name,
                department=employee.department,
                designation=employee.designation,
                shift=ShiftRead.model_validate(shift) if shift is not None else None,
                attendance_status=entry_status,
                check_in=record.check_in if record is not None else None,
                check_out=record.check_out if record is not None else None,
                is_late=record.is_late if record is not None else False,
                late_minutes=record.late_minutes if record is not None else None,
                is_early_exit=record.is_early_exit if record is not None else False,
                early_exit_minutes=(
                    record.early_exit_minutes if record is not None else None
                ),
            )
        )
    return entries


@router.post(
    "/auto-process",
    response_model=AutoAttendanceResponse,
    summary="Run shift-aware attendance automation for a day (HR/Admin)",
)
async def run_auto_attendance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
    day: Optional[date_type] = Query(default=None, alias="date"),
) -> AutoAttendanceResponse:
    target = day or today_utc()
    if target > today_utc():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot process attendance for a future date.",
        )
    result = await auto_process_attendance(db, target, notify=True)
    await db.commit()
    return AutoAttendanceResponse(**result)
