"""Module 5 — Payroll Management (generate monthly salary + view records)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, Payroll, User, UserRole
from app.schemas import PayrollDetailRead, PayrollGenerate, PayrollRead, PayrollSummary
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
    net = basic + payload.allowances + payload.bonus - payload.deductions
    if net < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Net salary cannot be negative — reduce deductions.",
        )

    record = Payroll(
        employee_id=employee.id,
        basic_salary=basic,
        allowances=payload.allowances,
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
    "/summary",
    response_model=PayrollSummary,
    summary="Monthly payroll summary with full breakdown (HR/Admin)",
)
async def payroll_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
    month: Optional[str] = Query(
        default=None, max_length=20, description='e.g. "October-2026"'
    ),
) -> PayrollSummary:
    target_month = month or datetime.now(timezone.utc).strftime("%B-%Y")
    row = (
        await db.execute(
            select(
                func.count(Payroll.id),
                func.coalesce(func.sum(Payroll.basic_salary), 0.0),
                func.coalesce(func.sum(Payroll.allowances), 0.0),
                func.coalesce(func.sum(Payroll.bonus), 0.0),
                func.coalesce(func.sum(Payroll.deductions), 0.0),
                func.coalesce(func.sum(Payroll.net_salary), 0.0),
            ).where(Payroll.month == target_month)
        )
    ).one()
    count, basic, allowances, bonus, deductions, net = row
    return PayrollSummary(
        month=target_month,
        employees_paid=int(count or 0),
        total_basic=round(float(basic), 2),
        total_allowances=round(float(allowances), 2),
        total_bonus=round(float(bonus), 2),
        total_deductions=round(float(deductions), 2),
        total_gross=round(float(basic + allowances + bonus), 2),
        total_net=round(float(net), 2),
    )


@router.get(
    "/{payroll_id}",
    response_model=PayrollDetailRead,
    summary="Detailed payslip (own record for employees)",
)
async def get_payslip(
    payroll_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollDetailRead:
    record = await db.scalar(
        select(Payroll)
        .options(selectinload(Payroll.employee))
        .where(Payroll.id == payroll_id)
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payroll record {payroll_id} not found",
        )

    if current_user.role not in (UserRole.HR, UserRole.ADMIN):
        own = await db.scalar(
            select(Employee).where(Employee.user_id == current_user.id)
        )
        if own is None or record.employee_id != own.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own payslips.",
            )

    detail = PayrollDetailRead.model_validate(record)
    detail.employee_name = record.employee.full_name
    detail.designation = record.employee.designation
    detail.department = record.employee.department
    return detail


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
