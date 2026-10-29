"""Module 26 — Employee Feedback System."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, Feedback, User, UserRole
from app.schemas import FeedbackCreate, FeedbackRead, FeedbackSummary

router = APIRouter(
    prefix="/feedback",
    tags=["Feedback"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/", response_model=FeedbackRead, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    payload: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeedbackRead:
    emp = await db.scalar(select(Employee).where(Employee.user_id == current_user.id))
    feedback = Feedback(
        employee_id=emp.id if emp is not None and not payload.is_anonymous else (None if payload.is_anonymous else (emp.id if emp else None)),
        message=payload.message,
        rating=payload.rating,
        is_anonymous=payload.is_anonymous,
    )
    if payload.is_anonymous:
        feedback.employee_id = None
    db.add(feedback)
    await db.commit()
    feedback = await db.scalar(
        select(Feedback).options(selectinload(Feedback.employee)).where(Feedback.id == feedback.id)
    )  # type: ignore
    data = FeedbackRead.model_validate(feedback).model_dump()
    if feedback.employee is not None and not feedback.is_anonymous:
        data["employee_name"] = feedback.employee.full_name
    return FeedbackRead(**data)


@router.get("/", response_model=list[FeedbackRead])
async def list_feedback(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> list[FeedbackRead]:
    feedback_list = (
        await db.scalars(
            select(Feedback)
            .options(selectinload(Feedback.employee))
            .order_by(Feedback.created_at.desc())
        )
    ).all()
    result: list[FeedbackRead] = []
    for fb in feedback_list:
        data = FeedbackRead.model_validate(fb).model_dump()
        if fb.employee is not None and not fb.is_anonymous:
            data["employee_name"] = fb.employee.full_name
        else:
            data["employee_name"] = "Anonymous" if fb.is_anonymous else None
        result.append(FeedbackRead(**data))
    return result


@router.get("/summary", response_model=FeedbackSummary)
async def feedback_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> FeedbackSummary:
    total = await db.scalar(select(func.count()).select_from(Feedback)) or 0
    avg = await db.scalar(select(func.avg(Feedback.rating))) or 0.0
    dist = {}
    for r in range(1, 6):
        cnt = await db.scalar(select(func.count()).select_from(Feedback).where(Feedback.rating == r)) or 0
        dist[str(r)] = cnt
    return FeedbackSummary(total=int(total), average_rating=round(float(avg), 2), rating_distribution=dist)
