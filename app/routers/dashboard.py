"""Module 6 — Dashboard & Analytics (HR/Admin KPI summaries)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_staff
from app.models import (
    Attendance,
    AttendanceStatus,
    Employee,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    Payroll,
)
from app.schemas import DashboardStats, PayrollOverview

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(require_staff)],  # HR/Admin only
)


@router.get(
    "/stats",
    response_model=DashboardStats,
    summary="KPI summary for HR/Admin",
)
async def dashboard_stats(db: AsyncSession = Depends(get_db)) -> DashboardStats:
    now = datetime.now(timezone.utc)
    today = now.date()
    current_month = now.strftime("%B-%Y")  # e.g. "October-2026"

    total_employees = int(await db.scalar(select(func.count()).select_from(Employee)) or 0)
    active_employees = int(
        await db.scalar(
            select(func.count())
            .select_from(Employee)
            .where(Employee.status == EmployeeStatus.ACTIVE)
        )
        or 0
    )

    attendance_today = await db.execute(
        select(Attendance.status, func.count())
        .where(Attendance.date == today)
        .group_by(Attendance.status)
    )
    counts = {row[0]: row[1] for row in attendance_today.all()}
    present_today = int(counts.get(AttendanceStatus.PRESENT, 0))
    half_day_today = int(counts.get(AttendanceStatus.HALF_DAY, 0))

    pending_leave_requests = int(
        await db.scalar(
            select(func.count()).select_from(Leave).where(Leave.status == LeaveStatus.PENDING)
        )
        or 0
    )

    # Employees whose approved leave window covers today.
    employees_on_leave_today = int(
        await db.scalar(
            select(func.count())
            .select_from(Leave)
            .where(
                Leave.status == LeaveStatus.APPROVED,
                Leave.start_date <= today,
                Leave.end_date >= today,
            )
        )
        or 0
    )

    payroll_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Payroll.net_salary), 0.0),
                func.count(Payroll.id),
            ).where(Payroll.month == current_month)
        )
    ).one()
    total_net, records = payroll_row

    return DashboardStats(
        total_employees=total_employees,
        active_employees=active_employees,
        present_today=present_today,
        half_day_today=half_day_today,
        pending_leave_requests=pending_leave_requests,
        employees_on_leave_today=employees_on_leave_today,
        payroll_overview=PayrollOverview(
            month=current_month,
            total_net_salary=round(float(total_net), 2),
            records_generated=int(records),
        ),
    )
