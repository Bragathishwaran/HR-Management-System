"""Module 25 — Third-Party Integrations & Utilities."""

from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Employee, Payroll, User
from app.schemas import CalendarSyncRequest, CalendarSyncResponse, EmailNotificationRequest, ExportRequest, Message

router = APIRouter(
    prefix="/integrations",
    tags=["Integrations"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/email/send", response_model=Message)
async def send_email(
    payload: EmailNotificationRequest,
    current_user: User = Depends(require_staff),
) -> Message:
    # Integration placeholder - in production integrate with SMTP/SendGrid/SES
    return Message(detail=f"Email queued to {payload.to_email} with subject '{payload.subject}'")


@router.post("/calendar/sync", response_model=CalendarSyncResponse)
async def calendar_sync(
    payload: CalendarSyncRequest,
    current_user: User = Depends(require_staff),
) -> CalendarSyncResponse:
    # Integration placeholder for Google Calendar sync
    return CalendarSyncResponse(
        status="configured",
        provider=payload.provider,
        message=f"Calendar sync configured for {payload.provider} (calendar_id={payload.calendar_id or 'default'})",
    )


@router.post("/export")
async def export_report(
    payload: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    if payload.format == "csv" and payload.report_type == "employees":
        employees = (await db.scalars(select(Employee).order_by(Employee.full_name))).all()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Full Name", "Designation", "Department", "Joining Date", "Status"])
        for emp in employees:
            writer.writerow([emp.id, emp.full_name, emp.designation, emp.department, emp.joining_date, emp.status.value])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="employees_{datetime.now().strftime("%Y%m%d")}.csv"'},
        )
    elif payload.format == "csv" and payload.report_type == "payroll":
        payrolls = (await db.scalars(select(Payroll).order_by(Payroll.month))).all()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Employee ID", "Month", "Basic Salary", "Allowances", "Deductions", "Bonus", "Net Salary"])
        for p in payrolls:
            writer.writerow([p.id, p.employee_id, p.month, p.basic_salary, p.allowances, p.deductions, p.bonus, p.net_salary])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="payroll_{datetime.now().strftime("%Y%m%d")}.csv"'},
        )
    elif payload.format == "pdf":
        # PDF generation placeholder - can be enhanced with reportlab/weasyhtml
        content = f"PDF Export Report\nReport Type: {payload.report_type}\nGenerated: {datetime.now().isoformat()}\n\n[PDF content placeholder - integrate reportlab for full PDF generation]"
        return StreamingResponse(
            iter([content]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="report_{payload.report_type}_{datetime.now().strftime("%Y%m%d")}.pdf"'},
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported export format or report type")
