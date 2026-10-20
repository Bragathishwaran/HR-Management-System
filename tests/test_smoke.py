"""End-to-end smoke tests covering every module of the WorkSphere HRMS API.

Run directly (python tests/test_smoke.py) or with pytest.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Use an isolated database BEFORE importing the app (settings are read at import).
_TMP_DIR = Path(tempfile.mkdtemp(prefix="hrms_test_"))
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DIR / 'test_hrms.db'}"
os.environ["SECRET_KEY"] = "test-secret-key-for-automated-tests-0123456789abcdef"
os.environ["ENVIRONMENT"] = "test"

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

    return s.summary()


if __name__ == "__main__":
    sys.exit(run_suite())
