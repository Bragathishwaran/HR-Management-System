"""End-to-end smoke tests covering every module of the WorkSphere HRMS API.

Run directly (python tests/test_smoke.py) or with pytest.
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Use an isolated database BEFORE importing the app (settings are read at import).
_TMP_DIR = Path(tempfile.mkdtemp(prefix="hrms_test_"))
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DIR / 'test_hrms.db'}"
os.environ["SECRET_KEY"] = "test-secret-key-for-automated-tests-0123456789abcdef"
os.environ["ENVIRONMENT"] = "test"
os.environ["DOCUMENT_STORAGE_PATH"] = str(_TMP_DIR / "documents")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

EMPLOYEE_PW = "Employee!123"


class Suite:
    """Tiny assertion harness so the file runs without pytest installed."""

    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.errors: list[str] = []

    def check(self, condition: bool, label: str, detail: str = "") -> None:
        if condition:
            self.passed += 1
            print(f"  PASS  {label}")
        else:
            self.failed += 1
            message = f"  FAIL  {label}" + (f" — {detail}" if detail else "")
            print(message)
            self.errors.append(message)

    def summary(self) -> int:
        print(f"\n{self.passed} passed, {self.failed} failed")
        return 0 if self.failed == 0 else 1


def run_suite() -> int:
    s = Suite()
    client = TestClient(app)

    with client:
        # ------------------------------------------------------------------
        # Health / root
        # ------------------------------------------------------------------
        r = client.get("/health")
        s.check(r.status_code == 200 and r.json()["status"] == "ok", "health check")
        r = client.get("/")
        s.check(r.status_code == 200 and "docs" in r.json(), "API root")

        # ------------------------------------------------------------------
        # Module 1 — Authentication & Roles
        # ------------------------------------------------------------------
        print("\n[Module 1] Authentication & Roles")
        r = client.post(
            "/auth/register",
            json={"username": "admin1", "email": "admin@worksphere.io",
                  "password": "Admin!Pass123", "role": "ADMIN"},
        )
        s.check(r.status_code == 201 and r.json()["role"] == "ADMIN",
                "first registered user bootstraps as ADMIN", r.text)

        r = client.post(
            "/auth/register",
            json={"username": "emp1", "email": "emp1@worksphere.io",
                  "password": EMPLOYEE_PW, "role": "EMPLOYEE"},
        )
        s.check(r.status_code == 201 and r.json()["role"] == "EMPLOYEE",
                "employee self-registration", r.text)

        r = client.post(
            "/auth/register",
            json={"username": "mallory", "email": "m@x.io",
                  "password": EMPLOYEE_PW, "role": "HR"},
        )
        s.check(r.status_code == 403, "anonymous cannot register HR role", r.text)

        r = client.post(
            "/auth/register",
            json={"username": "bad", "email": "not-an-email", "password": "x", "role": "EMPLOYEE"},
        )
        s.check(r.status_code == 422, "invalid register payload rejected (422)", r.text)

        r = client.post("/auth/register",
                        json={"username": "admin1", "email": "dup@x.io",
                              "password": EMPLOYEE_PW, "role": "EMPLOYEE"})
        s.check(r.status_code == 400, "duplicate username rejected", r.text)

        r = client.post("/auth/token", data={"username": "admin1", "password": "wrong-pass"})
        s.check(r.status_code == 401, "bad password -> 401", r.text)

        r = client.post("/auth/token", data={"username": "admin1", "password": "Admin!Pass123"})
        s.check(r.status_code == 200 and "access_token" in r.json(), "admin login returns JWT")
        admin_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        r = client.post("/auth/token", data={"username": "admin@worksphere.io",
                                            "password": "Admin!Pass123"})
        s.check(r.status_code == 200 and "access_token" in r.json(),
                "login accepts email address", r.text)

        r = client.post("/auth/token", data={"username": "emp1", "password": EMPLOYEE_PW})
        s.check(r.status_code == 200, "employee login")
        emp_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        r = client.get("/auth/me", headers=emp_headers)
        s.check(r.status_code == 200 and r.json()["username"] == "emp1", "/auth/me")

        r = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        s.check(r.status_code == 401, "invalid JWT -> 401")

        r = client.get("/auth/me")
        s.check(r.status_code == 401, "missing token -> 401")

        # HR registration with ADMIN token
        r = client.post(
            "/auth/register",
            headers=admin_headers,
            json={"username": "hr1", "email": "hr@worksphere.io",
                  "password": EMPLOYEE_PW, "role": "HR"},
        )
        s.check(r.status_code == 201 and r.json()["role"] == "HR",
                "ADMIN can register HR user", r.text)
        r = client.post("/auth/token", data={"username": "hr1", "password": EMPLOYEE_PW})
        hr_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        # ------------------------------------------------------------------
        # Module 2 — Employee Management
        # ------------------------------------------------------------------
        print("\n[Module 2] Employee Management")
        r = client.post("/employees/", headers=emp_headers, json={})
        s.check(r.status_code == 403, "employee cannot create staff (403)", r.text)

        r = client.post(
            "/employees/",
            headers=admin_headers,
            json={"full_name": "Alice Sharma", "designation": "Senior Engineer",
                  "department": "Engineering", "joining_date": "2024-03-01",
                  "salary": 95000, "user_credentials": {
                      "username": "alice", "email": "alice@worksphere.io",
                      "password": EMPLOYEE_PW}},
        )
        s.check(r.status_code == 201 and r.json()["username"] == "alice",
                "create employee with inline user account", r.text)
        alice_id = r.json()["id"]

        r = client.post(
            "/employees/",
            headers=hr_headers,
            json={"full_name": "Bob Verma", "designation": "Recruiter",
                  "department": "Human Resources", "joining_date": "2025-01-15",
                  "salary": 60000, "user_credentials": {
                      "username": "bob", "email": "bob@worksphere.io",
                      "password": EMPLOYEE_PW}},
        )
        s.check(r.status_code == 201, "HR creates employee", r.text)
        bob_id = r.json()["id"]

        r = client.post(
            "/employees/",
            headers=admin_headers,
            json={"full_name": "No User", "designation": "X", "department": "Y",
                  "joining_date": "2025-01-01", "salary": 100},
        )
        s.check(r.status_code == 422, "employee without user source rejected", r.text)

        r = client.get("/employees/?department=Engineering", headers=hr_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1
                and r.json()[0]["full_name"] == "Alice Sharma",
                "filter by department", r.text)

        r = client.get("/employees/?q=recruiter", headers=hr_headers)
        s.check(r.status_code == 200 and r.json()[0]["id"] == bob_id,
                "free-text search (designation)", r.text)

        r = client.get(f"/employees/{alice_id}", headers=hr_headers)
        s.check(r.status_code == 200 and r.json()["salary"] == 95000,
                "HR sees salary on profile")

        r = client.get("/employees/", headers=emp_headers)
        s.check(r.status_code == 200 and all(e["salary"] is None for e in r.json()),
                "employee list salary masked for non-staff")

        r = client.get("/employees/9999", headers=hr_headers)
        s.check(r.status_code == 404, "missing employee -> 404")

        r = client.put(
            f"/employees/{bob_id}",
            headers=admin_headers,
            json={"designation": "Senior Recruiter", "status": "ACTIVE"},
        )
        s.check(r.status_code == 200 and r.json()["designation"] == "Senior Recruiter",
                "update employee (PUT)", r.text)

        r = client.put(f"/employees/{bob_id}", headers=admin_headers, json={})
        s.check(r.status_code == 400, "empty update rejected", r.text)

        # Alice logs in for attendance/leaves/payroll flows
        r = client.post("/auth/token", data={"username": "alice", "password": EMPLOYEE_PW})
        alice_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = client.post("/auth/token", data={"username": "bob", "password": EMPLOYEE_PW})
        bob_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        # ------------------------------------------------------------------
        # Module 3 — Attendance
        # ------------------------------------------------------------------
        print("\n[Module 3] Attendance")
        r = client.post("/attendance/check-in", headers=alice_headers)
        s.check(r.status_code == 201 and r.json()["attendance"]["status"] == "PRESENT",
                "employee check-in", r.text)

        r = client.post("/attendance/check-in", headers=alice_headers)
        s.check(r.status_code == 400, "duplicate check-in -> 400", r.text)

        r = client.post("/attendance/check-out", headers=bob_headers)
        s.check(r.status_code == 400, "check-out without check-in -> 400", r.text)

        r = client.post("/attendance/check-out", headers=alice_headers)
        s.check(r.status_code == 200 and "working_hours" in r.json()["attendance"],
                "employee check-out with working hours", r.text)
        s.check(r.json()["attendance"]["working_hours"] < 4.0
                and r.json()["attendance"]["status"] == "HALF_DAY",
                "short session auto-classified HALF_DAY", r.text)

        r = client.post("/attendance/check-out", headers=alice_headers)
        s.check(r.status_code == 400, "duplicate check-out -> 400", r.text)

        r = client.get("/attendance/history", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "employee sees only own attendance", r.text)

        r = client.get("/attendance/history", headers=admin_headers)
        s.check(r.status_code == 200 and len(r.json()) >= 1,
                "admin sees all attendance")

        r = client.get(f"/attendance/history?employee_id={bob_id}", headers=admin_headers)
        s.check(r.status_code == 200 and r.json() == [],
                "admin filters history by employee_id")

        # ------------------------------------------------------------------
        # Module 4 — Leaves
        # ------------------------------------------------------------------
        print("\n[Module 4] Leaves")
        leave_payload = {
            "leave_type": "SICK",
            "start_date": "2026-11-02",
            "end_date": "2026-11-04",
            "reason": "Flu recovery at home",
        }
        r = client.post("/leaves/apply", headers=alice_headers, json=leave_payload)
        s.check(r.status_code == 201 and r.json()["status"] == "PENDING",
                "employee applies for leave", r.text)
        leave_id = r.json()["id"]

        r = client.post("/leaves/apply", headers=alice_headers, json={
            "leave_type": "CASUAL", "start_date": "2026-11-03",
            "end_date": "2026-11-05", "reason": "Personal work"})
        s.check(r.status_code == 400, "overlapping leave rejected", r.text)

        r = client.post("/leaves/apply", headers=alice_headers, json={
            "leave_type": "PAID", "start_date": "2026-12-01",
            "end_date": "2026-11-30", "reason": "Invalid range"})
        s.check(r.status_code == 422, "end_date < start_date -> 422", r.text)

        r = client.get("/leaves/", headers=bob_headers)
        s.check(r.status_code == 200 and r.json() == [],
                "employee sees only own leaves")

        r = client.get("/leaves/?status=PENDING", headers=hr_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "HR sees pending leaves", r.text)

        r = client.patch(f"/leaves/{leave_id}/status", headers=emp_headers,
                         json={"status": "APPROVED"})
        s.check(r.status_code == 403, "employee cannot approve leave (403)", r.text)

        r = client.patch(f"/leaves/{leave_id}/status", headers=hr_headers,
                         json={"status": "APPROVED"})
        s.check(r.status_code == 200 and r.json()["status"] == "APPROVED",
                "HR approves leave", r.text)

        r = client.patch(f"/leaves/{leave_id}/status", headers=hr_headers,
                         json={"status": "REJECTED"})
        s.check(r.status_code == 400, "re-deciding a processed leave -> 400", r.text)

        r = client.patch(f"/leaves/{leave_id}/status", headers=hr_headers,
                         json={"status": "PENDING"})
        s.check(r.status_code == 422, "status PENDING not allowed in PATCH", r.text)

        r = client.get("/notifications/", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["unread"] == 1
                and "leave" in r.json()["items"][0]["title"].lower(),
                "leave approval triggered a notification", r.text)

        # ------------------------------------------------------------------
        # Module 5 — Payroll
        # ------------------------------------------------------------------
        print("\n[Module 5] Payroll")
        r = client.post("/payroll/generate", headers=emp_headers, json={
            "employee_id": alice_id, "month": "October-2026",
            "basic_salary": 95000, "deductions": 5000, "bonus": 7500})
        s.check(r.status_code == 403, "employee cannot generate payroll (403)", r.text)

        r = client.post("/payroll/generate", headers=admin_headers, json={
            "employee_id": alice_id, "month": "October-2026",
            "basic_salary": 95000, "deductions": 5000, "bonus": 7500})
        s.check(r.status_code == 201 and r.json()["net_salary"] == 97500.0,
                "generate payroll net = basic + bonus - deductions", r.text)

        r = client.post("/payroll/generate", headers=admin_headers, json={
            "employee_id": alice_id, "month": "October-2026", "deductions": 0})
        s.check(r.status_code == 400, "duplicate payroll month -> 400", r.text)

        r = client.post("/payroll/generate", headers=admin_headers, json={
            "employee_id": bob_id, "month": "Oct-2026"})
        s.check(r.status_code == 201 and r.json()["net_salary"] == 60000.0,
                "default basic from employee salary", r.text)

        r = client.post("/payroll/generate", headers=admin_headers, json={
            "employee_id": bob_id, "month": "Nov-2026", "deductions": 999999})
        s.check(r.status_code == 422, "deductions > salary rejected by validation", r.text)

        r = client.post("/payroll/generate", headers=admin_headers, json={
            "employee_id": 9999, "month": "January-2026"})
        s.check(r.status_code == 404, "payroll for missing employee -> 404", r.text)

        r = client.get("/payroll/", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1
                and r.json()[0]["month"] == "October-2026",
                "employee sees own payroll only", r.text)

        r = client.get("/payroll/?month=Oct-2026", headers=admin_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "admin filters payroll by month", r.text)

        r = client.get("/notifications/", headers=alice_headers)
        titles = [n["title"].lower() for n in r.json()["items"]]
        s.check(any("payroll" in t for t in titles),
                "payroll generation triggered a notification", r.text)

        # ------------------------------------------------------------------
        # Module 6 — Dashboard
        # ------------------------------------------------------------------
        print("\n[Module 6] Dashboard")
        r = client.get("/dashboard/stats", headers=admin_headers)
        s.check(r.status_code == 200, "admin dashboard stats", r.text)
        stats = r.json()
        s.check(stats["total_employees"] == 2 and stats["active_employees"] == 2,
                "employee counts", str(stats))
        s.check(stats["present_today"] == 0 and stats["half_day_today"] == 1,
                "attendance counts today (alice's short session = HALF_DAY)", str(stats))
        s.check(stats["pending_leave_requests"] == 0
                and stats["employees_on_leave_today"] == 0,
                "leave counts", str(stats))
        s.check(stats["payroll_overview"]["records_generated"] == 1
                and stats["payroll_overview"]["total_net_salary"] == 97500.0,
                "payroll overview (current month only)", str(stats["payroll_overview"]))

        r = client.get("/dashboard/stats", headers=emp_headers)
        s.check(r.status_code == 403, "employee blocked from dashboard (403)", r.text)

        r = client.get("/dashboard/trends", headers=admin_headers)
        trends = r.json()
        s.check(r.status_code == 200 and len(trends["attendance_trend"]) == 7
                and trends["attendance_trend"][-1]["half_day"] == 1,
                "dashboard attendance trend (7 days)", r.text)
        s.check(trends["leave_breakdown"] == {"pending": 0, "approved": 1, "rejected": 0},
                "dashboard leave breakdown", str(trends.get("leave_breakdown")))
        s.check(len(trends["payroll_trend"]) == 2
                and {p["month"] for p in trends["payroll_trend"]}
                == {"October-2026", "Oct-2026"}
                and sum(p["records"] for p in trends["payroll_trend"]) == 2
                and sum(d["count"] for d in trends["department_distribution"]) == 2,
                "dashboard payroll trend + department split", str(trends))

        r = client.get("/dashboard/trends", headers=emp_headers)
        s.check(r.status_code == 403, "employee blocked from dashboard trends (403)", r.text)

        # ------------------------------------------------------------------
        # Module 7 — Notifications
        # ------------------------------------------------------------------
        print("\n[Module 7] Notifications")
        r = client.get("/notifications/", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["unread"] >= 1,
                "employee lists notifications", r.text)
        notif_id = r.json()["items"][0]["id"]

        r = client.patch(f"/notifications/{notif_id}/read", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["is_read"] is True,
                "mark notification as read", r.text)

        r = client.get("/notifications/?unread_only=true", headers=alice_headers)
        s.check(all(n["id"] != notif_id for n in r.json()["items"]),
                "unread_only filter excludes read item", r.text)

        r = client.patch(f"/notifications/{notif_id}/read", headers=alice_headers)
        s.check(r.status_code == 200, "marking an already-read notification is idempotent")

        r = client.patch("/notifications/99999/read", headers=alice_headers)
        s.check(r.status_code == 404, "foreign/missing notification -> 404", r.text)

        r = client.patch(f"/notifications/{notif_id}/read", headers=bob_headers)
        s.check(r.status_code == 404, "user cannot mark another user's notification", r.text)

        r = client.get("/notifications/", headers=bob_headers)
        s.check(r.status_code == 200 and r.json()["total"] == 1
                and "payroll" in r.json()["items"][0]["title"].lower(),
                "bob received only his payroll notification", r.text)

        r = client.patch("/notifications/read-all", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["updated"] >= 1,
                "mark all notifications as read", r.text)

        r = client.get("/notifications/?unread_only=true", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["unread"] == 0
                and r.json()["items"] == [],
                "read-all clears the unread inbox", r.text)

        # ------------------------------------------------------------------
        # Module 8 + 13 — RBAC hardening & Admin user management
        # ------------------------------------------------------------------
        print("\n[Module 8/13] RBAC & User Management")
        r = client.get("/users/", headers=emp_headers)
        s.check(r.status_code == 403, "employee cannot list users (403)", r.text)

        r = client.get("/users/", headers=hr_headers)
        s.check(r.status_code == 403, "HR cannot list users (403)", r.text)

        r = client.get("/users/", headers=admin_headers)
        s.check(r.status_code == 200 and len(r.json()) >= 4
                and {u["role"] for u in r.json()} >= {"ADMIN", "HR", "EMPLOYEE"},
                "admin lists users with roles", r.text)

        r = client.post("/users/", headers=admin_headers, json={
            "username": "charlie", "email": "charlie@worksphere.io",
            "password": EMPLOYEE_PW, "role": "EMPLOYEE"})
        s.check(r.status_code == 201 and r.json()["role"] == "EMPLOYEE"
                and r.json()["is_active"] is True,
                "admin creates user account", r.text)
        charlie_id = r.json()["id"]

        r = client.post("/auth/token", data={"username": "charlie", "password": EMPLOYEE_PW})
        charlie_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        r = client.patch(f"/users/{charlie_id}", headers=admin_headers,
                         json={"role": "HR"})
        s.check(r.status_code == 200 and r.json()["role"] == "HR",
                "admin assigns HR role", r.text)

        r = client.get("/auth/me", headers=charlie_headers)
        s.check(r.status_code == 401,
                "stale token rejected after role change", r.text)

        r = client.post("/auth/token", data={"username": "charlie", "password": EMPLOYEE_PW})
        charlie_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = client.get("/users/", headers=charlie_headers)
        s.check(r.status_code == 403, "new HR role still cannot manage users", r.text)

        r = client.patch(f"/users/{charlie_id}", headers=admin_headers,
                         json={"is_active": False})
        s.check(r.status_code == 200 and r.json()["is_active"] is False,
                "admin deactivates user", r.text)
        r = client.post("/auth/token", data={"username": "charlie", "password": EMPLOYEE_PW})
        s.check(r.status_code == 403, "deactivated user cannot log in", r.text)
        r = client.get("/auth/me", headers=charlie_headers)
        s.check(r.status_code == 403, "deactivated user's token is rejected", r.text)

        r = client.patch(f"/users/{charlie_id}", headers=admin_headers,
                         json={"is_active": True})
        s.check(r.status_code == 200 and r.json()["is_active"] is True,
                "admin reactivates user", r.text)

        me = client.get("/auth/me", headers=admin_headers).json()
        r = client.patch(f"/users/{me['id']}", headers=admin_headers,
                         json={"is_active": False})
        s.check(r.status_code == 400, "admin cannot deactivate self", r.text)
        r = client.patch(f"/users/{me['id']}", headers=admin_headers,
                         json={"role": "HR"})
        s.check(r.status_code == 400, "admin cannot demote self", r.text)
        r = client.delete(f"/users/{me['id']}", headers=admin_headers)
        s.check(r.status_code == 400, "admin cannot delete self", r.text)

        r = client.post("/users/", headers=hr_headers, json={
            "username": "nope", "email": "nope@x.io",
            "password": EMPLOYEE_PW, "role": "EMPLOYEE"})
        s.check(r.status_code == 403, "HR cannot create users (403)", r.text)

        r = client.get(f"/employees/{bob_id}", headers=alice_headers)
        s.check(r.status_code == 403,
                "employee cannot view another employee profile", r.text)
        r = client.get(f"/employees/{bob_id}", headers=hr_headers)
        s.check(r.status_code == 200, "HR can view employee profiles", r.text)

        # ------------------------------------------------------------------
        # Module 9 — Employee Self-Service Portal
        # ------------------------------------------------------------------
        print("\n[Module 9] Employee Self-Service")
        r = client.get("/me/profile", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["username"] == "alice"
                and r.json()["salary"] == 95000,
                "self-service profile exposes own salary", r.text)

        r = client.get("/me/attendance", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "self-service attendance history", r.text)

        r = client.get("/me/leaves", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "self-service leave tracking", r.text)

        r = client.get("/me/payroll", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "self-service payroll history", r.text)

        r = client.get("/me/balances", headers=alice_headers)
        sick = next(b for b in r.json() if b["leave_type"] == "SICK")
        s.check(r.status_code == 200 and sick["remaining_days"] == 9
                and sick["total_days_allowed"] == 12,
                "leave balance 12 - 3 approved days = 9", r.text)

        r = client.get("/me/dashboard", headers=alice_headers)
        dash = r.json()
        s.check(r.status_code == 200 and dash["profile"]["username"] == "alice"
                and dash["today_attendance"]["status"] == "HALF_DAY"
                and dash["pending_leave_requests"] == 0
                and dash["latest_payroll"]["month"] == "October-2026",
                "self-service dashboard aggregates portal data", r.text)

        r = client.get("/me/profile", headers=charlie_headers)
        s.check(r.status_code == 400,
                "user without employee profile gets a clear error", r.text)

        # ------------------------------------------------------------------
        # Module 10 — Advanced Attendance Controls
        # ------------------------------------------------------------------
        print("\n[Module 10] Advanced Attendance")
        r = client.post("/attendance/check-in", headers=bob_headers)
        s.check(r.status_code == 201 and "is_late" in r.json()["attendance"]
                and "late_minutes" in r.json()["attendance"],
                "check-in records late/on-time indicators", r.text)
        r = client.post("/attendance/check-in", headers=bob_headers)
        s.check(r.status_code == 400, "multiple check-ins per day prevented", r.text)

        r = client.get("/attendance/today", headers=bob_headers)
        s.check(r.status_code == 200 and r.json()["check_in"] is not None,
                "today's attendance endpoint", r.text)

        r = client.post("/attendance/check-out", headers=bob_headers)
        s.check(r.status_code == 200 and r.json()["attendance"]["overtime_hours"] >= 0,
                "check-out calculates overtime hours", r.text)

        r = client.post("/attendance/auto-mark-absent", headers=hr_headers,
                        json=None, params={"date": "2020-01-01"})
        absent = r.json()
        s.check(r.status_code == 200 and absent["created"] == 2
                and set(absent["employee_ids"]) == {alice_id, bob_id},
                "HR auto-marks missing employees absent", r.text)

        r = client.post("/attendance/auto-mark-absent", headers=hr_headers,
                        params={"date": "2020-01-01"})
        s.check(r.status_code == 200 and r.json()["created"] == 0
                and r.json()["skipped_existing"] == 2,
                "absent sweep is idempotent", r.text)

        r = client.post("/attendance/auto-mark-absent", headers=emp_headers)
        s.check(r.status_code == 403, "employee cannot run absence sweep", r.text)

        r = client.post("/attendance/auto-mark-absent", headers=hr_headers,
                        params={"date": "2999-01-01"})
        s.check(r.status_code == 400, "future absence sweep rejected", r.text)

        # ------------------------------------------------------------------
        # Module 11 — Leave Policies & Balances
        # ------------------------------------------------------------------
        print("\n[Module 11] Leave Policies & Balances")
        r = client.get("/leave-policies/", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 3,
                "employee can view leave policies", r.text)
        s.check({p["leave_type"] for p in r.json()} == {"SICK", "CASUAL", "PAID"},
                "all leave types have policies", r.text)

        r = client.put("/leave-policies/SICK", headers=emp_headers,
                       json={"total_days_allowed": 30})
        s.check(r.status_code == 403, "employee cannot edit leave policy", r.text)

        r = client.put("/leave-policies/SICK", headers=hr_headers,
                       json={"total_days_allowed": 15})
        s.check(r.status_code == 200 and r.json()["total_days_allowed"] == 15,
                "HR updates leave policy allocation", r.text)

        r = client.post("/leave-policies/", headers=hr_headers,
                        json={"leave_type": "SICK", "total_days_allowed": 10})
        s.check(r.status_code == 400, "duplicate policy rejected", r.text)

        r = client.post("/leaves/apply", headers=alice_headers, json={
            "leave_type": "PAID", "start_date": "2027-01-01",
            "end_date": "2027-01-21", "reason": "Long break"})
        s.check(r.status_code == 400, "leave over-usage blocked by balance", r.text)

        r = client.get(f"/leaves/balances?employee_id={alice_id}", headers=hr_headers)
        s.check(r.status_code == 200 and len(r.json()) == 3
                and all(b["employee_name"] == "Alice Sharma" for b in r.json()),
                "HR views an employee's leave balances", r.text)

        # ------------------------------------------------------------------
        # Module 12 — Payroll Enhancements
        # ------------------------------------------------------------------
        print("\n[Module 12] Payroll Enhancements")
        r = client.post("/payroll/generate", headers=hr_headers, json={
            "employee_id": alice_id, "month": "November-2026",
            "basic_salary": 95000, "allowances": 2500, "bonus": 500,
            "deductions": 1000})
        s.check(r.status_code == 201 and r.json()["net_salary"] == 97000.0
                and r.json()["allowances"] == 2500
                and r.json()["gross_salary"] == 98000.0
                and r.json()["breakdown"]["net_salary"] == 97000.0,
                "payroll breakdown basic/allowances/bonus/deductions", r.text)
        november_payroll_id = r.json()["id"]

        r = client.get("/payroll/summary?month=November-2026", headers=emp_headers)
        s.check(r.status_code == 403, "employee cannot view payroll summary", r.text)

        r = client.get("/payroll/summary?month=November-2026", headers=hr_headers)
        summary = r.json()
        s.check(r.status_code == 200 and summary["employees_paid"] == 1
                and summary["total_basic"] == 95000.0
                and summary["total_allowances"] == 2500.0
                and summary["total_deductions"] == 1000.0
                and summary["total_net"] == 97000.0,
                "monthly payroll summary totals", r.text)

        r = client.get(f"/payroll/{november_payroll_id}", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["employee_name"] == "Alice Sharma"
                and r.json()["breakdown"]["gross_salary"] == 98000.0,
                "detailed payslip for own record", r.text)

        r = client.get(f"/payroll/{november_payroll_id}", headers=bob_headers)
        s.check(r.status_code == 403,
                "employee cannot view another employee's payslip", r.text)

        r = client.get("/payroll/summary?month=October-2026", headers=admin_headers)
        s.check(r.status_code == 200 and r.json()["employees_paid"] == 1
                and r.json()["total_allowances"] == 0.0
                and r.json()["total_net"] == 97500.0,
                "admin payroll summary (legacy record uses allowances=0)", r.text)

        # ------------------------------------------------------------------
        # Admin Controls — System Analytics
        # ------------------------------------------------------------------
        print("\n[Admin] System-wide Analytics")
        r = client.get("/dashboard/analytics", headers=admin_headers)
        analytics = r.json()
        s.check(r.status_code == 200 and analytics["total_employees"] == 2
                and analytics["total_users"] == 6
                and analytics["active_users"] == 6
                and analytics["users_by_role"]["ADMIN"] == 1
                and analytics["users_by_role"]["HR"] == 2,
                "admin system-wide analytics", r.text)

        r = client.get("/dashboard/analytics", headers=hr_headers)
        s.check(r.status_code == 403, "HR blocked from admin analytics", r.text)

        r = client.get("/dashboard/stats", headers=hr_headers)
        s.check(r.status_code == 200, "HR retains operational dashboard", r.text)

        r = client.delete(f"/users/{charlie_id}", headers=admin_headers)
        s.check(r.status_code == 204, "admin deletes user account", r.text)

        # ==================================================================
        # Phase 3 — Modules 14–20
        # ==================================================================
        today = datetime.now(timezone.utc).date()
        today_str = today.isoformat()
        expiry_str = (today + timedelta(days=10)).isoformat()

        # ------------------------------------------------------------------
        # Module 14 — Shifts & automated attendance
        # ------------------------------------------------------------------
        print("\n[Module 14] Shifts & Automated Attendance")
        r = client.get("/shifts/", headers=alice_headers)
        shifts = r.json()
        s.check(
            r.status_code == 200
            and {shift["name"] for shift in shifts} == {"MORNING", "EVENING", "NIGHT"},
            "default shifts seeded on startup",
            r.text,
        )
        morning_id = next(
            shift["id"] for shift in shifts if shift["name"] == "MORNING"
        )
        night_id = next(shift["id"] for shift in shifts if shift["name"] == "NIGHT")

        r = client.post(
            "/shifts/", headers=emp_headers,
            json={"name": "MORNING", "start_time": "09:00:00", "end_time": "17:00:00"},
        )
        s.check(r.status_code == 403, "employee cannot create shifts (403)", r.text)

        r = client.post(
            "/shifts/", headers=hr_headers,
            json={"name": "MORNING", "start_time": "08:00:00", "end_time": "16:00:00"},
        )
        s.check(r.status_code == 400, "duplicate shift name rejected", r.text)

        r = client.post(
            "/shifts/assign", headers=hr_headers,
            json={"employee_id": alice_id, "shift_id": morning_id},
        )
        s.check(
            r.status_code == 200
            and r.json()["shift"]["name"] == "MORNING"
            and r.json()["employee_name"] == "Alice Sharma",
            "HR assigns a shift",
            r.text,
        )
        r = client.post(
            "/shifts/assign", headers=hr_headers,
            json={"employee_id": bob_id, "shift_id": night_id},
        )
        s.check(r.status_code == 200 and r.json()["shift"]["name"] == "NIGHT",
                "cross-midnight night shift assigned", r.text)

        r = client.post(
            "/shifts/assign", headers=emp_headers,
            json={"employee_id": bob_id, "shift_id": morning_id},
        )
        s.check(r.status_code == 403, "employee cannot assign shifts (403)", r.text)

        r = client.get("/shifts/me", headers=alice_headers)
        s.check(r.status_code == 200 and r.json()["shift"]["name"] == "MORNING",
                "employee sees own shift", r.text)

        r = client.get("/shifts/assignments", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1
                and r.json()[0]["employee_id"] == alice_id,
                "employee assignment list is scoped to self", r.text)

        r = client.get("/shifts/assignments", headers=hr_headers)
        s.check(r.status_code == 200 and len(r.json()) == 2,
                "HR sees all shift assignments", r.text)

        r = client.get(
            "/shifts/schedule", headers=hr_headers, params={"date": today_str}
        )
        schedule = r.json()
        alice_entry = next(
            entry for entry in schedule if entry["employee_id"] == alice_id
        )
        s.check(
            r.status_code == 200
            and alice_entry["shift"]["name"] == "MORNING"
            and alice_entry["check_in"] is not None,
            "daily shift schedule includes attendance",
            r.text,
        )

        r = client.get(
            "/shifts/schedule", headers=bob_headers, params={"date": today_str}
        )
        s.check(r.status_code == 200 and len(r.json()) == 1
                and r.json()[0]["employee_id"] == bob_id,
                "employee schedule shows only self", r.text)

        r = client.post(
            "/shifts/auto-process", headers=emp_headers,
            params={"date": "2020-01-02"},
        )
        s.check(r.status_code == 403, "employee cannot run shift automation", r.text)

        r = client.post(
            "/shifts/auto-process", headers=hr_headers,
            params={"date": "2020-01-02"},
        )
        s.check(r.status_code == 200 and r.json()["marked_absent"] == 2,
                "shift automation marks missing employees absent", r.text)

        # ------------------------------------------------------------------
        # Module 15 — Leave calendar & team availability
        # ------------------------------------------------------------------
        print("\n[Module 15] Leave Calendar & Team Availability")
        r = client.get(
            "/leave-calendar/?month=2026-11", headers=alice_headers
        )
        s.check(
            r.status_code == 200
            and any(entry["id"] == leave_id and entry["is_own"] for entry in r.json()),
            "employee calendar shows approved own leave",
            r.text,
        )

        r = client.get("/leave-calendar/?month=2026-11", headers=bob_headers)
        s.check(r.status_code == 200 and r.json() == [],
                "calendar is scoped to the employee's department", r.text)

        r = client.get("/leave-calendar/?month=2026-11", headers=hr_headers)
        s.check(r.status_code == 200 and len(r.json()) >= 1,
                "HR sees leave across departments", r.text)

        r = client.get(
            "/leave-calendar/team", headers=hr_headers,
            params={"date": "2026-11-03"},
        )
        team = r.json()
        s.check(
            r.status_code == 200
            and any(entry["employee_id"] == alice_id for entry in team["on_leave"])
            and all(member["employee_id"] != alice_id for member in team["available"]),
            "team availability separates on-leave employees",
            r.text,
        )

        r = client.get(
            "/leave-calendar/conflicts", headers=hr_headers,
            params={"start_date": "2026-11-03", "end_date": "2026-11-04"},
        )
        s.check(
            r.status_code == 200
            and r.json()["conflict_count"] == 1
            and r.json()["allowed"] is True
            and r.json()["max_concurrent"] == 0,
            "leave conflict check respects configurable cap",
            r.text,
        )

        r = client.get(
            "/leave-calendar/conflicts", headers=alice_headers,
            params={"start_date": "2026-11-03", "end_date": "2026-11-04"},
        )
        s.check(r.status_code == 200 and r.json()["conflict_count"] == 1
                and r.json()["department"] == "Engineering",
                "employee conflict check scoped to own department", r.text)

        r = client.get(
            "/leave-calendar/conflicts", headers=hr_headers,
            params={"start_date": "2026-11-05", "end_date": "2026-11-01"},
        )
        s.check(r.status_code == 400, "invalid conflict range rejected", r.text)

        r = client.get("/leave-calendar/?month=2026-13", headers=hr_headers)
        s.check(r.status_code == 400, "invalid calendar month rejected", r.text)

        # ------------------------------------------------------------------
        # Module 16 — Secure documents
        # ------------------------------------------------------------------
        print("\n[Module 16] Documents")
        r = client.post(
            "/documents/upload",
            headers=alice_headers,
            files={"file": ("id-card.pdf", b"%PDF-1.4 fake test document", "application/pdf")},
            data={"document_type": "ID_PROOF", "expiry_date": expiry_str},
        )
        s.check(
            r.status_code == 201
            and r.json()["file_name"] == "id-card.pdf"
            and r.json()["document_type"] == "ID_PROOF"
            and r.json()["employee_id"] == alice_id,
            "employee uploads a PDF document",
            r.text,
        )
        document_id = r.json()["id"]

        r = client.post(
            "/documents/upload",
            headers=alice_headers,
            files={"file": ("malware.exe", b"MZ executable", "application/octet-stream")},
        )
        s.check(r.status_code == 400, "disallowed extension rejected", r.text)

        r = client.post(
            "/documents/upload",
            headers=alice_headers,
            files={"file": ("fake.pdf", b"not actually a pdf", "application/pdf")},
        )
        s.check(r.status_code == 400, "magic-byte mismatch rejected", r.text)

        r = client.post(
            "/documents/upload",
            headers=bob_headers,
            files={"file": ("bob.pdf", b"%PDF-1.4 bob file", "application/pdf")},
            data={"employee_id": str(alice_id)},
        )
        s.check(r.status_code == 403,
                "employee cannot upload to another employee", r.text)

        r = client.post(
            "/documents/upload",
            headers=hr_headers,
            files={"file": ("hr.pdf", b"%PDF-1.4 hr file", "application/pdf")},
        )
        s.check(r.status_code == 400, "HR upload requires employee_id", r.text)

        r = client.get("/documents/", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1
                and r.json()[0]["id"] == document_id,
                "employee lists only own documents", r.text)

        r = client.get("/documents/", headers=bob_headers)
        s.check(r.status_code == 200 and r.json() == [],
                "another employee cannot see the document", r.text)

        r = client.get(f"/documents/{document_id}", headers=bob_headers)
        s.check(r.status_code == 404, "foreign document metadata hidden (404)", r.text)

        r = client.get(f"/documents/{document_id}/download", headers=alice_headers)
        s.check(
            r.status_code == 200
            and r.content.startswith(b"%PDF-")
            and r.headers.get("x-content-type-options") == "nosniff",
            "authenticated owner downloads the file",
            r.text,
        )

        r = client.get(f"/documents/{document_id}/download")
        s.check(r.status_code == 401, "download requires authentication", r.text)

        r = client.get(
            "/documents/", headers=hr_headers,
            params={"employee_id": alice_id},
        )
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "HR filters documents by employee", r.text)

        r = client.delete(f"/documents/{document_id}", headers=alice_headers)
        s.check(r.status_code == 403, "employee cannot delete documents", r.text)

        # ------------------------------------------------------------------
        # Module 17 — Performance reviews
        # ------------------------------------------------------------------
        print("\n[Module 17] Performance Reviews")
        r = client.post(
            "/performance/", headers=hr_headers,
            json={
                "employee_id": alice_id,
                "review_period": "2026-Q3",
                "rating": 4,
                "feedback": "Consistently strong delivery and mentoring.",
            },
        )
        s.check(r.status_code == 201 and r.json()["rating"] == 4
                and r.json()["employee_name"] == "Alice Sharma",
                "HR creates a performance review", r.text)
        review_id = r.json()["id"]

        r = client.post(
            "/performance/", headers=hr_headers,
            json={
                "employee_id": alice_id,
                "review_period": "2026-Q3",
                "rating": 5,
                "feedback": "Duplicate period should be rejected.",
            },
        )
        s.check(r.status_code == 400, "duplicate review period rejected", r.text)

        r = client.post(
            "/performance/", headers=emp_headers,
            json={
                "employee_id": bob_id,
                "review_period": "2026-Q3",
                "rating": 5,
                "feedback": "Self review attempt.",
            },
        )
        s.check(r.status_code == 403, "employee cannot create reviews", r.text)

        r = client.get("/performance/", headers=alice_headers)
        s.check(r.status_code == 200 and len(r.json()) == 1,
                "employee sees own reviews only", r.text)

        r = client.get("/performance/", headers=bob_headers)
        s.check(r.status_code == 200 and r.json() == [],
                "other employees see no reviews", r.text)

        r = client.get(f"/performance/{review_id}", headers=bob_headers)
        s.check(r.status_code == 404, "foreign review hidden (404)", r.text)

        r = client.patch(
            f"/performance/{review_id}", headers=hr_headers,
            json={"rating": 5, "feedback": "Outstanding quarter."},
        )
        s.check(r.status_code == 200 and r.json()["rating"] == 5,
                "HR edits a review", r.text)

        r = client.get(f"/performance/summary/{alice_id}", headers=alice_headers)
        s.check(
            r.status_code == 200
            and r.json()["average_rating"] == 5.0
            and r.json()["reviews"] == 1
            and r.json()["latest_rating"] == 5,
            "employee performance summary",
            r.text,
        )

        r = client.get(f"/performance/summary/{bob_id}", headers=alice_headers)
        s.check(r.status_code == 403, "employee cannot view another summary", r.text)

        r = client.get("/performance/summary/team", headers=hr_headers)
        s.check(r.status_code == 200 and r.json()["total_reviews"] >= 1,
                "team performance insights", r.text)

        r = client.post(
            "/performance/", headers=hr_headers,
            json={
                "employee_id": bob_id,
                "review_period": "2026-Q3",
                "rating": 3,
                "feedback": "Meets expectations; growing into the role.",
            },
        )
        bob_review_id = r.json()["id"]
        r = client.delete(f"/performance/{bob_review_id}", headers=emp_headers)
        s.check(r.status_code == 403, "employee cannot delete reviews", r.text)
        r = client.delete(f"/performance/{bob_review_id}", headers=hr_headers)
        s.check(r.status_code == 204, "HR deletes a review", r.text)

        # ------------------------------------------------------------------
        # Module 18 — Advanced analytics
        # ------------------------------------------------------------------
        print("\n[Module 18] Advanced Analytics")
        r = client.get("/analytics/report", headers=hr_headers)
        report = r.json()
        s.check(
            r.status_code == 200
            and report["overview"]["total_employees"] == 2
            and "filters" in report
            and len(report["attendance_trends"]) > 0,
            "combined analytics report",
            r.text,
        )

        r = client.get(
            "/analytics/report", headers=hr_headers,
            params={"department": "Engineering"},
        )
        s.check(
            r.status_code == 200
            and r.json()["overview"]["total_employees"] == 1
            and r.json()["filters"]["department"] == "Engineering",
            "analytics department filter",
            r.text,
        )

        r = client.get("/analytics/report", headers=emp_headers)
        s.check(r.status_code == 403, "employee blocked from analytics", r.text)

        r = client.get(
            "/analytics/attendance-trends", headers=hr_headers,
            params={"granularity": "month"},
        )
        s.check(r.status_code == 200 and len(r.json()) >= 1,
                "attendance trend series", r.text)

        r = client.get("/analytics/leave-trends", headers=hr_headers)
        s.check(r.status_code == 200 and len(r.json()) >= 1,
                "leave trend series", r.text)

        r = client.get(
            "/analytics/departments", headers=hr_headers,
            params={"department": "Engineering"},
        )
        s.check(
            r.status_code == 200
            and any(row["department"] == "Engineering" and row["headcount"] == 1
                    for row in r.json()),
            "department analytics rows",
            r.text,
        )

        r = client.get("/analytics/performance-insights", headers=hr_headers)
        s.check(r.status_code == 200 and r.json()["total_reviews"] >= 1
                and r.json()["average_rating"] > 0,
                "analytics performance insights", r.text)

        r = client.get(
            "/analytics/overview", headers=hr_headers,
            params={"start_date": "2026-10-10", "end_date": "2026-10-01"},
        )
        s.check(r.status_code == 400, "analytics rejects inverted date range", r.text)

        r = client.get(
            "/analytics/overview", headers=hr_headers,
            params={"start_date": "2024-01-01", "end_date": "2026-10-01"},
        )
        s.check(r.status_code == 400, "analytics rejects ranges over 366 days", r.text)

        # ------------------------------------------------------------------
        # Module 19 — Smart alerts
        # ------------------------------------------------------------------
        print("\n[Module 19] Smart Alerts")
        r = client.get("/notifications/alerts/summary", headers=hr_headers)
        summary = r.json()
        s.check(
            r.status_code == 200
            and summary["documents_expiring"] == 1
            and len(summary["upcoming_document_expiries"]) == 1
            and summary["late_today"] >= 0,
            "smart alert summary counters",
            r.text,
        )

        r = client.get("/notifications/alerts/summary", headers=alice_headers)
        s.check(r.status_code == 403, "employee blocked from alert summary", r.text)

        r = client.post(
            "/notifications/alerts/document-expiry", headers=hr_headers
        )
        s.check(r.status_code == 200 and r.json()["created"] == 1,
                "document expiry alert sent", r.text)
        r = client.post(
            "/notifications/alerts/document-expiry", headers=hr_headers
        )
        s.check(r.status_code == 200 and r.json()["skipped"] == 1
                and r.json()["created"] == 0,
                "document expiry alert deduplicated", r.text)

        r = client.get("/notifications/", headers=alice_headers)
        s.check(
            any(item["category"] == "DOCUMENT" for item in r.json()["items"]),
            "categorised document notification delivered",
            r.text,
        )

        r = client.post(
            "/notifications/alerts/late-attendance", headers=hr_headers,
            params={"date": today_str},
        )
        s.check(r.status_code == 200 and "created" in r.json(),
                "late attendance alert scan", r.text)

        r = client.post("/notifications/alerts/run-all", headers=hr_headers)
        s.check(r.status_code == 200 and "created" in r.json()
                and "skipped" in r.json(),
                "run-all alert scan", r.text)

        r = client.post("/notifications/alerts/run-all", headers=emp_headers)
        s.check(r.status_code == 403, "employee cannot trigger alert scans", r.text)

        # ------------------------------------------------------------------
        # Module 20 — Advanced employee search
        # ------------------------------------------------------------------
        print("\n[Module 20] Advanced Employee Search")
        r = client.get(
            "/employees/search", headers=hr_headers, params={"q": "alice"}
        )
        found = r.json()
        s.check(
            r.status_code == 200
            and found["total"] == 1
            and found["items"][0]["id"] == alice_id
            and found["items"][0]["role"] == "EMPLOYEE"
            and found["items"][0]["shift_name"] == "MORNING"
            and found["items"][0]["average_rating"] == 5.0
            and found["items"][0]["review_count"] == 1,
            "search by name returns enriched metrics",
            r.text,
        )
        s.check(
            found["items"][0]["attendance_rate"] > 0
            and found["items"][0]["late_count"] >= 0,
            "search includes attendance metrics",
            str(found["items"][0]),
        )

        r = client.get(
            "/employees/search", headers=hr_headers, params={"shift_name": "NIGHT"}
        )
        s.check(
            r.status_code == 200 and r.json()["total"] == 1
            and r.json()["items"][0]["id"] == bob_id,
            "filter employees by shift",
            r.text,
        )

        r = client.get(
            "/employees/search", headers=hr_headers, params={"min_rating": 4}
        )
        s.check(
            r.status_code == 200 and r.json()["total"] == 1
            and r.json()["items"][0]["id"] == alice_id,
            "filter employees by minimum rating",
            r.text,
        )

        r = client.get(
            "/employees/search", headers=hr_headers,
            params={"min_attendance_rate": 100},
        )
        s.check(r.status_code == 200 and r.json()["total"] == 0,
                "filter employees by attendance rate", r.text)

        r = client.get(
            "/employees/search", headers=hr_headers,
            params={"on_leave_today": "true"},
        )
        s.check(r.status_code == 200 and r.json()["total"] == 0,
                "filter employees on leave today", r.text)

        r = client.get(
            "/employees/search", headers=hr_headers,
            params={"sort_by": "rating", "sort_order": "desc"},
        )
        s.check(
            r.status_code == 200
            and r.json()["items"][0]["id"] == alice_id
            and r.json()["total"] == 2,
            "sort search results by rating",
            r.text,
        )

        r = client.get("/employees/search", headers=emp_headers)
        s.check(r.status_code == 403, "employee blocked from advanced search", r.text)

        r = client.get("/employees/facets", headers=hr_headers)
        facets = r.json()
        s.check(
            r.status_code == 200
            and "Engineering" in facets["departments"]
            and "Senior Engineer" in facets["designations"]
            and {"ADMIN", "HR", "EMPLOYEE"} <= set(facets["roles"])
            and len(facets["shifts"]) == 3,
            "employee search facets",
            r.text,
        )

        r = client.get("/employees/facets", headers=emp_headers)
        s.check(r.status_code == 403, "employee blocked from facets", r.text)

        # Document cleanup exercises the storage delete path.
        r = client.delete(f"/documents/{document_id}", headers=hr_headers)
        s.check(r.status_code == 204, "HR deletes a document", r.text)
        r = client.get(f"/documents/{document_id}/download", headers=alice_headers)
        s.check(r.status_code == 404, "deleted document is gone", r.text)

    return s.summary()


if __name__ == "__main__":
    sys.exit(run_suite())
