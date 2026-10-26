# WorkSphere – HR Management System (HRMS)

A full-stack, role-driven HR platform: an async FastAPI backend plus a React +
TypeScript single-page app. Phase 1 delivered the seven core modules (auth,
employees, attendance, leaves, payroll, dashboard, notifications). Phase 2 adds
RBAC hardening, an employee self-service portal, advanced attendance, leave
policies/balances, detailed payroll breakdowns and admin user management. Phase 3
adds shift scheduling and automated attendance, a leave calendar, secure employee
documents, performance reviews, advanced analytics, smart notifications and
server-side employee search.

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
│   │   ├── shifts.py              # shifts + attendance automation
│   │   ├── documents.py           # secure file validation/storage
│   │   └── leave_balances.py      # policy/balance bootstrap + helpers
│   └── routers/
│       ├── auth.py                # /auth              Module 1
│       ├── employees.py           # /employees         Module 2 + 20
│       ├── users.py               # /users             Module 13 (Admin)
│       ├── self_service.py        # /me                Module 9
│       ├── attendance.py          # /attendance        Modules 3 + 10
│       ├── shifts.py              # /shifts            Module 14
│       ├── leave_policies.py      # /leave-policies    Module 11
│       ├── leaves.py              # /leaves            Modules 4 + 11
│       ├── leave_calendar.py      # /leave-calendar    Module 15
│       ├── documents.py           # /documents         Module 16
│       ├── performance.py         # /performance       Module 17
│       ├── analytics.py           # /analytics         Module 18
│       ├── payroll.py             # /payroll           Modules 5 + 12
│       ├── dashboard.py           # /dashboard         Modules 6 + 13
│       └── notifications.py       # /notifications     Modules 7 + 19
├── scripts/seed_demo.py           # demo data seeder
├── tests/test_smoke.py            # end-to-end API suite (196 checks)
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

On startup the app creates missing tables and adds Phase 2/3 columns to an
existing SQLite database (idempotent), ensures default leave policies and
per-employee leave balances exist, and seeds the morning, evening and night
shifts. The optional attendance automation loop only starts when
`AUTO_ATTENDANCE_ENABLED=true`.

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
| Manage shifts / run attendance automation | – | ✓ | ✓ |
| View team leave calendar (all departments) | – | ✓ | ✓ |
| Manage any employee document | – | ✓ | ✓ |
| View own document vault | ✓ | ✓ | ✓ |
| Publish/delete performance reviews | – | ✓ | ✓ |
| View own performance reviews | ✓ | ✓ | ✓ |
| Advanced search + analytics | – | ✓ | ✓ |
| Send smart alerts | – | ✓ | ✓ |
| View operational dashboard | – | ✓ | ✓ |
| Manage users, roles, activation | – | – | ✓ |
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
| GET | `/employees/search` | HR/Admin | Advanced search by role, shift, rating, attendance and availability with pagination |
| GET | `/employees/facets` | HR/Admin | Distinct departments/designations/roles plus shift options |
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

### Shifts & attendance automation

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| GET | `/shifts/` | Any | Morning, evening and night shift definitions |
| POST | `/shifts/` | HR/Admin | Create a shift (UTC start/end, cross-midnight allowed) |
| POST | `/shifts/assign` | HR/Admin | Assign or replace an employee’s single active shift |
| GET | `/shifts/assignments` | Own/HR/Admin | Shift assignments (all for staff) |
| GET | `/shifts/me` | Any | Current employee’s shift |
| GET | `/shifts/schedule?date=...` | Any | Daily schedule with attendance, lateness and early-exit flags |
| DELETE | `/shifts/assignments/{employee_id}` | HR/Admin | Remove a fixed shift |
| POST | `/shifts/auto-process?date=...` | HR/Admin | Mark absences, recalculate late/early exits, skip approved leave |

Late/early-exit checks use each employee’s shift window when assigned, otherwise
the configured company hours. Time values are stored and compared in UTC.
Automation is idempotent and can also run on a schedule when
`AUTO_ATTENDANCE_ENABLED=true`.

### Leave calendar

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| GET | `/leave-calendar/?month=YYYY-MM` | Own/HR/Admin | Calendar entries; employees see their department |
| GET | `/leave-calendar/team?date=...` | Any | Available teammates and people on leave for a day |
| GET | `/leave-calendar/conflicts` | Any | Check concurrent approved leave for a department/date range |

