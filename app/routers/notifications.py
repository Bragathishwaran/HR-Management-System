"""Module 7 — Notifications System (list + mark as read)."""

from __future__ import annotations

from datetime import date as date_type
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import (
    Attendance,
    Document,
    Employee,
    Leave,
    LeaveStatus,
    Notification,
    User,
)
from app.schemas import (
    AlertRunResponse,
    DocumentRead,
    NotificationAlertSummary,
    NotificationListResponse,
    NotificationRead,
    NotificationReadAllResponse,
)
from app.services.notifications import (
    alert_already_sent,
    count_unread,
    create_notification,
)
from app.services.shifts import today_utc

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "/",
    response_model=NotificationListResponse,
    summary="Fetch notifications for the current user",
)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    unread_only: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> NotificationListResponse:
    base = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        base = base.where(Notification.is_read.is_(False))

    total = int(
        await db.scalar(
            select(func.count()).select_from(base.subquery())
        )
        or 0
    )
    unread = await count_unread(db, current_user.id)

    rows = await db.scalars(
        base.order_by(Notification.is_read, Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return NotificationListResponse(
        total=total,
        unread=unread,
        items=[NotificationRead.model_validate(row) for row in rows],
    )


@router.patch(
    "/read-all",
    response_model=NotificationReadAllResponse,
    summary="Mark every notification as read",
)
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationReadAllResponse:
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
    return NotificationReadAllResponse(updated=int(result.rowcount or 0))


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationRead,
    summary="Mark a notification as read",
)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Notification:
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != current_user.id:
        # 404 for both missing and foreign notifications — no data leakage.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification {notification_id} not found",
        )
    if not notification.is_read:
        notification.is_read = True
        await db.commit()
        await db.refresh(notification)
    return notification


# ---------------------------------------------------------------------------
# Module 19 — smart alerts
# ---------------------------------------------------------------------------
def _document_read(document: Document) -> DocumentRead:
    # The ORM relationship is named ``uploaded_by``; the response field is the
    # uploader's username, so map explicitly.
    return DocumentRead(
        id=document.id,
        employee_id=document.employee_id,
        file_name=document.file_name,
        file_url=document.file_url,
        document_type=document.document_type,
        content_type=document.content_type,
        file_size=document.file_size,
        expiry_date=document.expiry_date,
        uploaded_at=document.uploaded_at,
        employee_name=(
            document.employee.full_name if document.employee is not None else None
        ),
        uploaded_by=(
            document.uploaded_by.username
            if document.uploaded_by is not None
            else None
        ),
    )


@router.get(
    "/alerts/summary",
    response_model=NotificationAlertSummary,
    summary="Smart alert counters for HR/Admin",
)
async def alert_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> NotificationAlertSummary:
    today = today_utc()
    unread = await count_unread(db, current_user.id)
    late_today = int(
        await db.scalar(
            select(func.count())
            .select_from(Attendance)
            .where(Attendance.date == today, Attendance.is_late.is_(True))
        )
        or 0
    )
    pending_leave_requests = int(
        await db.scalar(
            select(func.count())
            .select_from(Leave)
            .where(Leave.status == LeaveStatus.PENDING)
        )
        or 0
    )
    expiry_cutoff = today + timedelta(days=settings.document_expiry_warning_days)
    documents = list(
        (
            await db.scalars(
                select(Document)
                .options(
                    selectinload(Document.employee),
                    selectinload(Document.uploaded_by),
                )
                .where(
                    Document.expiry_date.is_not(None),
                    Document.expiry_date >= today,
                    Document.expiry_date <= expiry_cutoff,
                )
                .order_by(Document.expiry_date)
                .limit(10)
            )
        ).all()
    )
    expiring_count = int(
        await db.scalar(
            select(func.count())
            .select_from(Document)
            .where(
                Document.expiry_date.is_not(None),
                Document.expiry_date >= today,
                Document.expiry_date <= expiry_cutoff,
            )
        )
        or 0
    )
    return NotificationAlertSummary(
        unread=unread,
        late_today=late_today,
        pending_leave_requests=pending_leave_requests,
        documents_expiring=expiring_count,
        upcoming_document_expiries=[_document_read(document) for document in documents],
    )


