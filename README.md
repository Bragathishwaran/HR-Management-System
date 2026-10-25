# WorkSphere – HR Management System (HRMS)

A full-stack, role-driven HR platform: an async FastAPI backend plus a React +
TypeScript single-page app. Phase 1 delivered the seven core modules (auth,
employees, attendance, leaves, payroll, dashboard, notifications). Phase 2 adds
RBAC hardening, an employee self-service portal, advanced attendance, leave
policies/balances, detailed payroll breakdowns and admin user management.

## Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Frontend   | React 18, TypeScript, Vite, React Router, Recharts        |
| Framework  | FastAPI (async)                                         |
| ORM        | SQLAlchemy 2.0 (async) + `aiosqlite`                    |
| Database   | SQLite (`hrms.db`, created/upgraded automatically)      |
| Validation | Pydantic v2                                             |
| Security   | OAuth2 password flow, JWT (PyJWT, HS256), bcrypt hashing|
| Settings   | `pydantic-settings` + `.env`                            |

> **Note on hashing:** `passlib` is unmaintained and breaks with `bcrypt>=4.1`
> on modern Python. This project calls `bcrypt` directly — identical security
> properties (per-password salt, cost factor 12), zero compatibility shims.

## Project Structure

```
HRMS/
├── app/
│   ├── main.py                    # FastAPI app, CORS, lifespan bootstrap
│   ├── config.py                  # settings (security, attendance, leave rules)
│   ├── database.py                # async engine + idempotent schema upgrades
│   ├── models.py                  # ORM models + enums
│   ├── schemas.py                 # Pydantic v2 request/response schemas
│   ├── security.py                # bcrypt hashing + JWT create/decode
│   ├── dependencies.py            # auth, role guards, profile resolution
│   ├── services/
│   │   ├── notifications.py       # event notifications
│   │   └── leave_balances.py      # policy/balance bootstrap + helpers
│   └── routers/
│       ├── auth.py                # /auth              Module 1
│       ├── employees.py           # /employees         Module 2
│       ├── users.py               # /users             Module 13 (Admin)
│       ├── self_service.py        # /me                Module 9
│       ├── attendance.py          # /attendance        Modules 3 + 10
│       ├── leave_policies.py      # /leave-policies    Module 11
│       ├── leaves.py              # /leaves            Modules 4 + 11
│       ├── payroll.py             # /payroll           Modules 5 + 12
│       ├── dashboard.py           # /dashboard         Modules 6 + 13
│       └── notifications.py       # /notifications     Module 7
├── scripts/seed_demo.py           # demo data seeder
├── tests/test_smoke.py            # end-to-end API suite (122 checks)
├── frontend/
│   ├── src/
│   │   ├── pages/                 # dashboards, employees, attendance, leaves…
│   │   ├── components/            # layout, UI kit, charts, notification bell
│   │   ├── context/               # auth + toast providers
│   │   ├── lib/                   # API client, formatting helpers
│   │   ├── hooks/                 # data-fetching hook
│   │   ├── App.tsx                # role-guarded routes
│   │   └── styles.css             # design system
│   ├── vite.config.ts             # dev proxy → localhost:8000
│   └── package.json
├── .env / .env.example
├── requirements.txt
└── run.py
```

## Quick Start

### 1. Backend

