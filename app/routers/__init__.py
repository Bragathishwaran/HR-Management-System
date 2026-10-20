"""HTTP routers for the WorkSphere HRMS API."""

from app.routers import (
    attendance,
    auth,
    dashboard,
    employees,
    leaves,
    notifications,
    payroll,
)

__all__ = ["auth", "employees", "attendance", "leaves", "payroll", "dashboard", "notifications"]
