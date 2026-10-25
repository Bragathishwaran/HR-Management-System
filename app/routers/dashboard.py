"""Module 6 — Dashboard & Analytics (HR/Admin KPI summaries)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin, require_staff
from app.models import (
    Attendance,
    AttendanceStatus,
    Employee,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    Payroll,
    User,
    UserRole,
)
from app.schemas import (
    AdminAnalytics,
    AttendanceTrendPoint,
    DashboardStats,
    DashboardTrends,
    DepartmentCount,
    LeaveStatusBreakdown,
    PayrollOverview,
    PayrollTrendPoint,
)

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


@router.get(
    "/trends",
    response_model=DashboardTrends,
    summary="Chart-ready workforce trends (HR/Admin)",
)
async def dashboard_trends(db: AsyncSession = Depends(get_db)) -> DashboardTrends:
    """Attendance, leave, payroll and department series for dashboard charts."""
    today = datetime.now(timezone.utc).date()
    first_day = today - timedelta(days=6)

    attendance_rows = (
        await db.execute(
            select(Attendance.date, Attendance.status, func.count())
            .where(Attendance.date >= first_day, Attendance.date <= today)
            .group_by(Attendance.date, Attendance.status)
        )
    ).all()
    attendance_map: dict[tuple, int] = {
        (row_date, status): int(count) for row_date, status, count in attendance_rows
    }
    attendance_trend = []
    for offset in range(7):
        day = first_day + timedelta(days=offset)
        attendance_trend.append(
            AttendanceTrendPoint(
                date=day,
                present=attendance_map.get((day, AttendanceStatus.PRESENT), 0),
                absent=attendance_map.get((day, AttendanceStatus.ABSENT), 0),
                half_day=attendance_map.get((day, AttendanceStatus.HALF_DAY), 0),
            )
        )

    leave_rows = (
        await db.execute(
            select(Leave.status, func.count()).group_by(Leave.status)
        )
    ).all()
    leave_counts = {status: int(count) for status, count in leave_rows}
    leave_breakdown = LeaveStatusBreakdown(
        pending=leave_counts.get(LeaveStatus.PENDING, 0),
        approved=leave_counts.get(LeaveStatus.APPROVED, 0),
        rejected=leave_counts.get(LeaveStatus.REJECTED, 0),
    )

    department_rows = (
        await db.execute(
            select(Employee.department, func.count())
            .group_by(Employee.department)
            .order_by(func.count().desc())
        )
    ).all()
    department_distribution = [
        DepartmentCount(department=department, count=int(count))
        for department, count in department_rows
    ]

    payroll_rows = (
        await db.execute(
            select(
                Payroll.month,
                func.coalesce(func.sum(Payroll.net_salary), 0.0),
                func.count(Payroll.id),
                func.max(Payroll.created_at),
            )
            .group_by(Payroll.month)
            .order_by(func.max(Payroll.created_at).desc())
            .limit(6)
        )
    ).all()
    payroll_trend = [
        PayrollTrendPoint(month=month, total_net=round(float(total), 2), records=int(count))
        for month, total, count, _ in reversed(payroll_rows)
    ]

    return DashboardTrends(
        attendance_trend=attendance_trend,
        leave_breakdown=leave_breakdown,
        payroll_trend=payroll_trend,
        department_distribution=department_distribution,
    )


@router.get(
    "/analytics",
    response_model=AdminAnalytics,
    summary="System-wide analytics (Admin only)",
)
async def admin_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> AdminAnalytics:
    now = datetime.now(timezone.utc)
    today = now.date()
    current_month = now.strftime("%B-%Y")

    total_users = int(await db.scalar(select(func.count()).select_from(User)) or 0)
    active_users = int(
        await db.scalar(
            select(func.count()).select_from(User).where(User.is_active.is_(True))
        )
        or 0
    )

    role_rows = await db.execute(
        select(User.role, func.count()).group_by(User.role)
    )
    users_by_role = {role.value: int(count) for role, count in role_rows.all()}

    total_employees = int(
        await db.scalar(select(func.count()).select_from(Employee)) or 0
    )
    active_employees = int(
        await db.scalar(
            select(func.count())
            .select_from(Employee)
            .where(Employee.status == EmployeeStatus.ACTIVE)
        )
        or 0
    )

    department_rows = await db.execute(
        select(Employee.department, func.count()).group_by(Employee.department)
    )
    department_distribution = {
        department: int(count) for department, count in department_rows.all()
    }

    pending_leave_requests = int(
        await db.scalar(
            select(func.count())
            .select_from(Leave)
            .where(Leave.status == LeaveStatus.PENDING)
        )
        or 0
    )

    attendance_rows = await db.execute(
        select(Attendance.status, func.count())
        .where(Attendance.date == today)
        .group_by(Attendance.status)
    )
    attendance_today = {
        status.value: int(count) for status, count in attendance_rows.all()
    }
    for status_value in AttendanceStatus:
        attendance_today.setdefault(status_value.value, 0)

    payroll_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Payroll.net_salary), 0.0),
                func.count(Payroll.id),
            ).where(Payroll.month == current_month)
        )
    ).one()
    total_net, records = payroll_row

    return AdminAnalytics(
        total_users=total_users,
        active_users=active_users,
        inactive_users=total_users - active_users,
        users_by_role=users_by_role,
        total_employees=total_employees,
        active_employees=active_employees,
        department_distribution=department_distribution,
        pending_leave_requests=pending_leave_requests,
        attendance_today=attendance_today,
        payroll_overview=PayrollOverview(
            month=current_month,
            total_net_salary=round(float(total_net), 2),
            records_generated=int(records),
        ),
    )
