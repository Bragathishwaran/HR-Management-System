"""Module 22 — Resignation & Exit Management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, Resignation, User, UserRole
from app.schemas import ResignationCreate, ResignationRead, ResignationStatusUpdate

router = APIRouter(
    prefix="/resignations",
    tags=["Resignations"],
    dependencies=[Depends(get_current_user)],
)


async def _get_resignation_or_404(db: AsyncSession, resignation_id: int) -> Resignation:
    res = await db.scalar(
        select(Resignation)
        .options(selectinload(Resignation.employee))
        .where(Resignation.id == resignation_id)
    )
    if res is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resignation not found")
    return res


@router.post("/", response_model=ResignationRead, status_code=status.HTTP_201_CREATED)
async def submit_resignation(
    payload: ResignationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResignationRead:
    emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")
    existing = await db.scalar(
        select(Resignation).where(
            Resignation.employee_id == emp.id, Resignation.status == "PENDING"
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a pending resignation")
    resignation = Resignation(
        employee_id=emp.id,
        reason=payload.reason,
        notice_period=payload.notice_period,
    )
    db.add(resignation)
    await db.commit()
    res = await _get_resignation_or_404(db, resignation.id)
    data = ResignationRead.model_validate(res).model_dump()
    if res.employee is not None:
        data["employee_name"] = res.employee.full_name
        data["department"] = res.employee.department
    return ResignationRead(**data)


@router.get("/", response_model=list[ResignationRead])
async def list_resignations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ResignationRead]:
    stmt = select(Resignation).options(selectinload(Resignation.employee))
    if current_user.role == UserRole.EMPLOYEE:
        emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
        if emp is None:
            return []
        stmt = stmt.where(Resignation.employee_id == emp.id)
    res_list = (await db.scalars(stmt.order_by(Resignation.created_at.desc()))).all()
    result: list[ResignationRead] = []
    for res in res_list:
        data = ResignationRead.model_validate(res).model_dump()
        if res.employee is not None:
            data["employee_name"] = res.employee.full_name
            data["department"] = res.employee.department
        result.append(ResignationRead(**data))
    return result


@router.put("/{resignation_id}/status", response_model=ResignationRead)
async def update_resignation_status(
    resignation_id: int,
    payload: ResignationStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> ResignationRead:
    res = await _get_resignation_or_404(db, resignation_id)
    res.status = payload.status
    await db.commit()
    res = await _get_resignation_or_404(db, res.id)
    data = ResignationRead.model_validate(res).model_dump()
    if res.employee is not None:
        data["employee_name"] = res.employee.full_name
        data["department"] = res.employee.department
    return ResignationRead(**data)
