"""Seed the database with demo users, employees, attendance, leaves and payroll.

Usage:
    python -m scripts.seed_demo

Accounts created (password for all: "Passw0rd!123"):
    admin1   / ADMIN   admin1@worksphere.io
    hr1      / HR      hr1@worksphere.io
    alice    / EMPLOYEE alice@worksphere.io
    bob      / EMPLOYEE bob@worksphere.io
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal, init_db
from app.models import (
    Attendance,
    AttendanceStatus,
    Employee,
    EmployeeStatus,
    Leave,
    LeaveStatus,
    LeaveType,
    Payroll,
    User,
    UserRole,
    utcnow,
)
from app.security import hash_password
from app.services.leave_balances import ensure_default_policies, ensure_employee_balances

PASSWORD = "Passw0rd!123"


async def get_or_create_user(db, username: str, email: str, role: UserRole) -> User:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(PASSWORD),
            role=role,
            created_at=utcnow(),
        )
        db.add(user)
        await db.flush()
    return user


async def get_or_create_employee(db, user: User, **kwargs) -> Employee:
    employee = await db.scalar(select(Employee).where(Employee.user_id == user.id))
    if employee is None:
        employee = Employee(user_id=user.id, **kwargs)
        db.add(employee)
        await db.flush()
    return employee


async def seed() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        await ensure_default_policies(db)
        admin = await get_or_create_user(db, "admin1", "admin1@worksphere.io", UserRole.ADMIN)
        hr = await get_or_create_user(db, "hr1", "hr1@worksphere.io", UserRole.HR)
        alice_user = await get_or_create_user(db, "alice", "alice@worksphere.io", UserRole.EMPLOYEE)
        bob_user = await get_or_create_user(db, "bob", "bob@worksphere.io", UserRole.EMPLOYEE)

        alice = await get_or_create_employee(
            db,
            alice_user,
            full_name="Alice Sharma",
            designation="Senior Engineer",
            department="Engineering",
            joining_date=date(2024, 3, 1),
            salary=95000.0,
            status=EmployeeStatus.ACTIVE,
        )
        bob = await get_or_create_employee(
            db,
            bob_user,
            full_name="Bob Verma",
            designation="Recruiter",
            department="Human Resources",
            joining_date=date(2025, 1, 15),
            salary=60000.0,
            status=EmployeeStatus.ACTIVE,
        )

        await ensure_employee_balances(db, alice.id)
        await ensure_employee_balances(db, bob.id)

        today = datetime.now().date()
        if not await db.scalar(
            select(Attendance.id).where(Attendance.employee_id == alice.id, Attendance.date == today)
        ):
            db.add(
                Attendance(
                    employee_id=alice.id,
                    check_in=datetime(today.year, today.month, today.day, 9, 15),
                    check_out=datetime(today.year, today.month, today.day, 18, 0),
                    date=today,
                    status=AttendanceStatus.PRESENT,
                    working_hours=8.75,
                    is_late=False,
                    late_minutes=0,
                    overtime_hours=0.75,
                )
            )

        if not await db.scalar(select(Leave.id).where(Leave.employee_id == bob.id)):
            db.add(
                Leave(
                    employee_id=bob.id,
                    leave_type=LeaveType.SICK,
                    start_date=today + timedelta(days=7),
                    end_date=today + timedelta(days=8),
                    reason="Medical appointment",
                    status=LeaveStatus.PENDING,
                )
            )

        month = today.strftime("%B-%Y")
        if not await db.scalar(
            select(Payroll.id).where(Payroll.employee_id == alice.id, Payroll.month == month)
        ):
            db.add(
                Payroll(
                    employee_id=alice.id,
                    basic_salary=95000.0,
                    allowances=3000.0,
                    deductions=5000.0,
                    bonus=7500.0,
                    net_salary=100500.0,
                    month=month,
                    created_at=utcnow(),
                )
            )

        await db.commit()
        print("Seed complete.")
        print(f"  admin1 / hr1 / alice / bob  (password: {PASSWORD})")
        print(f"  Users: admin={admin.username}, hr={hr.username}")
        print(f"  Employees: {alice.full_name}, {bob.full_name}")


if __name__ == "__main__":
    asyncio.run(seed())
