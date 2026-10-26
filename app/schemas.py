"""Pydantic v2 request/response schemas for every module."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    computed_field,
    model_validator,
)

from app.models import (
    AttendanceStatus,
    DocumentType,
    EmployeeStatus,
    LeaveStatus,
    LeaveType,
    ShiftName,
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
    is_active: bool
    created_at: datetime


class UserAdminCreate(UserCredentials):
    """POST /users payload — ADMIN only."""

    role: UserRole = UserRole.EMPLOYEE
    is_active: bool = True


class UserUpdate(BaseModel):
    """Partial update of an account (ADMIN only)."""

    model_config = ConfigDict(extra="forbid")

    username: Optional[str] = Field(
        default=None, min_length=3, max_length=50, pattern=USERNAME_PATTERN
    )
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


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
    is_late: bool = False
    late_minutes: Optional[int] = None
    overtime_hours: Optional[float] = None
    shift_id: Optional[int] = None
    is_early_exit: bool = False
    early_exit_minutes: Optional[int] = None


class CheckInOutResponse(BaseModel):
    """Result of a check-in/check-out action."""

    attendance: AttendanceRead
    message: str


class AutoMarkAbsentResponse(BaseModel):
    """Result of a bulk absence sweep for a given day."""

    date: date
    created: int
    skipped_existing: int
    skipped_on_leave: int
    employee_ids: list[int]


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

    @computed_field
    @property
    def days_requested(self) -> int:
        """Inclusive number of calendar days covered by the request."""
        return (self.end_date - self.start_date).days + 1


class LeavePolicyBase(BaseModel):
    total_days_allowed: int = Field(ge=0, le=365)


class LeavePolicyCreate(LeavePolicyBase):
    """POST /leave-policies payload."""

    leave_type: LeaveType


class LeavePolicyUpdate(LeavePolicyBase):
    """PUT /leave-policies/{leave_type} payload."""


class LeavePolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    leave_type: LeaveType
    total_days_allowed: int


class LeaveBalanceRead(BaseModel):
    id: int
    employee_id: int
    leave_type: LeaveType
    remaining_days: int
    total_days_allowed: Optional[int] = None
    employee_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------
class PayrollGenerate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: int = Field(gt=0)
    month: str = Field(pattern=MONTH_PATTERN, examples=["October-2026"])
    # When omitted, the employee's contractual salary is used.
    basic_salary: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    allowances: float = Field(default=0.0, ge=0, le=10_000_000)
    deductions: float = Field(default=0.0, ge=0, le=10_000_000)
    bonus: float = Field(default=0.0, ge=0, le=10_000_000)

    @model_validator(mode="after")
    def net_salary_non_negative(self) -> "PayrollGenerate":
        basic = self.basic_salary if self.basic_salary is not None else 0.0
        if basic + self.allowances + self.bonus - self.deductions < 0:
            raise ValueError("deductions cannot exceed basic_salary + allowances + bonus")
        return self


class PayrollBreakdown(BaseModel):
    basic: float
    allowances: float
    bonus: float
    deductions: float
    gross_salary: float
    net_salary: float


class PayrollRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    basic_salary: float
    allowances: float
    deductions: float
    bonus: float
    net_salary: float
    month: str
    created_at: datetime

    @computed_field
    @property
    def gross_salary(self) -> float:
        return round(self.basic_salary + self.allowances + self.bonus, 2)

    @computed_field
    @property
    def breakdown(self) -> PayrollBreakdown:
        return PayrollBreakdown(
            basic=self.basic_salary,
            allowances=self.allowances,
            bonus=self.bonus,
            deductions=self.deductions,
            gross_salary=self.gross_salary,
            net_salary=self.net_salary,
        )


class PayrollDetailRead(PayrollRead):
    employee_name: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None


class PayrollSummary(BaseModel):
    month: str
    employees_paid: int
    total_basic: float
    total_allowances: float
    total_bonus: float
    total_deductions: float
    total_gross: float
    total_net: float


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


class AdminAnalytics(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    users_by_role: dict[str, int]
    total_employees: int
    active_employees: int
    department_distribution: dict[str, int]
    pending_leave_requests: int
    attendance_today: dict[str, int]
    payroll_overview: PayrollOverview


class AttendanceTrendPoint(BaseModel):
    date: date
    present: int
    absent: int
    half_day: int


class LeaveStatusBreakdown(BaseModel):
    pending: int
    approved: int
    rejected: int


class PayrollTrendPoint(BaseModel):
    month: str
    total_net: float
    records: int


class DepartmentCount(BaseModel):
    department: str
    count: int


class DashboardTrends(BaseModel):
    """Chart-ready series for the HR/Admin dashboard."""

    attendance_trend: list[AttendanceTrendPoint]
    leave_breakdown: LeaveStatusBreakdown
    payroll_trend: list[PayrollTrendPoint]
    department_distribution: list[DepartmentCount]


class SelfServiceDashboard(BaseModel):
    profile: EmployeeRead
    today_attendance: Optional[AttendanceRead] = None
    leave_balances: list[LeaveBalanceRead]
    pending_leave_requests: int
    latest_payroll: Optional[PayrollRead] = None
    unread_notifications: int


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    message: str
    is_read: bool
    category: str = "GENERAL"
    created_at: datetime


class NotificationListResponse(BaseModel):
    total: int
    unread: int
    items: list[NotificationRead]


class NotificationReadAllResponse(BaseModel):
    updated: int


# ---------------------------------------------------------------------------
# Module 14 — Shifts & automated attendance
# ---------------------------------------------------------------------------
class ShiftBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ShiftName
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def distinct_times(self) -> "ShiftBase":
        if self.start_time == self.end_time:
            raise ValueError("start_time and end_time must differ")
        return self


class ShiftCreate(ShiftBase):
    """POST /shifts payload (HR/Admin)."""


class ShiftRead(ShiftBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ShiftAssign(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: int = Field(gt=0)
    shift_id: int = Field(gt=0)


class EmployeeShiftRead(BaseModel):
    id: int
    employee_id: int
    shift_id: int
    assigned_at: datetime
    employee_name: str
    department: str
    shift: ShiftRead


class ShiftScheduleEntry(BaseModel):
    employee_id: int
    employee_name: str
    department: str
    designation: str
    shift: Optional[ShiftRead] = None
    attendance_status: Optional[AttendanceStatus] = None
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    is_late: bool = False
    late_minutes: Optional[int] = None
    is_early_exit: bool = False
    early_exit_minutes: Optional[int] = None


class AutoAttendanceResponse(BaseModel):
    date: date
    processed: int
    marked_absent: int
    marked_late: int
    marked_early_exit: int
    skipped_on_leave: int
    employee_ids: list[int]


# ---------------------------------------------------------------------------
# Module 15 — Leave calendar & team availability
# ---------------------------------------------------------------------------
class LeaveCalendarEntry(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    department: str
    leave_type: LeaveType
    start_date: date
    end_date: date
    status: LeaveStatus
    is_own: bool = False

    @computed_field
    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days + 1


class TeamMemberRead(BaseModel):
    employee_id: int
    full_name: str
    designation: str
    department: str
    shift: Optional[ShiftRead] = None
    today_attendance: Optional[AttendanceStatus] = None


class TeamAvailability(BaseModel):
    date: date
    department: Optional[str] = None
    total_employees: int
    available: list[TeamMemberRead]
    on_leave: list[LeaveCalendarEntry]


class LeaveConflictEntry(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    department: str
    leave_type: LeaveType
    start_date: date
    end_date: date
    status: LeaveStatus


class LeaveConflictResponse(BaseModel):
    start_date: date
    end_date: date
    department: Optional[str] = None
    max_concurrent: int
    allowed: bool
    conflict_count: int
    conflicts: list[LeaveConflictEntry]


# ---------------------------------------------------------------------------
# Module 16 — Documents
# ---------------------------------------------------------------------------
class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    file_name: str
    file_url: str
    document_type: DocumentType
    content_type: str
    file_size: int
    expiry_date: Optional[date] = None
    uploaded_at: datetime
    employee_name: Optional[str] = None
    uploaded_by: Optional[str] = None


# ---------------------------------------------------------------------------
# Module 17 — Performance
# ---------------------------------------------------------------------------
class PerformanceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: int = Field(gt=0)
    review_period: str = Field(min_length=2, max_length=40)
    rating: int = Field(ge=1, le=5)
    feedback: str = Field(min_length=3, max_length=2000)


class PerformanceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review_period: Optional[str] = Field(default=None, min_length=2, max_length=40)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    feedback: Optional[str] = Field(default=None, min_length=3, max_length=2000)


class PerformanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    review_period: str
    rating: int
    feedback: str
    created_at: datetime
    employee_name: Optional[str] = None
    department: Optional[str] = None
    reviewed_by: Optional[str] = None


class DepartmentRating(BaseModel):
    department: str
    average_rating: float
    reviews: int


class EmployeePerformanceSummary(BaseModel):
    employee_id: int
    employee_name: Optional[str] = None
    average_rating: float
    reviews: int
    latest_rating: Optional[int] = None
    rating_distribution: dict[str, int]


class TeamPerformanceInsights(BaseModel):
    average_rating: float
    total_reviews: int
    rating_distribution: dict[str, int]
    departments: list[DepartmentRating]


# ---------------------------------------------------------------------------
# Module 18 — Advanced analytics
# ---------------------------------------------------------------------------
class AnalyticsOverview(BaseModel):
    total_employees: int
    active_employees: int
    departments: int
    attendance_records: int
    present: int
    absent: int
    half_day: int
    late: int
    early_exits: int
    attendance_rate: float
    leave_requests: int
    approved_leave_days: int
    average_rating: float
    reviews: int


class AttendanceAnalyticsPoint(BaseModel):
    period: str
    present: int
    absent: int
    half_day: int
    late: int
    total: int
    attendance_rate: float


class LeaveAnalyticsPoint(BaseModel):
    period: str
    approved: int
    pending: int
    rejected: int
    days: int


class LeaveTypeMetric(BaseModel):
    leave_type: LeaveType
    requests: int
    days: int


class DepartmentAnalyticsRow(BaseModel):
    department: str
    headcount: int
    present: int
    absent: int
    late: int
    attendance_rate: float
    leave_days: int
    average_rating: float
    reviews: int


class AnalyticsFilters(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    department: Optional[str] = None


class AnalyticsReport(BaseModel):
    filters: AnalyticsFilters
    overview: AnalyticsOverview
    attendance_trends: list[AttendanceAnalyticsPoint]
    leave_trends: list[LeaveAnalyticsPoint]
    leave_types: list[LeaveTypeMetric]
    performance: TeamPerformanceInsights
    departments: list[DepartmentAnalyticsRow]


# ---------------------------------------------------------------------------
# Module 19 — Smart alerts
# ---------------------------------------------------------------------------
class NotificationAlertSummary(BaseModel):
    unread: int
    late_today: int
    pending_leave_requests: int
    documents_expiring: int
    upcoming_document_expiries: list[DocumentRead]


class AlertRunResponse(BaseModel):
    created: int
    skipped: int
    message: str


# ---------------------------------------------------------------------------
# Module 20 — Advanced employee search
# ---------------------------------------------------------------------------
class EmployeeSearchItem(EmployeeRead):
    role: Optional[UserRole] = None
    shift_name: Optional[ShiftName] = None
    attendance_rate: float = 0.0
    late_count: int = 0
    average_rating: float = 0.0
    review_count: int = 0
    today_attendance: Optional[AttendanceStatus] = None
    on_leave_today: bool = False


class EmployeeSearchResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: list[EmployeeSearchItem]


class EmployeeFacets(BaseModel):
    departments: list[str]
    designations: list[str]
    roles: list[UserRole]
    shifts: list[ShiftRead]


# ---------------------------------------------------------------------------
# Generic
# ---------------------------------------------------------------------------
class Message(BaseModel):
    detail: str
