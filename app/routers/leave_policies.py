"""Module 11 — Leave policies (organisation-wide yearly allocations)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import LeavePolicy, LeaveType, User
from app.schemas import LeavePolicyCreate, LeavePolicyRead, LeavePolicyUpdate
from app.services.leave_balances import ensure_default_policies

router = APIRouter(
    prefix="/leave-policies",
    tags=["Leave Policies"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "/",
    response_model=list[LeavePolicyRead],
    summary="View leave policies",
)
async def list_policies(db: AsyncSession = Depends(get_db)) -> list[LeavePolicy]:
    await ensure_default_policies(db)
    await db.commit()
    return list(
        (await db.scalars(select(LeavePolicy).order_by(LeavePolicy.leave_type))).all()
    )


@router.post(
    "/",
    response_model=LeavePolicyRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a leave policy (HR/Admin)",
)
async def create_policy(
    payload: LeavePolicyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> LeavePolicy:
    existing = await db.scalar(
        select(LeavePolicy).where(LeavePolicy.leave_type == payload.leave_type)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A policy for {payload.leave_type.value} already exists.",
        )
    policy = LeavePolicy(
        leave_type=payload.leave_type,
        total_days_allowed=payload.total_days_allowed,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.put(
    "/{leave_type}",
    response_model=LeavePolicyRead,
    summary="Update a leave policy allocation (HR/Admin)",
)
async def update_policy(
    leave_type: LeaveType,
    payload: LeavePolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> LeavePolicy:
    policy = await db.scalar(
        select(LeavePolicy).where(LeavePolicy.leave_type == leave_type)
    )
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No policy configured for {leave_type.value}.",
        )
    policy.total_days_allowed = payload.total_days_allowed
    await db.commit()
    await db.refresh(policy)
    return policy
