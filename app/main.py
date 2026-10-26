"""WorkSphere HRMS — FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.routers import (
    analytics,
    attendance,
    auth,
    dashboard,
    documents,
    employees,
    leave_calendar,
    leave_policies,
    leaves,
    notifications,
    payroll,
    performance,
    self_service,
    shifts,
    users,
)
from app.services.automation import attendance_automation_loop
from app.services.leave_balances import ensure_all_employee_balances, ensure_default_policies
from app.services.shifts import ensure_default_shifts


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create/upgrade tables, bootstrap defaults and run optional automation."""
    await init_db()
    async with AsyncSessionLocal() as db:
        await ensure_default_policies(db)
        await ensure_all_employee_balances(db)
        await ensure_default_shifts(db)
        await db.commit()

    stop_event = asyncio.Event()
    automation_task: asyncio.Task | None = None
    if settings.auto_attendance_enabled:
        automation_task = asyncio.create_task(attendance_automation_loop(stop_event))

    try:
        yield
    finally:
        if automation_task is not None:
            stop_event.set()
            with suppress(asyncio.TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(automation_task, timeout=5)
            if not automation_task.done():
                automation_task.cancel()
                with suppress(asyncio.CancelledError):
                    await automation_task


app = FastAPI(
    title=settings.app_name,
    version="2.0.0",
    description=(
        "Role-driven HRMS backend: RBAC, Employee Self-Service, Attendance "
        "controls, Leave policies/balances, Payroll breakdowns, Admin user "
        "management, Dashboard analytics, Notifications, shift automation, "
        "document management, performance reviews and advanced analytics."
    ),
    lifespan=lifespan,
)

# React dev servers (localhost:3000 / 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Module routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(employees.router)
app.include_router(self_service.router)
app.include_router(attendance.router)
app.include_router(shifts.router)
app.include_router(leave_policies.router)
app.include_router(leaves.router)
app.include_router(leave_calendar.router)
app.include_router(documents.router)
app.include_router(performance.router)
app.include_router(payroll.router)
app.include_router(dashboard.router)
app.include_router(analytics.router)
app.include_router(notifications.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Never leak stack traces to API clients in production responses."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.get("/", tags=["Health"], summary="API root")
async def root() -> dict:
    return {
        "app": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", tags=["Health"], summary="Health check")
async def health() -> dict:
    return {"status": "ok"}
