"""Module 18 — advanced analytics and department reports.

Every endpoint accepts the same ``start_date`` / ``end_date`` / ``department``
filters and returns chart-ready aggregates. Query work is pushed into SQL where
possible; small date-bucket shaping is done in Python for portability across
SQLite and Postgres.
"""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, time, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_staff
from app.models import (
    Attendance,
    AttendanceStatus,
    Employee,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    LeaveType,
    PerformanceReview,
)
from app.schemas import (
    AnalyticsFilters,
    AnalyticsOverview,
    AnalyticsReport,
    AttendanceAnalyticsPoint,
    DepartmentAnalyticsRow,
    DepartmentRating,
    LeaveAnalyticsPoint,
    LeaveTypeMetric,
    TeamPerformanceInsights,
)
from app.services.shifts import today_utc

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
    dependencies=[Depends(require_staff)],
)

Granularity = Literal["day", "week", "month"]


def _resolve_filters(
    start_date: Optional[date_type],
    end_date: Optional[date_type],
    department: Optional[str],
) -> tuple[date_type, date_type, Optional[str]]:
    end = end_date or today_utc()
    start = start_date or (end - timedelta(days=29))
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date.",
        )
    if (end - start).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date range cannot exceed 366 days.",
        )
    return start, end, department.strip() if department else None


def _with_department(stmt: Select, department: str | None) -> Select:
    if department:
        stmt = stmt.join(Employee, Employee.id == Attendance.employee_id)
        stmt = stmt.where(Employee.department.ilike(department))
    return stmt


def _rate(present: int, half_day: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(((present + half_day * 0.5) / total) * 100, 2)


def _period_keys(
    start: date_type, end: date_type, granularity: Granularity
) -> list[str]:
    keys: list[str] = []
    if granularity == "day":
        cursor = start
        while cursor <= end:
            keys.append(cursor.isoformat())
            cursor += timedelta(days=1)
        return keys
    if granularity == "week":
        cursor = start - timedelta(days=start.weekday())
        while cursor <= end:
            iso = cursor.isocalendar()
            keys.append(f"{iso.year}-W{iso.week:02d}")
            cursor += timedelta(days=7)
        return keys
    cursor = start.replace(day=1)
    while cursor <= end:
        keys.append(cursor.strftime("%Y-%m"))
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    return keys


async def _overview(
    db: AsyncSession,
    start: date_type,
    end: date_type,
    department: str | None,
) -> AnalyticsOverview:
    employee_stmt = select(func.count()).select_from(Employee).where(
        Employee.status == EmployeeStatus.ACTIVE
    )
    if department:
        employee_stmt = employee_stmt.where(
            Employee.department.ilike(department)
        )
    total_employees = int(await db.scalar(employee_stmt) or 0)

    department_stmt = select(func.count(func.distinct(Employee.department)))
    if department:
        department_stmt = department_stmt.where(
            Employee.department.ilike(department)
        )
    department_count = int(await db.scalar(department_stmt) or 0)

    att_stmt = select(
        func.count(Attendance.id),
        func.coalesce(
            func.sum(case((Attendance.status == AttendanceStatus.PRESENT, 1), else_=0)),
            0,
        ),
        func.coalesce(
            func.sum(case((Attendance.status == AttendanceStatus.ABSENT, 1), else_=0)),
            0,
        ),
        func.coalesce(
            func.sum(case((Attendance.status == AttendanceStatus.HALF_DAY, 1), else_=0)),
            0,
        ),
        func.coalesce(
            func.sum(case((Attendance.is_late.is_(True), 1), else_=0)), 0
        ),
        func.coalesce(
            func.sum(case((Attendance.is_early_exit.is_(True), 1), else_=0)), 0
        ),
    ).where(Attendance.date >= start, Attendance.date <= end)
    att_stmt = _with_department(att_stmt, department)
    records, present, absent, half_day, late, early = (
        await db.execute(att_stmt)
    ).one()

    leave_stmt = select(Leave).where(
        Leave.start_date <= end, Leave.end_date >= start
    )
    if department:
        leave_stmt = leave_stmt.join(
            Employee, Employee.id == Leave.employee_id
        ).where(Employee.department.ilike(department))
    leave_rows = list((await db.scalars(leave_stmt)).all())
    approved_days = sum(
        (min(leave.end_date, end) - max(leave.start_date, start)).days + 1
        for leave in leave_rows
        if leave.status == LeaveStatus.APPROVED
    )

    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end + timedelta(days=1), time.min)
    perf_stmt = select(
        func.coalesce(func.avg(PerformanceReview.rating), 0.0),
        func.count(PerformanceReview.id),
    ).where(
        PerformanceReview.created_at >= start_dt,
        PerformanceReview.created_at < end_dt,
    )
    if department:
        perf_stmt = perf_stmt.join(
            Employee, Employee.id == PerformanceReview.employee_id
        ).where(Employee.department.ilike(department))
    average_rating, reviews = (await db.execute(perf_stmt)).one()

    return AnalyticsOverview(
        total_employees=total_employees,
        active_employees=total_employees,
        departments=department_count,
        attendance_records=int(records or 0),
        present=int(present or 0),
        absent=int(absent or 0),
        half_day=int(half_day or 0),
        late=int(late or 0),
        early_exits=int(early or 0),
        attendance_rate=_rate(int(present or 0), int(half_day or 0), int(records or 0)),
        leave_requests=len(leave_rows),
        approved_leave_days=approved_days,
        average_rating=round(float(average_rating or 0), 2),
        reviews=int(reviews or 0),
    )