`MAX_CONCURRENT_DEPARTMENT_LEAVE` enables an optional overlap cap (default `0`
disables it).

### Documents

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| POST | `/documents/upload` | Any | Multipart upload; employees may only upload to their own profile |
| GET | `/documents/` | Own/HR/Admin | List documents with optional employee/type filters |
| GET | `/documents/{id}` | Owner/HR/Admin | Document metadata |
| GET | `/documents/{id}/download` | Owner/HR/Admin | Authenticated download (no public URL) |
| DELETE | `/documents/{id}` | HR/Admin | Delete metadata and stored file |

Uploads are validated by extension **and** magic bytes, capped at
`MAX_DOCUMENT_SIZE_MB`, stored under `DOCUMENT_STORAGE_PATH` with random UUID
filenames, and protected against path traversal. Set
`ALLOWED_DOCUMENT_EXTENSIONS` to change the allow-list.

### Performance

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| POST | `/performance/` | HR/Admin | Publish a review (1–5 rating + feedback); notifies the employee |
| GET | `/performance/` | Own/HR/Admin | Review list; employees only see their own |
| GET | `/performance/summary/team` | HR/Admin | Average rating, distribution and department rollups |
| GET | `/performance/summary/{employee_id}` | Own/HR/Admin | Per-employee rating summary |
| GET | `/performance/{id}` | Owner/HR/Admin | Single review |
| PATCH | `/performance/{id}` | HR/Admin | Update period, rating or feedback |
| DELETE | `/performance/{id}` | HR/Admin | Delete a review |

### Advanced analytics

| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| GET | `/analytics/report` | HR/Admin | Combined report: overview, attendance/leave trends, performance, departments |
| GET | `/analytics/overview` | HR/Admin | Workforce KPIs for the filtered range |
| GET | `/analytics/attendance-trends` | HR/Admin | Day/week/month attendance series |
| GET | `/analytics/leave-trends` | HR/Admin | Monthly leave status series |
| GET | `/analytics/performance-insights` | HR/Admin | Rating distribution and department averages |
| GET | `/analytics/departments` | HR/Admin | Department headcount, attendance, leave and ratings |

All analytics endpoints accept `start_date`, `end_date` (max 366 days) and
`department`; trend endpoints also accept `granularity=day|week|month`.

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
| GET | `/notifications/alerts/summary` | HR/Admin | Unread, late-today, pending leave and expiring-document counters |
| POST | `/notifications/alerts/late-attendance` | HR/Admin | Send deduplicated late-arrival reminders |
| POST | `/notifications/alerts/document-expiry` | HR/Admin | Send deduplicated document-expiry reminders |
| POST | `/notifications/alerts/run-all` | HR/Admin | Run every smart alert scan |

Smart alerts use a per-user `dedupe_key`, so re-running a scan never sends the
same reminder twice. The UI polls notifications and refreshes on the
`worksphere:notifications` browser event.

## Database

New in Phase 3:

- `shifts(id, name, start_time, end_time, created_at)` — seeded MORNING 09:00–17:00, EVENING 14:00–22:00, NIGHT 22:00–06:00 (UTC)
- `employee_shifts(id, employee_id, shift_id, assigned_at)` — one active shift per employee
- `documents(id, employee_id, file_name, file_url, stored_name, content_type, file_size, document_type, expiry_date, uploaded_by_id, uploaded_at)`
- `performance(id, employee_id, review_period, rating, feedback, reviewed_by_id, created_at)` — unique per employee/period
- `attendance.shift_id` links a check-in to the shift active at the time

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
- Document uploads: extension allow-list, magic-byte sniffing, 10 MB cap,
  UUID filenames, path-traversal guards and authenticated-only downloads.
- Employees can only read their own documents, reviews and shift; HR/Admin
  access is re-checked on every request.
- Errors: 400 (business rules), 401 (auth), 403 (roles/ownership), 404 (missing), 422 (validation).

## Testing

```bash
python tests/test_smoke.py        # 196 end-to-end checks against an isolated DB
```

The suite covers every Phase 1/2 module plus shifts and automation, the leave
calendar, secure document upload/download, performance reviews, advanced
analytics, smart alerts and advanced employee search.

The frontend is type-checked and bundled with:

```bash
cd frontend
npm run build                     # tsc --noEmit + vite build
```
