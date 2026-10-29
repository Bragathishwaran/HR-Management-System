"""Module 24 — Task Assignment & Tracking."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, InternalTask, User, UserRole
from app.schemas import InternalTaskCreate, InternalTaskRead, InternalTaskUpdateStatus

router = APIRouter(
    prefix="/tasks",
    tags=["Tasks"],
    dependencies=[Depends(get_current_user)],
)


async def _get_task_or_404(db: AsyncSession, task_id: int) -> InternalTask:
    task = await db.scalar(
        select(InternalTask)
        .options(
            selectinload(InternalTask.assigned_to_employee),
            selectinload(InternalTask.assigned_by_user),
        )
        .where(InternalTask.id == task_id)
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post("/", response_model=InternalTaskRead, status_code=status.HTTP_201_CREATED)
async def assign_task(
    payload: InternalTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> InternalTaskRead:
    employee = await db.get(Employee, payload.assigned_to_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    task = InternalTask(
        assigned_to_id=payload.assigned_to_id,
        assigned_by_id=current_user.id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
    )
    db.add(task)
    await db.commit()
    task = await _get_task_or_404(db, task.id)
    data = InternalTaskRead.model_validate(task).model_dump()
    if task.assigned_to_employee is not None:
        data["assigned_to_name"] = task.assigned_to_employee.full_name
    if task.assigned_by_user is not None:
        data["assigned_by_name"] = task.assigned_by_user.username
    return InternalTaskRead(**data)


@router.get("/", response_model=list[InternalTaskRead])
async def list_tasks(
    assigned_to_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InternalTaskRead]:
    stmt = select(InternalTask).options(
        selectinload(InternalTask.assigned_to_employee),
        selectinload(InternalTask.assigned_by_user),
    )
    if current_user.role == UserRole.EMPLOYEE:
        emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
        if emp is None:
            return []
        stmt = stmt.where(InternalTask.assigned_to_id == emp.id)
    elif assigned_to_id is not None:
        stmt = stmt.where(InternalTask.assigned_to_id == assigned_to_id)
    tasks = (await db.scalars(stmt.order_by(InternalTask.due_date))).all()
    result: list[InternalTaskRead] = []
    for task in tasks:
        data = InternalTaskRead.model_validate(task).model_dump()
        if task.assigned_to_employee is not None:
            data["assigned_to_name"] = task.assigned_to_employee.full_name
        if task.assigned_by_user is not None:
            data["assigned_by_name"] = task.assigned_by_user.username
        result.append(InternalTaskRead(**data))
    return result


@router.put("/{task_id}/status", response_model=InternalTaskRead)
async def update_task_status(
    task_id: int,
    payload: InternalTaskUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InternalTaskRead:
    task = await _get_task_or_404(db, task_id)
    if current_user.role == UserRole.EMPLOYEE:
        emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
        if emp is None or task.assigned_to_id != emp.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    elif current_user.role not in (UserRole.HR, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    task.status = payload.status
    await db.commit()
    task = await _get_task_or_404(db, task.id)
    data = InternalTaskRead.model_validate(task).model_dump()
    if task.assigned_to_employee is not None:
        data["assigned_to_name"] = task.assigned_to_employee.full_name
    if task.assigned_by_user is not None:
        data["assigned_by_name"] = task.assigned_by_user.username
    return InternalTaskRead(**data)
