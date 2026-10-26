"""Module 2 — Employee Management (CRUD + search/filter)."""

from __future__ import annotations

from datetime import date as date_type
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import (
    Attendance,
    AttendanceStatus,
    Employee,
    EmployeeShift,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    PerformanceReview,
    Shift,
    ShiftName,
    User,
    UserRole,
    utcnow,
)
from app.schemas import (
    EmployeeCreate,
    EmployeeFacets,
    EmployeeRead,
    EmployeeSearchItem,
    EmployeeSearchResponse,
    EmployeeUpdate,
    ShiftRead,
    UserCredentials,
)
from app.security import hash_password
from app.services.leave_balances import ensure_employee_balances
from app.services.shifts import today_utc

router = APIRouter(
    prefix="/employees",
    tags=["Employees"],
    dependencies=[Depends(get_current_user)],  # whole module requires authentication
)


def _to_read(employee: Employee, *, include_salary: bool) -> EmployeeRead:
    """Serialize an employee, masking salary from non-HR/Admin viewers."""
    data = EmployeeRead.model_validate(employee).model_dump()
    # username/email live on the linked user, not on Employee itself.
    if employee.user is not None:
        data["username"] = employee.user.username
        data["email"] = employee.user.email
    if not include_salary:
        data["salary"] = None
    return EmployeeRead(**data)


async def _get_employee_or_404(db: AsyncSession, employee_id: int) -> Employee:
    employee = await db.scalar(
        select(Employee)
        .options(selectinload(Employee.user))
        .where(Employee.id == employee_id)
    )
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {employee_id} not found",
        )
    return employee


@router.post(
    "/",
    response_model=EmployeeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new employee (HR/Admin)",
)
async def create_employee(
    payload: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> EmployeeRead:
    """Create an employee, either linked to an existing user or with a new account."""
    if payload.user_id is not None:
        user = await db.get(User, payload.user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {payload.user_id} not found",
            )
        already_linked = await db.scalar(
            select(Employee.id).where(Employee.user_id == user.id)
        )
        if already_linked is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This user already has an employee profile.",
            )
    else:
        creds: UserCredentials = payload.user_credentials  # type: ignore[assignment]
        conflict = await db.scalar(
            select(User).where(
                (User.username == creds.username) | (User.email == creds.email.lower())
            )
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this username or email already exists.",
            )
        user = User(
            username=creds.username,
            email=creds.email.lower(),
            hashed_password=hash_password(creds.password),
            role=UserRole.EMPLOYEE,
            created_at=utcnow(),
        )
        db.add(user)
        await db.flush()

    employee = Employee(
        user_id=user.id,
        full_name=payload.full_name,
        designation=payload.designation,
        department=payload.department,
        joining_date=payload.joining_date,
        salary=payload.salary,
        status=payload.status,
    )
    db.add(employee)
    await db.flush()
    # Seed this employee's leave balances from the active policies.
    await ensure_employee_balances(db, employee.id)
    await db.commit()
    employee = await _get_employee_or_404(db, employee.id)
    return _to_read(employee, include_salary=True)


@router.get(
    "/",
    response_model=list[EmployeeRead],
    summary="List employees with search/filter/pagination",
)
async def list_employees(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    q: Optional[str] = Query(
        default=None,
        max_length=120,
        description="Free-text search over full name, designation or department",
    ),
    department: Optional[str] = Query(default=None, max_length=120),
    designation: Optional[str] = Query(default=None, max_length=120),
    status_filter: Optional[EmployeeStatus] = Query(
        default=None, alias="status", description="ACTIVE or INACTIVE"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[EmployeeRead]:
    stmt: Select = select(Employee).options(selectinload(Employee.user))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.full_name.ilike(pattern),
                Employee.designation.ilike(pattern),
                Employee.department.ilike(pattern),
            )
        )
    if department:
        stmt = stmt.where(Employee.department.ilike(department.strip()))
    if designation:
        stmt = stmt.where(Employee.designation.ilike(designation.strip()))
    if status_filter:
        stmt = stmt.where(Employee.status == status_filter)

    stmt = stmt.order_by(Employee.full_name).offset(skip).limit(limit)
    employees = (await db.scalars(stmt)).all()

    include_salary = current_user.role in (UserRole.HR, UserRole.ADMIN)
    return [_to_read(emp, include_salary=include_salary) for emp in employees]


