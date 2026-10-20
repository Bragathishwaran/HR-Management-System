"""Module 2 — Employee Management (CRUD + search/filter)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, EmployeeStatus, User, UserRole, utcnow
from app.schemas import EmployeeCreate, EmployeeRead, EmployeeUpdate, UserCredentials
from app.security import hash_password

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
