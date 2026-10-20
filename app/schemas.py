"""Pydantic v2 request/response schemas for every module."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import (
    AttendanceStatus,
    EmployeeStatus,
    LeaveStatus,
    LeaveType,
    UserRole,
)

# "October-2026" / "Oct-2026"
MONTH_PATTERN = r"^[A-Za-z]{3,9}-\d{4}$"
USERNAME_PATTERN = r"^[A-Za-z0-9_.-]+$"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class UserCredentials(BaseModel):
    """Credentials used to create or authenticate a user."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=50, pattern=USERNAME_PATTERN)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserRegister(UserCredentials):
    """POST /auth/register payload."""

    role: UserRole = UserRole.EMPLOYEE


class UserRead(BaseModel):
    """Safe user representation (never exposes the hash)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    role: UserRole
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------
class EmployeeCreate(BaseModel):
    """Create an employee; link an existing user OR create a fresh account."""

    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=120)
    designation: str = Field(min_length=2, max_length=120)
    department: str = Field(min_length=2, max_length=120)
    joining_date: date
    salary: float = Field(gt=0, le=10_000_000)
    status: EmployeeStatus = EmployeeStatus.ACTIVE
    user_id: Optional[int] = Field(default=None, gt=0)
    user_credentials: Optional[UserCredentials] = None

    @model_validator(mode="after")
    def exactly_one_user_source(self) -> "EmployeeCreate":
        if self.user_id is None and self.user_credentials is None:
            raise ValueError("Provide either user_id or user_credentials to link an account.")
        if self.user_id is not None and self.user_credentials is not None:
            raise ValueError("Provide only one of user_id or user_credentials.")
        return self


class EmployeeUpdate(BaseModel):
    """Partial update of employee details (HR/Admin)."""

    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    designation: Optional[str] = Field(default=None, min_length=2, max_length=120)
    department: Optional[str] = Field(default=None, min_length=2, max_length=120)
    joining_date: Optional[date] = None
    salary: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    status: Optional[EmployeeStatus] = None


class EmployeeRead(BaseModel):
    """Employee profile. ``salary`` is masked (None) for non-HR/Admin viewers."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    full_name: str
    designation: str
    department: str
    joining_date: date
    salary: Optional[float] = None
    status: EmployeeStatus
    username: Optional[str] = None
    email: Optional[EmailStr] = None


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------
class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    working_hours: Optional[float] = None
    status: AttendanceStatus


class CheckInOutResponse(BaseModel):
    """Result of a check-in/check-out action."""

    attendance: AttendanceRead
    message: str


# ---------------------------------------------------------------------------
# Leaves
# ---------------------------------------------------------------------------
class LeaveApply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def validate_date_range(self) -> "LeaveApply":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class LeaveStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: LeaveStatus

    @model_validator(mode="after")
    def only_approve_or_reject(self) -> "LeaveStatusUpdate":
        if self.status not in (LeaveStatus.APPROVED, LeaveStatus.REJECTED):
            raise ValueError("status must be APPROVED or REJECTED")
        return self


class LeaveRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str
    status: LeaveStatus
    created_at: datetime


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------
class PayrollGenerate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: int = Field(gt=0)
    month: str = Field(pattern=MONTH_PATTERN, examples=["October-2026"])
    # When omitted, the employee's contractual salary is used.
    basic_salary: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    deductions: float = Field(default=0.0, ge=0, le=10_000_000)
    bonus: float = Field(default=0.0, ge=0, le=10_000_000)

    @model_validator(mode="after")
    def net_salary_non_negative(self) -> "PayrollGenerate":
        basic = self.basic_salary if self.basic_salary is not None else 0.0
        if basic + self.bonus - self.deductions < 0:
            raise ValueError("deductions cannot exceed basic_salary + bonus")
        return self


class PayrollRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    basic_salary: float
    deductions: float
    bonus: float
    net_salary: float
    month: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
class PayrollOverview(BaseModel):
    month: str
    total_net_salary: float
    records_generated: int


class DashboardStats(BaseModel):
    total_employees: int
    active_employees: int
    present_today: int
    half_day_today: int
    pending_leave_requests: int
    employees_on_leave_today: int
    payroll_overview: PayrollOverview


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    total: int
    unread: int
    items: list[NotificationRead]


# ---------------------------------------------------------------------------
# Generic
# ---------------------------------------------------------------------------
class Message(BaseModel):
    detail: str