```bash
pip install -r requirements.txt

# optional: load demo accounts (admin1/hr1/alice/bob, password Passw0rd!123)
python -m scripts.seed_demo

# run the API
python run.py            # or: uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

The dev server proxies `/api/*` to `http://localhost:8000`, so run the backend
first. To point the UI at a different API, copy `frontend/.env.example` to
`frontend/.env` and set `VITE_API_URL` (for example
`http://localhost:8000`); when set, requests go directly to that origin instead
of through the proxy.

Production build:

```bash
cd frontend
npm run build            # type-check + bundle to frontend/dist
npm run preview          # serve the built app on :4173
```

Sign in with any seeded account, e.g. `admin1` / `Passw0rd!123` (Admin),
`hr1` (HR) or `alice` (Employee). HR/Admin land on the operations dashboard;
employees land on their self-service portal.

On startup the app creates missing tables and adds Phase 2 columns to an
existing SQLite database (idempotent), then ensures default leave policies and
per-employee leave balances exist.

## Role-Based Access Control

JWT access tokens carry `sub`, `username`, `role`, `iat`, `exp` and `iss`.
Every protected endpoint resolves the user from the database and re-validates:

- the account still exists and is **active**;
- the token's `role` still matches the database (role changes invalidate old
  tokens automatically).

| Capability | EMPLOYEE | HR | ADMIN |
| ---------- | :------: | :-: | :---: |
| Own profile / self-service | ✓ | ✓ | ✓ |
| Check-in / check-out / apply leave | ✓ | ✓ | ✓ |
| View own attendance, leaves, payroll | ✓ | ✓ | ✓ |
| Manage employees (add/edit/view/delete) | – | ✓ | ✓ |
| Approve/reject leaves | – | ✓ | ✓ |
| View all attendance / leave balances | – | ✓ | ✓ |
| Manage leave policies | – | ✓ | ✓ |
| Generate payroll / view summaries | – | ✓ | ✓ |
| View operational dashboard | – | ✓ | ✓ |
| Manage users, roles, activation | – | – | ✓ |
| System-wide analytics | – | – | ✓ |
| Full system access | – | – | ✓ |

Ownership checks prevent employees from reading another employee's profile,
attendance, leave balance, payroll records or payslips.

## API Overview

### Authentication & users

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| POST | `/auth/register` | Public* | Self-register (*privileged roles need an ADMIN token; first account can bootstrap as ADMIN) |
| POST | `/auth/token` | Public | OAuth2 login → JWT (accepts username **or** email; inactive accounts rejected) |
| GET | `/auth/me` | Any | Current user |
| GET | `/users/` | Admin | List/filter user accounts |
| POST | `/users/` | Admin | Create account with role + active flag |
| GET | `/users/{id}` | Admin | View account |
| PATCH | `/users/{id}` | Admin | Update username/email/password/role/activation |
| DELETE | `/users/{id}` | Admin | Delete account |

Admin safety rails: cannot deactivate/delete self, cannot remove own ADMIN role,
and at least one active ADMIN must always remain.

### Employees & self-service

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| POST | `/employees/` | HR/Admin | Add employee (link user or create inline account; seeds leave balances) |
| GET | `/employees/` | Any | Directory search/filter (salary masked for non-staff) |
| GET | `/employees/{id}` | Own/HR/Admin | Employee profile (employees may only view themselves) |
| PUT | `/employees/{id}` | HR/Admin | Update employee |
| DELETE | `/employees/{id}` | HR/Admin | Delete employee + cascade records |
| GET | `/me/profile` | Employee | Personal details (includes own salary) |
| GET | `/me/attendance` | Employee | Own attendance history |
| GET | `/me/leaves` | Employee | Own leave requests / status |
| GET | `/me/balances` | Employee | Own leave balances |
| GET | `/me/payroll` | Employee | Own payslip history |
| GET | `/me/dashboard` | Employee | Portal aggregate (profile, today, balances, pay, notifications) |

### Attendance

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| POST | `/attendance/check-in` | Employee | One check-in per day; auto late/on-time calculation |
| POST | `/attendance/check-out` | Employee | Working hours, HALF_DAY classification, overtime |
| GET | `/attendance/today` | Employee | Today's record (or `null`) |
| POST | `/attendance/auto-mark-absent?date=YYYY-MM-DD` | HR/Admin | Create ABSENT rows for missing active employees (skips approved leave) |
| GET | `/attendance/history` | Own/HR/Admin | History with date filters |

Late threshold and overtime are configurable via `WORK_START_HOUR`,
`WORK_START_MINUTE`, `LATE_GRACE_MINUTES`, `STANDARD_WORK_HOURS` and
`HALF_DAY_THRESHOLD_HOURS`. Auto-absence is idempotent.

### Leaves & policies

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| POST | `/leaves/apply` | Employee | Apply (overlap + balance checks) |
| GET | `/leaves/` | Own/HR/Admin | List requests with filters |
| GET | `/leaves/balances` | Own/HR/Admin | Remaining days per leave type |
| PATCH | `/leaves/{id}/status` | HR/Admin | Approve (deducts balance) or reject |
| GET | `/leave-policies/` | Any | Policy overview |
| POST | `/leave-policies/` | HR/Admin | Create policy |
| PUT | `/leave-policies/{leave_type}` | HR/Admin | Update allocation |

Defaults: SICK 12, CASUAL 12, PAID 20 days (configurable in `.env`). Balances
are seeded when an employee is created and backfilled on startup. Requests that
exceed the remaining balance are rejected; approval re-checks and deducts
atomically.

### Payroll

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| POST | `/payroll/generate` | HR/Admin | Generate slip: `net = basic + allowances + bonus − deductions` |
| GET | `/payroll/` | Own/HR/Admin | Payroll history with filters |
| GET | `/payroll/summary?month=...` | HR/Admin | Monthly totals with full breakdown |
| GET | `/payroll/{id}` | Own/HR/Admin | Detailed payslip (basic, allowances, bonus, deductions, gross, net) |

### Dashboard & notifications

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| GET | `/dashboard/stats` | HR/Admin | Operational KPIs |
| GET | `/dashboard/trends` | HR/Admin | 7-day attendance series, leave breakdown, payroll trend, departments |
| GET | `/dashboard/analytics` | Admin | Users by role, active/inactive, departments, attendance, payroll |
| GET | `/notifications/` | Any | Own notifications + unread count |
| PATCH | `/notifications/{id}/read` | Owner | Mark as read |
| PATCH | `/notifications/read-all` | Any | Mark all own notifications as read |

## Database

New in Phase 2:

- `leave_policies(id, leave_type, total_days_allowed, created_at)`
- `leave_balances(id, employee_id, leave_type, remaining_days)`

Extended in Phase 2:

- `users.is_active`
- `attendance.is_late`, `late_minutes`, `overtime_hours`
- `payroll.allowances`

Existing tables continue unchanged: `users`, `employees`, `attendance`,
`leaves`, `payroll`, `notifications`.

## Security

- Passwords hashed with **bcrypt** (12 rounds, per-password salt, 72-byte truncation guard).
- JWTs: HS256, `sub`/`role`/`iat`/`exp`/`iss`, TTL from `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Roles validated against the DB on every protected request (stale tokens rejected).
- Inactive accounts cannot authenticate or use existing tokens.
- Role guards via `require_role([...])`; ownership checks on self-service endpoints.
- Salary/payroll visible only to the owner, HR and ADMIN.
- Pydantic validation with `extra="forbid"` on all write payloads.
- Errors: 400 (business rules), 401 (auth), 403 (roles/ownership), 404 (missing), 422 (validation).

## Testing

```bash
python tests/test_smoke.py        # 122 end-to-end checks against an isolated DB
```

The suite covers every Phase 1 module plus RBAC, self-service, attendance
controls, leave policies/balances, payroll breakdowns and admin analytics.

The frontend is type-checked and bundled with:

```bash
cd frontend
npm run build                     # tsc --noEmit + vite build
```
