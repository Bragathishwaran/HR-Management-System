"""Shift-aware attendance helpers (Module 14).

Shift times are interpreted in UTC, matching the rest of the attendance
module. A shift whose ``end_time`` is earlier than ``start_time`` crosses
midnight (for example Night 22:00 → 06:00).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Attendance,
    AttendanceStatus,
    Employee,
    EmployeeShift,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    Shift,
    ShiftName,
)
from app.services.notifications import create_notification

DEFAULT_SHIFTS: tuple[tuple[ShiftName, time, time], ...] = (
    (ShiftName.MORNING, time(9, 0), time(17, 0)),
    (ShiftName.EVENING, time(14, 0), time(22, 0)),
    (ShiftName.NIGHT, time(22, 0), time(6, 0)),
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def today_utc() -> date:
    return utc_now().date()


async def ensure_default_shifts(db: AsyncSession) -> None:
    """Seed the three standard shifts once (idempotent)."""
    existing = set((await db.scalars(select(Shift.name))).all())
    for name, start, end in DEFAULT_SHIFTS:
        if name not in existing:
            db.add(Shift(name=name, start_time=start, end_time=end))
    await db.flush()


async def get_assigned_shift(db: AsyncSession, employee_id: int) -> Shift | None:
    """Return the employee's assigned shift, if any."""
    return await db.scalar(
        select(Shift)
        .join(EmployeeShift, EmployeeShift.shift_id == Shift.id)
        .where(EmployeeShift.employee_id == employee_id)
    )


async def shift_map(db: AsyncSession) -> dict[int, Shift]:
    """Map employee id → assigned shift for a single query."""
    rows = (
        await db.execute(
            select(EmployeeShift.employee_id, Shift).join(
                Shift, Shift.id == EmployeeShift.shift_id
            )
        )
    ).all()
    return {employee_id: shift for employee_id, shift in rows}


def shift_window(shift: Shift | None, day: date) -> tuple[datetime, datetime]:
    """Scheduled start/end datetimes for *day* (falls back to global rules)."""
    if shift is None:
        start = datetime.combine(
            day, time(settings.work_start_hour, settings.work_start_minute)
        )
        return start, start + timedelta(hours=settings.standard_work_hours)

    start = datetime.combine(day, shift.start_time)
    end = datetime.combine(day, shift.end_time)
    if shift.end_time <= shift.start_time:
        end += timedelta(days=1)
    return start, end


def scheduled_start_for_check_in(shift: Shift | None, check_in: datetime) -> datetime:
    """Shift start matching a check-in, including after-midnight night shifts."""
    start, _ = shift_window(shift, check_in.date())
    if shift is not None and shift.end_time <= shift.start_time:
        if check_in.time() < shift.end_time:
            start -= timedelta(days=1)
    return start


def calculate_late_minutes(shift: Shift | None, check_in: datetime) -> int:
    """Minutes past the shift start after the configured grace period."""
    start = scheduled_start_for_check_in(shift, check_in)
    grace_cutoff = start + timedelta(minutes=settings.late_grace_minutes)
    if check_in <= grace_cutoff:
        return 0
    return max(0, int((check_in - start).total_seconds() // 60))


def calculate_early_exit_minutes(
    shift: Shift | None, attendance_date: date, check_out: datetime
) -> int:
    """Minutes left before the scheduled shift end (0 when not early)."""
    _, expected_end = shift_window(shift, attendance_date)
    if check_out >= expected_end:
        return 0
    return max(0, int((expected_end - check_out).total_seconds() // 60))


async def auto_process_attendance(
    db: AsyncSession,
    day: date,
    *,
    notify: bool = True,
) -> dict[str, object]:
    """Reconcile one day of attendance against assigned shift timings.

    - Creates ABSENT records for active employees whose shift grace window has
      passed (approved leave is skipped).
    - Recomputes late arrival / early exit flags for existing records.
    - Never commits: callers own the transaction.
    """
    now = utc_now()
    employees = list(
        (
            await db.scalars(
                select(Employee).where(Employee.status == EmployeeStatus.ACTIVE)
            )
        ).all()
    )
    employees_by_id = {employee.id: employee for employee in employees}
    shifts = await shift_map(db)
    records = {
        record.employee_id: record
        for record in (
            await db.scalars(select(Attendance).where(Attendance.date == day))
        ).all()
    }
    on_leave_ids = set(
        (
            await db.scalars(
                select(Leave.employee_id).where(
                    Leave.status == LeaveStatus.APPROVED,
                    Leave.start_date <= day,
                    Leave.end_date >= day,
                )
            )
        ).all()
    )

    processed = 0
    marked_absent = 0
    marked_late = 0
    marked_early_exit = 0
    skipped_on_leave = 0
    employee_ids: list[int] = []

    for employee_id, employee in employees_by_id.items():
        shift = shifts.get(employee_id)
        record = records.get(employee_id)

        if record is None:
            if employee_id in on_leave_ids:
                skipped_on_leave += 1
                continue
            start, _ = shift_window(shift, day)
            if now < start + timedelta(minutes=settings.late_grace_minutes):
                # Shift has not started yet — do not mark this employee absent.
                continue
            record = Attendance(
                employee_id=employee_id,
                date=day,
                status=AttendanceStatus.ABSENT,
                is_late=False,
                is_early_exit=False,
                shift_id=shift.id if shift is not None else None,
            )
            db.add(record)
            records[employee_id] = record
            processed += 1
            marked_absent += 1
            employee_ids.append(employee_id)
            if notify:
                await create_notification(
                    db,
                    user_id=employee.user_id,
                    title="Attendance marked absent",
                    message=(
                        f"No check-in was recorded for your "
                        f"{shift.name.value.lower() if shift else 'scheduled'} shift "
                        f"on {day}. Contact People Ops if this is incorrect."
                    ),
                    category="AUTOMATION",
                )
            continue

        changed = False
        if shift is not None:
            record.shift_id = shift.id

        if record.check_in is not None:
            late_minutes = calculate_late_minutes(shift, record.check_in)
            if late_minutes != (record.late_minutes or 0) or record.is_late != (
                late_minutes > 0
            ):
                changed = True
            if late_minutes > 0 and not record.is_late:
                marked_late += 1
                if notify:
                    await create_notification(
                        db,
                        user_id=employee.user_id,
                        title="Late arrival recorded",
                        message=(
                            f"You checked in {late_minutes} minute(s) after your "
                            f"scheduled shift start on {day}."
                        ),
                        category="ATTENDANCE",
                    )
            record.is_late = late_minutes > 0
            record.late_minutes = late_minutes or None

        if record.check_out is not None:
            early_minutes = calculate_early_exit_minutes(
                shift, record.date, record.check_out
            )
            if early_minutes != (record.early_exit_minutes or 0) or (
                record.is_early_exit != (early_minutes > 0)
            ):
                changed = True
            if early_minutes > 0 and not record.is_early_exit:
                marked_early_exit += 1
                if notify:
                    await create_notification(
                        db,
                        user_id=employee.user_id,
                        title="Early departure recorded",
                        message=(
                            f"You checked out {early_minutes} minute(s) before the "
                            f"scheduled end of your shift on {day}."
                        ),
                        category="ATTENDANCE",
                    )
            record.is_early_exit = early_minutes > 0
            record.early_exit_minutes = early_minutes or None

        if changed:
            processed += 1

    await db.flush()
    return {
        "date": day,
        "processed": processed,
        "marked_absent": marked_absent,
        "marked_late": marked_late,
        "marked_early_exit": marked_early_exit,
        "skipped_on_leave": skipped_on_leave,
        "employee_ids": employee_ids,
    }
