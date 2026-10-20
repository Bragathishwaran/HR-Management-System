# WorkSphere – HR Management System (HRMS) Backend

Production-ready FastAPI backend implementing 7 core HRMS modules:
Authentication & Roles, Employee Management, Attendance, Leaves, Payroll,
Dashboard KPIs and Notifications.

## Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Framework  | FastAPI (async)                                         |
| ORM        | SQLAlchemy 2.0 (async) + `aiosqlite`                    |
| Database   | SQLite (`hrms.db`, created automatically)               |
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
│   ├── main.py               # FastAPI app, CORS, lifespan, health
│   ├── config.py             # pydantic-settings (SECRET_KEY, DB URL, CORS)
│   ├── database.py           # async engine, session factory, get_db
│   ├── models.py             # SQLAlchemy ORM models + enums
│   ├── schemas.py            # Pydantic v2 request/response schemas
│   ├── security.py           # bcrypt hashing + JWT create/decode
│   ├── dependencies.py       # get_current_user, require_role, profile resolver
│   ├── services/
│   │   └── notifications.py  # notification helper (leave/payroll events)
│   └── routers/
│       ├── auth.py           # /auth      Module 1
│       ├── employees.py      # /employees Module 2
│       ├── attendance.py     # /attendance Module 3
│       ├── leaves.py         # /leaves    Module 4
│       ├── payroll.py        # /payroll   Module 5
│       ├── dashboard.py      # /dashboard Module 6
│       └── notifications.py  # /notifications Module 7
├── scripts/seed_demo.py      # demo data seeder
├── tests/test_smoke.py       # end-to-end API test suite
├── .env / .env.example
├── requirements.txt
└── run.py
```

## Quick Start

```bash
pip install -r requirements.txt

# optional: load demo accounts (admin1/hr1/alice/bob, password Passw0rd!123)
python -m scripts.seed_demo

# run the API
python run.py            # or: uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

## API Overview

| Method | Path                          | Access      | Description |
| ------ | ----------------------------- | ----------- | ----------- |
| POST   | `/auth/register`              | Public*     | Register user (*HR/ADMIN roles need an ADMIN token; first user bootstraps as ADMIN) |
| POST   | `/auth/token`                 | Public      | OAuth2 login → JWT |
| GET    | `/auth/me`                    | Any         | Current user |
| POST   | `/employees/`                 | HR/Admin    | Add employee (link existing user **or** create account inline) |
| GET    | `/employees/`                 | Any         | List + filter (`q`, `department`, `designation`, `status`, paging). Salary masked for non-staff |
| GET    | `/employees/{id}`             | Any         | Employee profile |
| PUT    | `/employees/{id}`             | HR/Admin    | Update employee |
| POST   | `/attendance/check-in`        | Employee    | Check in for today |
| POST   | `/attendance/check-out`       | Employee    | Check out; auto working hours + PRESENT/HALF_DAY |
| GET    | `/attendance/history`         | Any         | Own history; HR/Admin may filter by `employee_id`, dates |
| POST   | `/leaves/apply`               | Employee    | Submit leave (overlap check) |
| GET    | `/leaves/`                    | Any         | Own / all leaves with filters |
| PATCH  | `/leaves/{id}/status`         | HR/Admin    | Approve/reject → triggers notification |
| POST   | `/payroll/generate`           | HR/Admin    | `net = basic + bonus − deductions`; notifies employee |
| GET    | `/payroll/`                   | Any         | Own / all payroll records |
| GET    | `/dashboard/stats`            | HR/Admin    | KPI summary |
| GET    | `/notifications/`             | Any         | Own notifications (+ unread count) |
| PATCH  | `/notifications/{id}/read`    | Owner       | Mark as read |

## Security

- Passwords hashed with **bcrypt** (12 rounds, per-password salt, 72-byte truncation guard).
- JWTs: HS256, `sub`/`role`/`iat`/`exp`/`iss` claims, TTL from `ACCESS_TOKEN_EXPIRE_MINUTES`.
- `HTTPBearer` scheme — exposed as "Authorize" in Swagger.
- Role guards via `require_role([...])` dependency factory (403 on mismatch).
- Salary data visible only to HR/ADMIN.
- Errors: 400 (validation/business rules), 401 (auth), 403 (roles), 404 (missing).

## Testing

```bash
python -m pytest tests/ -v        # or run the file directly:
python tests/test_smoke.py
```
