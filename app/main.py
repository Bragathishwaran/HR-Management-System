"""WorkSphere HRMS — FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.routers import (
    attendance,
    auth,
    dashboard,
    employees,
    leaves,
    notifications,
    payroll,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup; nothing to tear down for SQLite file DBs."""
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "Production-ready HRMS backend: Authentication, Employees, Attendance, "
        "Leaves, Payroll, Dashboard and Notifications."
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
app.include_router(employees.router)
app.include_router(attendance.router)
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
