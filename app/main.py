"""WorkSphere HRMS — FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.routers import (
    attendance,
    auth,
    dashboard,
    employees,
    leave_policies,
    leaves,
    notifications,
    payroll,
    self_service,
    users,
)
from app.services.leave_balances import ensure_all_employee_balances, ensure_default_policies


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create/upgrade tables and bootstrap leave policies on startup."""
    await init_db()
    async with AsyncSessionLocal() as db:
        await ensure_default_policies(db)
        await ensure_all_employee_balances(db)
        await db.commit()
    yield


app = FastAPI(
    title=settings.app_name,
    version="2.0.0",
    description=(
        "Role-driven HRMS backend: RBAC, Employee Self-Service, Attendance "
        "controls, Leave policies/balances, Payroll breakdowns, Admin user "
        "management, Dashboard analytics and Notifications."
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
app.include_router(leave_policies.router)
app.include_router(leaves.router)
app.include_router(payroll.router)
app.include_router(dashboard.router)
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