async def _attendance_trends(
    db: AsyncSession,
    start: date_type,
    end: date_type,
    department: str | None,
    granularity: Granularity,
) -> list[AttendanceAnalyticsPoint]:
    stmt = select(Attendance.date, Attendance.status, Attendance.is_late).where(
        Attendance.date >= start, Attendance.date <= end
    )
    stmt = _with_department(stmt, department)
    rows = (await db.execute(stmt)).all()

    buckets: dict[str, dict[str, int]] = {
        key: {"present": 0, "absent": 0, "half_day": 0, "late": 0, "total": 0}
        for key in _period_keys(start, end, granularity)
    }
    for record_date, record_status, is_late in rows:
        if granularity == "day":
            key = record_date.isoformat()
        elif granularity == "week":
            iso = record_date.isocalendar()
            key = f"{iso.year}-W{iso.week:02d}"
        else:
            key = record_date.strftime("%Y-%m")
        bucket = buckets.setdefault(
            key, {"present": 0, "absent": 0, "half_day": 0, "late": 0, "total": 0}
        )
        bucket["total"] += 1
        if record_status == AttendanceStatus.PRESENT:
            bucket["present"] += 1
        elif record_status == AttendanceStatus.ABSENT:
            bucket["absent"] += 1
        elif record_status == AttendanceStatus.HALF_DAY:
            bucket["half_day"] += 1
        if is_late:
            bucket["late"] += 1

    return [
        AttendanceAnalyticsPoint(
            period=key,
            present=values["present"],
            absent=values["absent"],
            half_day=values["half_day"],
            late=values["late"],
            total=values["total"],
            attendance_rate=_rate(
                values["present"], values["half_day"], values["total"]
            ),
        )
        for key, values in buckets.items()
    ]


async def _leave_analytics(
    db: AsyncSession,
    start: date_type,
    end: date_type,
    department: str | None,
) -> tuple[list[LeaveAnalyticsPoint], list[LeaveTypeMetric]]:
    stmt = select(Leave).where(Leave.start_date <= end, Leave.end_date >= start)
    if department:
        stmt = stmt.join(Employee, Employee.id == Leave.employee_id).where(
            Employee.department.ilike(department)
        )
    leaves = list((await db.scalars(stmt)).all())

    trend_buckets: dict[str, dict[str, int]] = {
        key: {"approved": 0, "pending": 0, "rejected": 0, "days": 0}
        for key in _period_keys(start, end, "month")
    }
    type_buckets: dict[LeaveType, dict[str, int]] = {
        leave_type: {"requests": 0, "days": 0} for leave_type in LeaveType
    }
    for leave in leaves:
        clipped_start = max(leave.start_date, start)
        clipped_end = min(leave.end_date, end)
        days = max(0, (clipped_end - clipped_start).days + 1)
        key = clipped_start.strftime("%Y-%m")
        bucket = trend_buckets.setdefault(
            key, {"approved": 0, "pending": 0, "rejected": 0, "days": 0}
        )
        bucket[leave.status.value.lower()] += 1
        bucket["days"] += days
        type_bucket = type_buckets[leave.leave_type]
        type_bucket["requests"] += 1
        type_bucket["days"] += days

    trends = [
        LeaveAnalyticsPoint(
            period=key,
            approved=values["approved"],
            pending=values["pending"],
            rejected=values["rejected"],
            days=values["days"],
        )
        for key, values in trend_buckets.items()
    ]
    metrics = [
        LeaveTypeMetric(
            leave_type=leave_type, requests=values["requests"], days=values["days"]
        )
        for leave_type, values in type_buckets.items()
    ]
    return trends, metrics