@router.post(
    "/alerts/late-attendance",
    response_model=AlertRunResponse,
    summary="Send late-arrival alerts for a day (HR/Admin)",
)
async def run_late_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
    day: Optional[date_type] = Query(default=None, alias="date"),
) -> AlertRunResponse:
    target = day or today_utc()
    records = list(
        (
            await db.scalars(
                select(Attendance)
                .options(selectinload(Attendance.employee))
                .where(Attendance.date == target, Attendance.is_late.is_(True))
            )
        ).all()
    )
    created = 0
    skipped = 0
    for record in records:
        employee = record.employee
        if employee is None:
            continue
        dedupe = f"late-attendance:{record.id}"
        if await alert_already_sent(db, user_id=employee.user_id, dedupe_key=dedupe):
            skipped += 1
            continue
        await create_notification(
            db,
            user_id=employee.user_id,
            title="Late arrival alert",
            message=(
                f"Your check-in on {target} was {record.late_minutes or 0} minute(s) "
                "after your scheduled shift start."
            ),
            category="ATTENDANCE",
            dedupe_key=dedupe,
        )
        created += 1
    await db.commit()
    return AlertRunResponse(
        created=created,
        skipped=skipped,
        message=(
            f"{created} late-arrival alert(s) sent"
            + (f"; {skipped} already delivered." if skipped else ".")
        ),
    )


@router.post(
    "/alerts/document-expiry",
    response_model=AlertRunResponse,
    summary="Send document-expiry alerts (HR/Admin)",
)
async def run_document_expiry_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
    days: Optional[int] = Query(default=None, ge=1, le=365),
) -> AlertRunResponse:
    today = today_utc()
    horizon = days or settings.document_expiry_warning_days
    cutoff = today + timedelta(days=horizon)
    documents = list(
        (
            await db.scalars(
                select(Document)
                .options(selectinload(Document.employee))
                .where(
                    Document.expiry_date.is_not(None),
                    Document.expiry_date >= today,
                    Document.expiry_date <= cutoff,
                )
                .order_by(Document.expiry_date)
            )
        ).all()
    )
    created = 0
    skipped = 0
    for document in documents:
        employee = document.employee
        if employee is None:
            continue
        dedupe = f"document-expiry:{document.id}:{document.expiry_date}"
        if await alert_already_sent(db, user_id=employee.user_id, dedupe_key=dedupe):
            skipped += 1
            continue
        await create_notification(
            db,
            user_id=employee.user_id,
            title="Document expiry reminder",
            message=(
                f"Your document '{document.file_name}' expires on "
                f"{document.expiry_date}. Please upload a renewed copy."
            ),
            category="DOCUMENT",
            dedupe_key=dedupe,
        )
        created += 1
    await db.commit()
    return AlertRunResponse(
        created=created,
        skipped=skipped,
        message=(
            f"{created} document expiry alert(s) sent within {horizon} day(s)"
            + (f"; {skipped} already delivered." if skipped else ".")
        ),
    )


@router.post(
    "/alerts/run-all",
    response_model=AlertRunResponse,
    summary="Run all smart alert scans (HR/Admin)",
)
async def run_all_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> AlertRunResponse:
    today = today_utc()
    late_records = list(
        (
            await db.scalars(
                select(Attendance)
                .options(selectinload(Attendance.employee))
                .where(Attendance.date == today, Attendance.is_late.is_(True))
            )
        ).all()
    )
    cutoff = today + timedelta(days=settings.document_expiry_warning_days)
    documents = list(
        (
            await db.scalars(
                select(Document)
                .options(selectinload(Document.employee))
                .where(
                    Document.expiry_date.is_not(None),
                    Document.expiry_date >= today,
                    Document.expiry_date <= cutoff,
                )
            )
        ).all()
    )

    created = 0
    skipped = 0
    for record in late_records:
        if record.employee is None:
            continue
        dedupe = f"late-attendance:{record.id}"
        if await alert_already_sent(
            db, user_id=record.employee.user_id, dedupe_key=dedupe
        ):
            skipped += 1
            continue
        await create_notification(
            db,
            user_id=record.employee.user_id,
            title="Late arrival alert",
            message=(
                f"Your check-in on {today} was {record.late_minutes or 0} minute(s) "
                "after your scheduled shift start."
            ),
            category="ATTENDANCE",
            dedupe_key=dedupe,
        )
        created += 1

    for document in documents:
        if document.employee is None:
            continue
        dedupe = f"document-expiry:{document.id}:{document.expiry_date}"
        if await alert_already_sent(
            db, user_id=document.employee.user_id, dedupe_key=dedupe
        ):
            skipped += 1
            continue
        await create_notification(
            db,
            user_id=document.employee.user_id,
            title="Document expiry reminder",
            message=(
                f"Your document '{document.file_name}' expires on "
                f"{document.expiry_date}. Please upload a renewed copy."
            ),
            category="DOCUMENT",
            dedupe_key=dedupe,
        )
        created += 1

    await db.commit()
    return AlertRunResponse(
        created=created,
        skipped=skipped,
        message=f"Alert scan complete: {created} sent, {skipped} skipped.",
    )
