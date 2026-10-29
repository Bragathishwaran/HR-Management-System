"""Module 21 — Employee Onboarding System."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, OnboardingTask, User, UserRole
from app.schemas import OnboardingTaskCreate, OnboardingTaskRead, OnboardingTaskUpdate

router = APIRouter(
    prefix="/onboarding",
    tags=["Onboarding"],
    dependencies=[Depends(get_current_user)],
)


async def _get_task_or_404(db: AsyncSession, task_id: int) -> OnboardingTask:
    task = await db.scalar(
        select(OnboardingTask)
        .options(selectinload(OnboardingTask.employee))
        .where(OnboardingTask.id == task_id)
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding task not found")
    return task


@router.post("/", response_model=OnboardingTaskRead, status_code=status.HTTP_201_CREATED)
async def create_onboarding_task(
    payload: OnboardingTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> OnboardingTaskRead:
    employee = await db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    task = OnboardingTask(
        employee_id=payload.employee_id,
        task_name=payload.task_name,
        status=payload.status,
        due_date=payload.due_date,
    )
    db.add(task)
    await db.commit()
    task = await _get_task_or_404(db, task.id)
    data = OnboardingTaskRead.model_validate(task).model_dump()
    if task.employee is not None:
        data["employee_name"] = task.employee.full_name
    return OnboardingTaskRead(**data)


@router.get("/", response_model=list[OnboardingTaskRead])
async def list_onboarding_tasks(
    employee_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OnboardingTaskRead]:
    stmt = select(OnboardingTask).options(selectinload(OnboardingTask.employee))
    if current_user.role == UserRole.EMPLOYEE:
        emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
        if emp is None:
            return []
        stmt = stmt.where(OnboardingTask.employee_id == emp.id)
    elif employee_id is not None:
        stmt = stmt.where(OnboardingTask.employee_id == employee_id)
    tasks = (await db.scalars(stmt.order_by(OnboardingTask.due_date))).all()
    result: list[OnboardingTaskRead] = []
    for task in tasks:
        data = OnboardingTaskRead.model_validate(task).model_dump()
        if task.employee is not None:
            data["employee_name"] = task.employee.full_name
        result.append(OnboardingTaskRead(**data))
    return result


@router.get("/me/progress", response_model=dict)
async def onboarding_progress(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
    if emp is None:
        return {"total": 0, "completed": 0, "pending": 0, "progress_percent": 0.0}
    tasks = (await db.scalars(select(OnboardingTask).where(OnboardingTask.employee_id == emp.id))).all()
    total = len(tasks)
    completed = sum(1 for t in tasks if t.status.value == "COMPLETED")
    pending = total - completed
    progress_percent = round((completed / total * 100.0), 2) if total > 0 else 0.0
    return {"total": total, "completed": completed, "pending": pending, "progress_percent": progress_percent}


@router.put("/{task_id}", response_model=OnboardingTaskRead)
async def update_onboarding_task(
    task_id: int,
    payload: OnboardingTaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OnboardingTaskRead:
    task = await _get_task_or_404(db, task_id)
    if current_user.role == UserRole.EMPLOYEE:
        emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
        if emp is None or task.employee_id != emp.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        # employees can only update status
        updates = payload.model_dump(exclude_unset=True)
        if set(updates.keys()) - {"status"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Employees can only update status")
    elif current_user.role not in (UserRole.HR, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(task, field, value)
    await db.commit()
    task = await _get_task_or_404(db, task.id)
    data = OnboardingTaskRead.model_validate(task).model_dump()
    if task.employee is not None:
        data["employee_name"] = task.employee.full_name
    return OnboardingTaskRead(**data)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_onboarding_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    task = await _get_task_or_404(db, task_id)
    await db.delete(task)
    await db.commit()
    return None