async def _performance(
    db: AsyncSession,
    start: date_type,
    end: date_type,
    department: str | None,
) -> TeamPerformanceInsights:
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end + timedelta(days=1), time.min)

    rating_stmt = select(PerformanceReview.rating).where(
        PerformanceReview.created_at >= start_dt,
        PerformanceReview.created_at < end_dt,
    )
    if department:
        rating_stmt = rating_stmt.join(
            Employee, Employee.id == PerformanceReview.employee_id
        ).where(Employee.department.ilike(department))
    ratings = [int(value) for value in (await db.scalars(rating_stmt)).all()]

    department_stmt = (
        select(
            Employee.department,
            func.avg(PerformanceReview.rating),
            func.count(PerformanceReview.id),
        )
        .join(Employee, Employee.id == PerformanceReview.employee_id)
        .where(
            PerformanceReview.created_at >= start_dt,
            PerformanceReview.created_at < end_dt,
        )
    )
    if department:
        department_stmt = department_stmt.where(
            Employee.department.ilike(department)
        )
    rows = (
        await db.execute(
            department_stmt.group_by(Employee.department).order_by(
                func.avg(PerformanceReview.rating).desc()
            )
        )
    ).all()

    return TeamPerformanceInsights(
        average_rating=round(sum(ratings) / len(ratings), 2) if ratings else 0.0,
        total_reviews=len(ratings),
        rating_distribution={
            str(value): ratings.count(value) for value in range(1, 6)
        },
        departments=[
            DepartmentRating(
                department=name,
                average_rating=round(float(average or 0), 2),
                reviews=int(count),
            )
            for name, average, count in rows
        ],
    )


async def _departments(
    db: AsyncSession,
    start: date_type,
    end: date_type,
    department: str | None,
) -> list[DepartmentAnalyticsRow]:
    headcount_stmt = (
        select(Employee.department, func.count(Employee.id))
        .where(Employee.status == EmployeeStatus.ACTIVE)
        .group_by(Employee.department)
    )
    if department:
        headcount_stmt = headcount_stmt.where(
            Employee.department.ilike(department)
        )
    headcounts = {
        name: int(count)
        for name, count in (await db.execute(headcount_stmt)).all()
    }

    att_stmt = (
        select(
            Employee.department,
            func.count(Attendance.id),
            func.coalesce(
                func.sum(
                    case((Attendance.status == AttendanceStatus.PRESENT, 1), else_=0)
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case((Attendance.status == AttendanceStatus.ABSENT, 1), else_=0)
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case((Attendance.status == AttendanceStatus.HALF_DAY, 1), else_=0)
                ),
                0,
            ),
            func.coalesce(
                func.sum(case((Attendance.is_late.is_(True), 1), else_=0)), 0
            ),
        )
        .join(Employee, Employee.id == Attendance.employee_id)
        .where(Attendance.date >= start, Attendance.date <= end)
        .group_by(Employee.department)
    )
    if department:
        att_stmt = att_stmt.where(Employee.department.ilike(department))
    attendance_stats = {
        name: {
            "total": int(total or 0),
            "present": int(present or 0),
            "absent": int(absent or 0),
            "half_day": int(half_day or 0),
            "late": int(late or 0),
        }
        for name, total, present, absent, half_day, late in (
            await db.execute(att_stmt)
        ).all()
    }

    leave_stmt = (
        select(Leave)
        .options(selectinload(Leave.employee))
        .where(Leave.start_date <= end, Leave.end_date >= start)
    )
    if department:
        leave_stmt = leave_stmt.join(
            Employee, Employee.id == Leave.employee_id
        ).where(Employee.department.ilike(department))
    leave_days: dict[str, int] = {}
    for leave in (await db.scalars(leave_stmt)).all():
        if leave.status != LeaveStatus.APPROVED:
            continue
        days = (min(leave.end_date, end) - max(leave.start_date, start)).days + 1
        if days > 0:
            leave_days[leave.employee.department] = (
                leave_days.get(leave.employee.department, 0) + days
            )

    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end + timedelta(days=1), time.min)
    perf_stmt = (
        select(
            Employee.department,
            func.avg(PerformanceReview.rating),
            func.count(PerformanceReview.id),
        )
        .join(Employee, Employee.id == PerformanceReview.employee_id)
        .where(
            PerformanceReview.created_at >= start_dt,
            PerformanceReview.created_at < end_dt,
        )
    )
    if department:
        perf_stmt = perf_stmt.where(Employee.department.ilike(department))
    performance_stats = {
        name: {"average": float(average or 0), "reviews": int(count)}
        for name, average, count in (
            await db.execute(perf_stmt.group_by(Employee.department))
        ).all()
    }

    names = sorted(
        set(headcounts) | set(attendance_stats) | set(leave_days) | set(performance_stats)
    )
    result: list[DepartmentAnalyticsRow] = []
    for name in names:
        stats = attendance_stats.get(
            name,
            {"total": 0, "present": 0, "absent": 0, "half_day": 0, "late": 0},
        )
        perf = performance_stats.get(name, {"average": 0.0, "reviews": 0})
        result.append(
            DepartmentAnalyticsRow(
                department=name,
                headcount=headcounts.get(name, 0),
                present=stats["present"],
                absent=stats["absent"],
                late=stats["late"],
                attendance_rate=_rate(
                    stats["present"], stats["half_day"], stats["total"]
                ),
                leave_days=leave_days.get(name, 0),
                average_rating=round(perf["average"], 2),
                reviews=perf["reviews"],
            )
        )
    return result


