"""Module 9 — Employee Self-Service Portal (profile, attendance, leave, pay)."""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_employee_profile
from app.models import Attendance, Employee, Leave, LeaveBalance, LeaveStatus, Payroll, User
from app.schemas import (
    AttendanceRead,
    EmployeeRead,
    LeaveBalanceRead,
    LeaveRead,
    PayrollRead,
    SelfServiceDashboard,
)
from app.services.leave_balances import ensure_employee_balances, get_policy_map
from app.services.notifications import count_unread

router = APIRouter(
    prefix="/me",
    tags=["Employee Self-Service"],
    dependencies=[Depends(get_current_user)],
)


def _profile(employee: Employee) -> EmployeeRead:
    """Own profile includes personal salary details (never exposed to peers)."""
    data = EmployeeRead.model_validate(employee).model_dump()
    data["salary"] = employee.salary
    if employee.user is not None:
        data["username"] = employee.user.username
        data["email"] = employee.user.email
    return EmployeeRead(**data)


@router.get("/profile", response_model=EmployeeRead, summary="My personal details")
async def my_profile(
    employee: Employee = Depends(get_employee_profile),
) -> EmployeeRead:
    return _profile(employee)


@router.get(
    "/attendance",
    response_model=list[AttendanceRead],
    summary="My attendance history",
)
async def my_attendance(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Attendance]:
    stmt = select(Attendance).where(Attendance.employee_id == employee.id)
    if start_date is not None:
        stmt = stmt.where(Attendance.date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Attendance.date <= end_date)
    stmt = stmt.order_by(Attendance.date.desc()).offset(skip).limit(limit)
    return list((await db.scalars(stmt)).all())


@router.get("/leaves", response_model=list[LeaveRead], summary="My leave requests")
async def my_leaves(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
    status_filter: Optional[LeaveStatus] = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Leave]:
    stmt = select(Leave).where(Leave.employee_id == employee.id)
    if status_filter is not None:
        stmt = stmt.where(Leave.status == status_filter)
    stmt = stmt.order_by(Leave.created_at.desc()).offset(skip).limit(limit)
    return list((await db.scalars(stmt)).all())


@router.get(
    "/payroll",
    response_model=list[PayrollRead],
    summary="My salary / payslip history",
)
async def my_payroll(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Payroll]:
    stmt = (
        select(Payroll)
        .where(Payroll.employee_id == employee.id)
        .order_by(Payroll.month.desc(), Payroll.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return list((await db.scalars(stmt)).all())


@router.get(
    "/balances",
    response_model=list[LeaveBalanceRead],
    summary="My leave balances",
)
async def my_balances(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
) -> list[LeaveBalanceRead]:
    await ensure_employee_balances(db, employee.id)
    policies = await get_policy_map(db)
    balances = (
        await db.scalars(
            select(LeaveBalance)
            .where(LeaveBalance.employee_id == employee.id)
            .order_by(LeaveBalance.leave_type)
        )
    ).all()
    return [
        LeaveBalanceRead(
            id=balance.id,
            employee_id=balance.employee_id,
            leave_type=balance.leave_type,
            remaining_days=balance.remaining_days,
            total_days_allowed=(
                policies[balance.leave_type].total_days_allowed
                if balance.leave_type in policies
                else None
            ),
            employee_name=employee.full_name,
        )
        for balance in balances
    ]


@router.get(
    "/dashboard",
    response_model=SelfServiceDashboard,
    summary="Employee portal dashboard",
)
async def my_dashboard(
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
    current_user: User = Depends(get_current_user),
) -> SelfServiceDashboard:
    today = datetime.now(timezone.utc).date()

    today_attendance = await db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee.id, Attendance.date == today
        )
    )

    await ensure_employee_balances(db, employee.id)
    policies = await get_policy_map(db)
    balances = (
        await db.scalars(
            select(LeaveBalance)
            .where(LeaveBalance.employee_id == employee.id)
            .order_by(LeaveBalance.leave_type)
        )
    ).all()
    balance_items = [
        LeaveBalanceRead(
            id=balance.id,
            employee_id=balance.employee_id,
            leave_type=balance.leave_type,
            remaining_days=balance.remaining_days,
            total_days_allowed=(
                policies[balance.leave_type].total_days_allowed
                if balance.leave_type in policies
                else None
            ),
            employee_name=employee.full_name,
        )
        for balance in balances
    ]

    pending_leaves = int(
        await db.scalar(
            select(func.count())
            .select_from(Leave)
            .where(
                Leave.employee_id == employee.id,
                Leave.status == LeaveStatus.PENDING,
            )
        )
        or 0
    )

    latest_payroll = await db.scalar(
        select(Payroll)
        .where(Payroll.employee_id == employee.id)
        .order_by(Payroll.created_at.desc(), Payroll.id.desc())
        .limit(1)
    )

    return SelfServiceDashboard(
        profile=_profile(employee),
        today_attendance=(
            AttendanceRead.model_validate(today_attendance)
            if today_attendance is not None
            else None
        ),
        leave_balances=balance_items,
        pending_leave_requests=pending_leaves,
        latest_payroll=(
            PayrollRead.model_validate(latest_payroll)
            if latest_payroll is not None
            else None
        ),
        unread_notifications=await count_unread(db, current_user.id),
    )