@router.get(
    "/search",
    response_model=EmployeeSearchResponse,
    summary="Advanced employee search with performance/attendance filters (HR/Admin)",
)
async def search_employees(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
    q: Optional[str] = Query(
        default=None,
        max_length=120,
        description="Search name, designation, department, username or email",
    ),
    department: Optional[str] = Query(default=None, max_length=120),
    designation: Optional[str] = Query(default=None, max_length=120),
    role: Optional[UserRole] = Query(default=None),
    status_filter: Optional[EmployeeStatus] = Query(default=None, alias="status"),
    shift_name: Optional[ShiftName] = Query(default=None),
    min_rating: Optional[float] = Query(default=None, ge=0, le=5),
    max_rating: Optional[float] = Query(default=None, ge=0, le=5),
    min_attendance_rate: Optional[float] = Query(default=None, ge=0, le=100),
    max_attendance_rate: Optional[float] = Query(default=None, ge=0, le=100),
    on_leave_today: Optional[bool] = Query(default=None),
    start_date: Optional[date_type] = Query(default=None),
    end_date: Optional[date_type] = Query(default=None),
    sort_by: Literal[
        "name", "rating", "attendance", "late", "department"
    ] = Query(default="name"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
) -> EmployeeSearchResponse:
    """Filter employees by profile, role, shift, attendance and review metrics.

    Attendance metrics are computed over ``start_date``–``end_date`` (defaults to
    the last 30 days). Metric filters are applied after aggregation so pagination
    reflects the truly matching set.
    """
    today = today_utc()
    range_end = end_date or today
    range_start = start_date or (range_end - timedelta(days=29))
    if range_end < range_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date.",
        )
    if (range_end - range_start).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date range cannot exceed 366 days.",
        )

    stmt = (
        select(Employee)
        .join(User, User.id == Employee.user_id)
        .options(
            selectinload(Employee.user),
            selectinload(Employee.shift_assignment).selectinload(EmployeeShift.shift),
        )
    )
    if shift_name is not None:
        stmt = stmt.join(
            EmployeeShift, EmployeeShift.employee_id == Employee.id
        ).join(Shift, Shift.id == EmployeeShift.shift_id)

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.full_name.ilike(pattern),
                Employee.designation.ilike(pattern),
                Employee.department.ilike(pattern),
                User.username.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    if department:
        stmt = stmt.where(Employee.department.ilike(department.strip()))
    if designation:
        stmt = stmt.where(Employee.designation.ilike(designation.strip()))
    if role is not None:
        stmt = stmt.where(User.role == role)
    if status_filter is not None:
        stmt = stmt.where(Employee.status == status_filter)
    if shift_name is not None:
        stmt = stmt.where(Shift.name == shift_name)

    employees = list(
        (await db.scalars(stmt.order_by(Employee.full_name))).all()
    )

    attendance_stats: dict[int, dict[str, int]] = {}
    ratings: dict[int, dict[str, float]] = {}
    today_status: dict[int, AttendanceStatus] = {}
    on_leave: set[int] = set()

    ids = [employee.id for employee in employees]
    if ids:
        att_stmt = (
            select(
                Attendance.employee_id,
                func.count(Attendance.id),
                func.coalesce(
                    func.sum(
                        case((Attendance.status == AttendanceStatus.PRESENT, 1), else_=0)
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
            .where(
                Attendance.employee_id.in_(ids),
                Attendance.date >= range_start,
                Attendance.date <= range_end,
            )
            .group_by(Attendance.employee_id)
        )
        for employee_id, total, present, half_day, late in (
            await db.execute(att_stmt)
        ).all():
            attendance_stats[int(employee_id)] = {
                "total": int(total or 0),
                "present": int(present or 0),
                "half_day": int(half_day or 0),
                "late": int(late or 0),
            }

        rating_stmt = (
            select(
                PerformanceReview.employee_id,
                func.avg(PerformanceReview.rating),
                func.count(PerformanceReview.id),
            )
            .where(PerformanceReview.employee_id.in_(ids))
            .group_by(PerformanceReview.employee_id)
        )
        for employee_id, average, count in (await db.execute(rating_stmt)).all():
            ratings[int(employee_id)] = {
                "average": float(average or 0),
                "reviews": int(count or 0),
            }

        today_status = {
            record.employee_id: record.status
            for record in (
                await db.scalars(
                    select(Attendance).where(
                        Attendance.employee_id.in_(ids), Attendance.date == today
                    )
                )
            ).all()
        }
        on_leave = set(
            (
                await db.scalars(
                    select(Leave.employee_id).where(
                        Leave.employee_id.in_(ids),
                        Leave.status == LeaveStatus.APPROVED,
                        Leave.start_date <= today,
                        Leave.end_date >= today,
                    )
                )
            ).all()
        )

    items: list[EmployeeSearchItem] = []
    for employee in employees:
        base = _to_read(employee, include_salary=True).model_dump()
        stats = attendance_stats.get(
            employee.id, {"total": 0, "present": 0, "half_day": 0, "late": 0}
        )
        attendance_rate = (
            round(
                ((stats["present"] + stats["half_day"] * 0.5) / stats["total"]) * 100,
                2,
            )
            if stats["total"]
            else 0.0
        )
        rating = ratings.get(employee.id, {"average": 0.0, "reviews": 0.0})
        assignment = employee.shift_assignment
        item = EmployeeSearchItem(
            **base,
            role=employee.user.role if employee.user is not None else None,
            shift_name=assignment.shift.name if assignment is not None else None,
            attendance_rate=attendance_rate,
            late_count=stats["late"],
            average_rating=round(rating["average"], 2),
            review_count=int(rating["reviews"]),
            today_attendance=today_status.get(employee.id),
            on_leave_today=employee.id in on_leave,
        )
        items.append(item)

    def _matches(item: EmployeeSearchItem) -> bool:
        if min_rating is not None and item.average_rating < min_rating:
            return False
        if max_rating is not None and item.average_rating > max_rating:
            return False
        if (
            min_attendance_rate is not None
            and item.attendance_rate < min_attendance_rate
        ):
            return False
        if (
            max_attendance_rate is not None
            and item.attendance_rate > max_attendance_rate
        ):
            return False
        if on_leave_today is not None and item.on_leave_today != on_leave_today:
            return False
        return True

    items = [item for item in items if _matches(item)]

    key_funcs = {
        "name": lambda item: (item.full_name.lower(), item.id),
        "rating": lambda item: (item.average_rating, item.full_name.lower()),
        "attendance": lambda item: (item.attendance_rate, item.full_name.lower()),
        "late": lambda item: (item.late_count, item.full_name.lower()),
        "department": lambda item: (item.department.lower(), item.full_name.lower()),
    }
    items.sort(key=key_funcs[sort_by], reverse=sort_order == "desc")

    total = len(items)
    return EmployeeSearchResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items[skip : skip + limit],
    )


@router.get(
    "/facets",
    response_model=EmployeeFacets,
    summary="Filter facets for advanced employee search (HR/Admin)",
)
async def employee_facets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> EmployeeFacets:
    """Distinct departments/designations/roles plus available shifts."""
    departments = list(
        (
            await db.scalars(
                select(Employee.department).distinct().order_by(Employee.department)
            )
        ).all()
    )
    designations = list(
        (
            await db.scalars(
                select(Employee.designation).distinct().order_by(Employee.designation)
            )
        ).all()
    )
    roles = list((await db.scalars(select(User.role).distinct())).all())
    roles.sort(key=lambda value: value.value)
    shifts = list(
        (await db.scalars(select(Shift).order_by(Shift.start_time))).all()
    )
    return EmployeeFacets(
        departments=departments,
        designations=designations,
        roles=roles,
        shifts=[ShiftRead.model_validate(shift) for shift in shifts],
    )


@router.get(
    "/{employee_id}",
    response_model=EmployeeRead,
    summary="View a specific employee profile",
)
async def get_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeRead:
    employee = await _get_employee_or_404(db, employee_id)
    if (
        current_user.role == UserRole.EMPLOYEE
        and employee.user_id != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own employee profile.",
        )
    include_salary = current_user.role in (UserRole.HR, UserRole.ADMIN)
    return _to_read(employee, include_salary=include_salary)


@router.put(
    "/{employee_id}",
    response_model=EmployeeRead,
    summary="Update employee details (HR/Admin)",
)
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> EmployeeRead:
    employee = await _get_employee_or_404(db, employee_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update.",
        )
    for field, value in updates.items():
        setattr(employee, field, value)
    await db.commit()
    employee = await _get_employee_or_404(db, employee.id)
    return _to_read(employee, include_salary=True)


@router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an employee profile (HR/Admin)",
)
async def delete_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Response:
    employee = await _get_employee_or_404(db, employee_id)
    await db.delete(employee)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