@router.get("/overview", response_model=AnalyticsOverview, summary="Workforce overview")
async def overview(
    db: AsyncSession = Depends(get_db),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    department: Optional[str] = Query(default=None, max_length=120),
) -> AnalyticsOverview:
    start, end, dept = _resolve_filters(start_date, end_date, department)
    return await _overview(db, start, end, dept)


@router.get(
    "/attendance-trends",
    response_model=list[AttendanceAnalyticsPoint],
    summary="Attendance trend series",
)
async def attendance_trends(
    db: AsyncSession = Depends(get_db),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    department: Optional[str] = Query(default=None, max_length=120),
    granularity: Granularity = Query(default="day"),
) -> list[AttendanceAnalyticsPoint]:
    start, end, dept = _resolve_filters(start_date, end_date, department)
    return await _attendance_trends(db, start, end, dept, granularity)


@router.get(
    "/leave-trends",
    response_model=list[LeaveAnalyticsPoint],
    summary="Leave trend series",
)
async def leave_trends(
    db: AsyncSession = Depends(get_db),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    department: Optional[str] = Query(default=None, max_length=120),
) -> list[LeaveAnalyticsPoint]:
    start, end, dept = _resolve_filters(start_date, end_date, department)
    trends, _ = await _leave_analytics(db, start, end, dept)
    return trends


@router.get(
    "/performance-insights",
    response_model=TeamPerformanceInsights,
    summary="Performance rating insights",
)
async def performance_insights(
    db: AsyncSession = Depends(get_db),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    department: Optional[str] = Query(default=None, max_length=120),
) -> TeamPerformanceInsights:
    start, end, dept = _resolve_filters(start_date, end_date, department)
    return await _performance(db, start, end, dept)


@router.get(
    "/departments",
    response_model=list[DepartmentAnalyticsRow],
    summary="Department-wise analytics",
)
async def department_report(
    db: AsyncSession = Depends(get_db),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    department: Optional[str] = Query(default=None, max_length=120),
) -> list[DepartmentAnalyticsRow]:
    start, end, dept = _resolve_filters(start_date, end_date, department)
    return await _departments(db, start, end, dept)


@router.get(
    "/report",
    response_model=AnalyticsReport,
    summary="Combined analytics report with filters",
)
async def analytics_report(
    db: AsyncSession = Depends(get_db),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    department: Optional[str] = Query(default=None, max_length=120),
    granularity: Granularity = Query(default="day"),
) -> AnalyticsReport:
    start, end, dept = _resolve_filters(start_date, end_date, department)
    overview_result = await _overview(db, start, end, dept)
    attendance_result = await _attendance_trends(db, start, end, dept, granularity)
    leave_result, leave_type_result = await _leave_analytics(db, start, end, dept)
    performance_result = await _performance(db, start, end, dept)
    department_result = await _departments(db, start, end, dept)
    return AnalyticsReport(
        filters=AnalyticsFilters(
            start_date=start, end_date=end, department=dept
        ),
        overview=overview_result,
        attendance_trends=attendance_result,
        leave_trends=leave_result,
        leave_types=leave_type_result,
        performance=performance_result,
        departments=department_result,
    )
