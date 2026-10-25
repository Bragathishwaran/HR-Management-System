"""Leave policy and balance helpers (Module 11)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Employee, LeaveBalance, LeavePolicy, LeaveType


def default_policy_days() -> dict[LeaveType, int]:
    """Configured yearly allocations for every leave type."""
    return {
        LeaveType.SICK: settings.default_sick_leave_days,
        LeaveType.CASUAL: settings.default_casual_leave_days,
        LeaveType.PAID: settings.default_paid_leave_days,
    }


def leave_days(start_date: date, end_date: date) -> int:
    """Inclusive calendar-day span of a leave request."""
    return (end_date - start_date).days + 1


async def ensure_default_policies(db: AsyncSession) -> None:
    """Create any missing leave policies (flushed, not committed)."""
    existing = set(
        (await db.scalars(select(LeavePolicy.leave_type))).all()
    )
    for leave_type, total in default_policy_days().items():
        if leave_type not in existing:
            db.add(LeavePolicy(leave_type=leave_type, total_days_allowed=total))
    await db.flush()


async def get_policy_map(db: AsyncSession) -> dict[LeaveType, LeavePolicy]:
    """Return policies keyed by leave type, creating defaults if needed."""
    await ensure_default_policies(db)
    policies = (await db.scalars(select(LeavePolicy))).all()
    return {policy.leave_type: policy for policy in policies}


async def ensure_employee_balances(
    db: AsyncSession, employee_id: int
) -> list[LeaveBalance]:
    """Create missing balances for an employee using the current policies."""
    policies = await get_policy_map(db)
    existing = {
        balance.leave_type: balance
        for balance in (
            await db.scalars(
                select(LeaveBalance).where(LeaveBalance.employee_id == employee_id)
            )
        ).all()
    }
    balances: list[LeaveBalance] = []
    for leave_type, policy in policies.items():
        balance = existing.get(leave_type)
        if balance is None:
            balance = LeaveBalance(
                employee_id=employee_id,
                leave_type=leave_type,
                remaining_days=policy.total_days_allowed,
            )
            db.add(balance)
            existing[leave_type] = balance
        balances.append(balance)
    await db.flush()
    return balances


async def ensure_all_employee_balances(db: AsyncSession) -> None:
    """Backfill balances for every employee (used at startup)."""
    employee_ids = (await db.scalars(select(Employee.id))).all()
    for employee_id in employee_ids:
        await ensure_employee_balances(db, employee_id)


async def get_employee_balance(
    db: AsyncSession, employee_id: int, leave_type: LeaveType
) -> LeaveBalance:
    """Fetch (or lazily create) one employee's balance for a leave type."""
    await ensure_employee_balances(db, employee_id)
    balance = await db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.leave_type == leave_type,
        )
    )
    if balance is None:  # pragma: no cover - guarded by ensure_employee_balances
        raise RuntimeError("Leave balance could not be initialised")
    return balance
