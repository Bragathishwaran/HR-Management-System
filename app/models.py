"""SQLAlchemy ORM models for the WorkSphere HRMS database."""

from __future__ import annotations

import enum
from datetime import date, datetime, time, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    """Current UTC time stored as naive (SQLite-friendly) datetime."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def sa_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Store enum *values* (e.g. 'EMPLOYEE') as portable VARCHAR columns."""
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        values_callable=lambda members: [member.value for member in members],
    )


# ---------------------------------------------------------------------------
# Enumerations (mirrors of the DB check constraints)
# ---------------------------------------------------------------------------
class UserRole(str, enum.Enum):
    EMPLOYEE = "EMPLOYEE"
    HR = "HR"
    ADMIN = "ADMIN"


class EmployeeStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    HALF_DAY = "HALF_DAY"


class LeaveType(str, enum.Enum):
    SICK = "SICK"
    CASUAL = "CASUAL"
    PAID = "PAID"


class LeaveStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ShiftName(str, enum.Enum):
    MORNING = "MORNING"
    EVENING = "EVENING"
    NIGHT = "NIGHT"


class DocumentType(str, enum.Enum):
    ID_PROOF = "ID_PROOF"
    CERTIFICATE = "CERTIFICATE"
    CONTRACT = "CONTRACT"
    OTHER = "OTHER"


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        sa_enum(UserRole, "user_role"), nullable=False, default=UserRole.EMPLOYEE
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    employee: Mapped["Employee | None"] = relationship(
        back_populates="user", uselist=False, lazy="selectin"
    )
    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    designation: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    joining_date: Mapped[date] = mapped_column(Date, nullable=False)
    salary: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[EmployeeStatus] = mapped_column(
        sa_enum(EmployeeStatus, "employee_status"),
        nullable=False,
        default=EmployeeStatus.ACTIVE,
    )

    user: Mapped[User] = relationship(back_populates="employee")
    attendance_records: Mapped[list["Attendance"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )
    leaves: Mapped[list["Leave"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )
    payroll_records: Mapped[list["Payroll"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )
    leave_balances: Mapped[list["LeaveBalance"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )
    shift_assignment: Mapped["EmployeeShift | None"] = relationship(
        back_populates="employee", uselist=False, cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )
    performance_reviews: Mapped[list["PerformanceReview"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("employee_id", "date", name="uq_attendance_employee_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    check_in: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_out: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[AttendanceStatus] = mapped_column(
        sa_enum(AttendanceStatus, "attendance_status"),
        nullable=False,
        default=AttendanceStatus.ABSENT,
    )
    working_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Module 10 — advanced attendance controls
    is_late: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    late_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overtime_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Module 14 — shift-aware attendance
    shift_id: Mapped[int | None] = mapped_column(
        ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_early_exit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    early_exit_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    employee: Mapped[Employee] = relationship(back_populates="attendance_records")
    shift: Mapped["Shift | None"] = relationship(lazy="selectin")


class Leave(Base):
    __tablename__ = "leaves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    leave_type: Mapped[LeaveType] = mapped_column(
        sa_enum(LeaveType, "leave_type"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[LeaveStatus] = mapped_column(
        sa_enum(LeaveStatus, "leave_status"),
        nullable=False,
        default=LeaveStatus.PENDING,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="leaves")


class LeavePolicy(Base):
    """Module 11 — company-wide leave policy per leave type."""

    __tablename__ = "leave_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    leave_type: Mapped[LeaveType] = mapped_column(
        sa_enum(LeaveType, "leave_type"), unique=True, nullable=False
    )
    total_days_allowed: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class LeaveBalance(Base):
    """Module 11 — per-employee remaining balance for each leave type."""

    __tablename__ = "leave_balances"
    __table_args__ = (
        UniqueConstraint("employee_id", "leave_type", name="uq_leave_balance_employee_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    leave_type: Mapped[LeaveType] = mapped_column(
        sa_enum(LeaveType, "leave_type"), nullable=False
    )
    remaining_days: Mapped[int] = mapped_column(Integer, nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="leave_balances")


class Payroll(Base):
    __tablename__ = "payroll"
    __table_args__ = (UniqueConstraint("employee_id", "month", name="uq_payroll_employee_month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    basic_salary: Mapped[float] = mapped_column(Float, nullable=False)
    allowances: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    deductions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    bonus: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_salary: Mapped[float] = mapped_column(Float, nullable=False)
    month: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # e.g. "October-2026"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="payroll_records")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Module 19 — smart alert metadata / idempotency key
    category: Mapped[str] = mapped_column(
        String(40), default="GENERAL", nullable=False, index=True
    )
    dedupe_key: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="notifications")


# ---------------------------------------------------------------------------
# Phase 3 — automation, documents, performance
# ---------------------------------------------------------------------------
class Shift(Base):
    """Module 14 — reusable shift definition."""

    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[ShiftName] = mapped_column(
        sa_enum(ShiftName, "shift_name"), unique=True, nullable=False
    )
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    assignments: Mapped[list["EmployeeShift"]] = relationship(back_populates="shift")


class EmployeeShift(Base):
    """Module 14 — an employee's currently assigned shift."""

    __tablename__ = "employee_shifts"
    __table_args__ = (
        UniqueConstraint("employee_id", name="uq_employee_shift_employee"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shift_id: Mapped[int] = mapped_column(
        ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="shift_assignment")
    shift: Mapped[Shift] = relationship(back_populates="assignments", lazy="selectin")


class Document(Base):
    """Module 16 — securely stored employee document metadata."""

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    # Random on-disk name; never derived from user input.
    stored_name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    document_type: Mapped[DocumentType] = mapped_column(
        sa_enum(DocumentType, "document_type"),
        nullable=False,
        default=DocumentType.OTHER,
    )
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="documents")
    uploaded_by: Mapped["User | None"] = relationship(lazy="selectin")


class PerformanceReview(Base):
    """Module 17 — periodic performance review with historical feedback."""

    __tablename__ = "performance"
    __table_args__ = (
        UniqueConstraint(
            "employee_id", "review_period", name="uq_performance_employee_period"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    review_period: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    feedback: Mapped[str] = mapped_column(String(2000), nullable=False)
    reviewed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="performance_reviews")
    reviewed_by: Mapped["User | None"] = relationship(lazy="selectin")
