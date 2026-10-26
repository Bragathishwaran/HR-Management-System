"""Module 17 — performance reviews, ratings and historical feedback."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, PerformanceReview, User, UserRole
from app.schemas import (
    DepartmentRating,
    EmployeePerformanceSummary,
    PerformanceCreate,
    PerformanceRead,
    PerformanceUpdate,
    TeamPerformanceInsights,
)
from app.services.notifications import create_notification

router = APIRouter(
    prefix="/performance",
    tags=["Performance"],
    dependencies=[Depends(get_current_user)],
)


def _distribution(ratings: list[int]) -> dict[str, int]:
    return {str(value): ratings.count(value) for value in range(1, 6)}


def _average(ratings: list[int]) -> float:
    return round(sum(ratings) / len(ratings), 2) if ratings else 0.0


def _to_read(review: PerformanceReview) -> PerformanceRead:
    # ``PerformanceReview.reviewed_by`` is an ORM relationship; the response field
    # is the reviewer's username, so build the schema explicitly.
    return PerformanceRead(
        id=review.id,
        employee_id=review.employee_id,
        review_period=review.review_period,
        rating=review.rating,
        feedback=review.feedback,
        created_at=review.created_at,
        employee_name=(
            review.employee.full_name if review.employee is not None else None
        ),
        department=(
            review.employee.department if review.employee is not None else None
        ),
        reviewed_by=(
            review.reviewed_by.username
            if review.reviewed_by is not None
            else None
        ),
    )


async def _load_review(
    db: AsyncSession, review_id: int
) -> PerformanceReview | None:
    return await db.scalar(
        select(PerformanceReview)
        .options(
            selectinload(PerformanceReview.employee),
            selectinload(PerformanceReview.reviewed_by),
        )
        .where(PerformanceReview.id == review_id)
    )


async def _own_employee(db: AsyncSession, user: User) -> Employee:
    employee = await db.scalar(select(Employee).where(Employee.user_id == user.id))
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee profile is linked to this account.",
        )
    return employee


def _assert_can_view(review: PerformanceReview, user: User, own_id: int | None) -> None:
    if user.role in (UserRole.HR, UserRole.ADMIN):
        return
    if own_id is None or review.employee_id != own_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Performance review {review.id} not found",
        )


@router.post(
    "/",
    response_model=PerformanceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a performance review (HR/Admin)",
)
async def create_review(
    payload: PerformanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> PerformanceRead:
    employee = await db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {payload.employee_id} not found",
        )
    review_period = payload.review_period.strip()
    duplicate = await db.scalar(
        select(PerformanceReview.id).where(
            PerformanceReview.employee_id == employee.id,
            PerformanceReview.review_period == review_period,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"A review for {employee.full_name} in {review_period} already "
                "exists. Edit the existing review instead."
            ),
        )

    review = PerformanceReview(
        employee_id=employee.id,
        review_period=review_period,
        rating=payload.rating,
        feedback=payload.feedback.strip(),
        reviewed_by_id=current_user.id,
    )
    db.add(review)
    await create_notification(
        db,
        user_id=employee.user_id,
        title="New performance review",
        message=(
            f"Your {review_period} performance review is available: "
            f"{payload.rating}/5. Open Performance to read the feedback."
        ),
        category="PERFORMANCE",
    )
    await db.commit()
    review = await _load_review(db, review.id)
    assert review is not None
    return _to_read(review)


@router.get(
    "/",
    response_model=list[PerformanceRead],
    summary="Performance reviews (own for employees, filterable for HR/Admin)",
)
async def list_reviews(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    employee_id: Optional[int] = Query(default=None, gt=0),
    review_period: Optional[str] = Query(default=None, max_length=40),
    min_rating: Optional[int] = Query(default=None, ge=1, le=5),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[PerformanceRead]:
    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)
    stmt = select(PerformanceReview).options(
        selectinload(PerformanceReview.employee),
        selectinload(PerformanceReview.reviewed_by),
    )
    if is_staff:
        if employee_id is not None:
            stmt = stmt.where(PerformanceReview.employee_id == employee_id)
    else:
        own = await _own_employee(db, current_user)
        stmt = stmt.where(PerformanceReview.employee_id == own.id)
    if review_period:
        stmt = stmt.where(PerformanceReview.review_period == review_period.strip())
    if min_rating is not None:
        stmt = stmt.where(PerformanceReview.rating >= min_rating)

    stmt = stmt.order_by(
        PerformanceReview.created_at.desc(), PerformanceReview.id.desc()
    ).offset(skip).limit(limit)
    reviews = list((await db.scalars(stmt)).all())
    return [_to_read(review) for review in reviews]


@router.get(
    "/summary/team",
    response_model=TeamPerformanceInsights,
    summary="Team-wide performance insights (HR/Admin)",
)
async def team_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
    department: Optional[str] = Query(default=None, max_length=120),
) -> TeamPerformanceInsights:
    stmt = select(PerformanceReview.rating).join(
        Employee, Employee.id == PerformanceReview.employee_id
    )
    if department:
        stmt = stmt.where(Employee.department.ilike(department.strip()))
    ratings = [int(value) for value in (await db.scalars(stmt)).all()]

    department_stmt = (
        select(
            Employee.department,
            func.avg(PerformanceReview.rating),
            func.count(PerformanceReview.id),
        )
        .join(Employee, Employee.id == PerformanceReview.employee_id)
    )
    if department:
        department_stmt = department_stmt.where(
            Employee.department.ilike(department.strip())
        )
    department_rows = (
        await db.execute(
            department_stmt.group_by(Employee.department).order_by(
                func.avg(PerformanceReview.rating).desc()
            )
        )
    ).all()

    return TeamPerformanceInsights(
        average_rating=_average(ratings),
        total_reviews=len(ratings),
        rating_distribution=_distribution(ratings),
        departments=[
            DepartmentRating(
                department=name,
                average_rating=round(float(average or 0), 2),
                reviews=int(count),
            )
            for name, average, count in department_rows
        ],
    )


@router.get(
    "/summary/{employee_id}",
    response_model=EmployeePerformanceSummary,
    summary="Performance summary for one employee",
)
async def employee_summary(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeePerformanceSummary:
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {employee_id} not found",
        )
    if current_user.role not in (UserRole.HR, UserRole.ADMIN):
        own = await _own_employee(db, current_user)
        if own.id != employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own performance summary.",
            )

    reviews = list(
        (
            await db.scalars(
                select(PerformanceReview)
                .where(PerformanceReview.employee_id == employee_id)
                .order_by(PerformanceReview.created_at.desc())
            )
        ).all()
    )
    ratings = [review.rating for review in reviews]
    return EmployeePerformanceSummary(
        employee_id=employee.id,
        employee_name=employee.full_name,
        average_rating=_average(ratings),
        reviews=len(ratings),
        latest_rating=ratings[0] if ratings else None,
        rating_distribution=_distribution(ratings),
    )


@router.get(
    "/{review_id}",
    response_model=PerformanceRead,
    summary="View a performance review (owner or HR/Admin)",
)
async def get_review(
    review_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PerformanceRead:
    review = await _load_review(db, review_id)
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Performance review {review_id} not found",
        )
    own = None
    if current_user.role not in (UserRole.HR, UserRole.ADMIN):
        own = await _own_employee(db, current_user)
    _assert_can_view(review, current_user, own.id if own is not None else None)
    return _to_read(review)


@router.patch(
    "/{review_id}",
    response_model=PerformanceRead,
    summary="Update a performance review (HR/Admin)",
)
async def update_review(
    review_id: int,
    payload: PerformanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> PerformanceRead:
    review = await _load_review(db, review_id)
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Performance review {review_id} not found",
        )
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update.",
        )
    if "review_period" in updates and updates["review_period"] is not None:
        updates["review_period"] = updates["review_period"].strip()
        duplicate = await db.scalar(
            select(PerformanceReview.id).where(
                PerformanceReview.employee_id == review.employee_id,
                PerformanceReview.review_period == updates["review_period"],
                PerformanceReview.id != review.id,
            )
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another review for this employee already uses that period.",
            )
    if "feedback" in updates and updates["feedback"] is not None:
        updates["feedback"] = updates["feedback"].strip()

    for field, value in updates.items():
        setattr(review, field, value)
    await db.commit()
    review = await _load_review(db, review.id)
    assert review is not None
    return _to_read(review)


@router.delete(
    "/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a performance review (HR/Admin)",
)
async def delete_review(
    review_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Response:
    review = await _load_review(db, review_id)
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Performance review {review_id} not found",
        )
    await db.delete(review)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
