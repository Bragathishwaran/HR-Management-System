"""Module 5 — Payroll Management (generate monthly salary + view records)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_employee_profile, require_staff
from app.models import Employee, Payroll, User, UserRole
from app.schemas import PayrollGenerate, PayrollRead
from app.services.notifications import notify_payroll_generated

router = APIRouter(
    prefix="/payroll",
    tags=["Payroll"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "/generate",
    response_model=PayrollRead,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a monthly salary slip (HR/Admin)",
)
async def generate_payroll(
    payload: PayrollGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Payroll:
    employee = await db.scalar(
        select(Employee).where(Employee.id == payload.employee_id)
    )
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {payload.employee_id} not found",
        )

    duplicate = await db.scalar(
        select(Payroll.id).where(
            Payroll.employee_id == employee.id, Payroll.month == payload.month
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payroll for {employee.full_name} for {payload.month} already exists.",
        )

    basic = payload.basic_salary if payload.basic_salary is not None else employee.salary
    net = basic + payload.bonus - payload.deductions
    if net < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Net salary cannot be negative — reduce deductions.",
        )

    record = Payroll(
        employee_id=employee.id,
        basic_salary=basic,
        deductions=payload.deductions,
        bonus=payload.bonus,
        net_salary=net,
        month=payload.month,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(record)
    await notify_payroll_generated(
        db,
        user_id=employee.user_id,
        employee_name=employee.full_name,
        month=payload.month,
        net_salary=net,
    )
    await db.commit()
    await db.refresh(record)
    return record


@router.get(
    "/",
    response_model=list[PayrollRead],
    summary="View payroll records (own for employees, all for HR/Admin)",
)
async def list_payroll(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    employee_id: Optional[int] = Query(default=None, gt=0, description="HR/Admin only filter"),
    month: Optional[str] = Query(default=None, max_length=20, description='e.g. "October-2026"'),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Payroll]:
    stmt: Select = select(Payroll)

    if current_user.role in (UserRole.HR, UserRole.ADMIN):
        if employee_id is not None:
            stmt = stmt.where(Payroll.employee_id == employee_id)
    else:
        own = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
        if own is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee profile is linked to this account.",
            )
        stmt = stmt.where(Payroll.employee_id == own.id)

    if month:
        stmt = stmt.where(Payroll.month == month)

    stmt = stmt.order_by(Payroll.month.desc(), Payroll.id.desc()).offset(skip).limit(limit)
    return list((await db.scalars(stmt)).all())
