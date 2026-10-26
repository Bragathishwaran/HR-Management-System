"""Optional background attendance automation (Module 14)."""

from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.database import AsyncSessionLocal
from app.services.shifts import auto_process_attendance, today_utc

logger = logging.getLogger("worksphere.automation")


async def attendance_automation_loop(stop_event: asyncio.Event) -> None:
    """Periodically reconcile attendance against assigned shifts.

    The loop is disabled by default (``AUTO_ATTENDANCE_ENABLED=false``) so
    tests and local development keep deterministic behaviour. Enable it in
    production to let WorkSphere mark absences/late arrivals automatically.
    """
    interval = settings.auto_attendance_interval_minutes * 60
    while not stop_event.is_set():
        try:
            async with AsyncSessionLocal() as db:
                await auto_process_attendance(db, today_utc(), notify=True)
                await db.commit()
        except asyncio.CancelledError:  # pragma: no cover - shutdown path
            raise
        except Exception:  # noqa: BLE001 - a failed run must not kill the loop
            logger.exception("Automated attendance run failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
