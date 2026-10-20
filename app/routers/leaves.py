"""Module 4 — Leave Management (apply, list, approve/reject + notifications)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_employee_profile, require_staff
from app.models import Employee, Leave, LeaveStatus, User, UserRole
from app.schemas import LeaveApply, LeaveRead, LeaveStatusUpdate
from app.services.notifications import notify_leave_status

router = APIRouter(
    prefix="/leaves",
    tags=["Leaves"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "/apply",
    response_model=LeaveRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a leave request",
)
async def apply_leave(
    payload: LeaveApply,
    db: AsyncSession = Depends(get_db),
    employee: Employee = Depends(get_employee_profile),
) -> Leave:
    # Reject overlapping PENDING/APPROVED requests for the same employee.
    overlap = await db.scalar(
        select(Leave.id).where(
            Leave.employee_id == employee.id,
            Leave.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
            Leave.start_date <= payload.end_date,
            Leave.end_date >= payload.start_date,
        )
    )
    if overlap is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a pending or approved leave overlapping these dates.",
        )

    leave = Leave(
        employee_id=employee.id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
        status=LeaveStatus.PENDING,
    )
    db.add(leave)
    await db.commit()
    await db.refresh(leave)
    return leave


@router.get(
    "/",
    response_model=list[LeaveRead],
    summary="List leave requests (own for employees, all for HR/Admin)",
)
async def list_leaves(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[LeaveStatus] = Query(default=None, alias="status"),
    leave_type: Optional[str] = Query(default=None, description="SICK | CASUAL | PAID"),
    employee_id: Optional[int] = Query(
        default=None, gt=0, description="HR/Admin only filter"
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Leave]:
    stmt: Select = select(Leave).options(selectinload(Leave.employee))

    if current_user.role in (UserRole.HR, UserRole.ADMIN):
        if employee_id is not None:
            stmt = stmt.where(Leave.employee_id == employee_id)
    else:
        own = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
        if own is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee profile is linked to this account.",
            )
        stmt = stmt.where(Leave.employee_id == own.id)

    if status_filter is not None:
        stmt = stmt.where(Leave.status == status_filter)
    if leave_type:
        stmt = stmt.where(Leave.leave_type == leave_type.upper())

    stmt = stmt.order_by(Leave.created_at.desc()).offset(skip).limit(limit)
    return list((await db.scalars(stmt)).all())


@router.patch(
    "/{leave_id}/status",
    response_model=LeaveRead,
    summary="Approve or reject a leave request (HR/Admin)",
)
async def update_leave_status(
    leave_id: int,
    payload: LeaveStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Leave:
    leave = await db.scalar(
        select(Leave)
        .options(selectinload(Leave.employee).selectinload(Employee.user))
        .where(Leave.id == leave_id)
    )
    if leave is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request {leave_id} not found",
        )
    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only PENDING requests can be processed (current: {leave.status.value}).",
        )

    leave.status = payload.status
    # Trigger the notification before commit so it is atomic with the decision.
    await notify_leave_status(
        db,
        user_id=leave.employee.user_id,
        leave_type=leave.leave_type.value,
        start_date=str(leave.start_date),
        end_date=str(leave.end_date),
        status=payload.status.value,
        decided_by=current_user.username,
    )
    await db.commit()
    await db.refresh(leave)
    return leave
