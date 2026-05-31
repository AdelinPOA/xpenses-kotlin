# HANDOFF.md — xpenses_copy

> Last updated: 2026-05-31 (session 2)  
> Author: Claude (AI assistant session)

---

## What This Project Is

Self-hosted expense management app (alternative to Zoho Expenses). FastAPI backend + Next.js frontend + PostgreSQL, running in Docker Compose on port 3001 (frontend) / 8001 (backend API).

## Latest Session (2026-05-31, session 2)

### What Was Done
- **Phase 4 design spec completed and approved** — authentication & role-based access control
- Design spec committed at `docs/superpowers/specs/2026-05-31-authentication-and-roles-design.md`

### Design Summary
- 4 roles: Technician, Manager, Chef of Finances, MOD (app admin)
- JWT access tokens (15 min) + refresh tokens (7 days) in httpOnly cookies
- Local test accounts (tech1/manager1/cfo1/mod1) for dev, AD/LDAP for production
- LDAP authenticates identity, MOD assigns roles in-app
- New tables: `users`, `refresh_tokens`; `user_id` column added to `expenses` and `expense_reports`
- New report statuses: `approved`, `rejected` (Manager approval step between submitted and paid)
- New frontend pages: Login, Approvals, Payments, User Management (/admin/users)
- New backend routers: auth.py, users.py
- New packages: PyJWT, bcrypt

### What's Next
- **Invoke `writing-plans` skill** to create the implementation plan from the approved spec
- Then implement Phase 4

## Current State: OPERATIONAL

All 3 Docker containers running, all endpoints healthy:

| Service | Container | Port | Status |
|---------|-----------|------|--------|
| PostgreSQL 16 | `xpenses-db` | 5432 (internal) | Healthy |
| FastAPI backend | `xpenses-backend` | 8001 → 8000 | `{"status":"ok"}` |
| Next.js frontend | `xpenses-frontend` | 3001 → 3000 | Serving (307 redirect to /dashboard) |

## Database Contents (PostgreSQL)

| Table | Rows | Notes |
|-------|------|-------|
| `expenses` | 9 | Migrated from original xpenses project |
| `expense_reports` | 2 | Reports with attached expenses |
| `categories` | 10 | Including remapped IDs (e.g., Laundry 225→9) |
| `fx_rates` | 11 | Cached ECB rates (UAH, GEL, HUF, etc.) |
| `receipts` | 10 | File references in `/app/data/receipts/` |

Data was migrated from Docker volume `xpenses_xpenses-data` (the original `/home/poa/xpenses/` project's live SQLite database).

---

## What Was Done (Migration from SQLite to PostgreSQL)

### Core Migration
1. **`backend/pyproject.toml`** — replaced `aiosqlite==0.21.0` with `asyncpg==0.30.0`
2. **`backend/xpenses/database.py`** — rewrote from aiosqlite to asyncpg connection pool (`asyncpg.create_pool`), added `get_pool()` accessor
3. **All routers** (`expenses.py`, `reports.py`, `categories.py`, `dashboard.py`) — converted from SQLite `?` placeholders to PostgreSQL `$1, $2`, removed `.isoformat()` calls (asyncpg needs native datetime objects for TIMESTAMPTZ)
4. **`services/fx_service.py`** — fully rewritten from standalone `get_db()` calls to `get_pool().acquire()` context manager
5. **`services/storage.py`** — updated for asyncpg syntax
6. **`docker-compose.yml`** — added `postgres:16-alpine` service with healthcheck, `depends_on` condition, port 3001 for frontend
7. **`frontend/next.config.ts`** — added `INTERNAL_API_URL` env var for server-side API proxy (Docker networking: `localhost` inside container ≠ host)

### PDF Export Redesign
**`services/pdf_export.py`** — completely rewritten to match Zoho Expenses quality:
- Company logo (`assets/company_logo.png`) + "Newtech Automation" branding
- Report metadata (ID, status, submitted by, report duration in DD.MM.YYYY)
- Expense summary table with per-expense FX rates (e.g., `1 UAH = 0.019385 EUR`)
- Report summary by currency (grouped breakdown with EUR equivalents)
- Report summary row (Total − Non Reimbursable − Advance = Total Reimbursable)
- Signature area with line + name
- 2-per-row receipt image grid (halved page count from 12 to 6)
- PDF receipt merging via pypdf
- Safe `_date_str()` helper for asyncpg datetime objects

### Frontend Changes
- **`ExpenseForm.tsx`** — fixed redirect after save (goes back to report page when `reportId` is set)
- **`Sidebar.tsx`** — added NT logo above "xpenses" text
- **`frontend/public/logo.png`** — NT logo for sidebar
- **Various pages** — minor fixes for asyncpg-compatible API responses

### Company Branding
- **`backend/xpenses/config.py`** — added `company_name`, `submitter_name`, `submitter_email` settings
- **`backend/xpenses/assets/company_logo.png`** — 300×300 RGBA PNG (extracted from Zoho PDF)

---

## Uncommitted Changes

**21 modified files + 4 untracked paths** — none of the migration work has been committed yet.

### Modified files (all part of the SQLite→PostgreSQL migration + PDF redesign):
```
README.md
backend/pyproject.toml
backend/xpenses/config.py
backend/xpenses/database.py
backend/xpenses/models.py
backend/xpenses/routers/categories.py
backend/xpenses/routers/dashboard.py
backend/xpenses/routers/expenses.py
backend/xpenses/routers/reports.py
backend/xpenses/services/fx_service.py
backend/xpenses/services/pdf_export.py
backend/xpenses/services/storage.py
docker-compose.yml
frontend/app/expenses/new/page.tsx
frontend/app/expenses/page.tsx
frontend/app/reports/[id]/page.tsx
frontend/app/reports/new/page.tsx
frontend/components/expenses/ExpenseForm.tsx
frontend/components/layout/Sidebar.tsx
frontend/lib/api.ts
frontend/next.config.ts
```

### Untracked files:
```
AUDIT_FIXES.md              — audit log from data migration session
backend/xpenses/assets/     — company_logo.png for PDF export
frontend/public/             — logo.png for sidebar
refactor_routers.py          — one-off migration helper scripts (can be deleted)
refactor_routers_v2.py       — one-off migration helper scripts (can be deleted)
```

### Files safe to delete:
- `refactor_routers.py` and `refactor_routers_v2.py` — one-shot scripts used during migration, no longer needed
- `AUDIT_FIXES.md` — migration audit log, informational only

---

## Environment

### `.env` (project root)
```
CORS_ORIGINS=["http://localhost:3001"]
DATA_DIR=/app/data
DEFAULT_CURRENCY=EUR
```

### Docker Compose environment (set inline, not in .env):
- `DATABASE_URL=postgresql://xpenses:xpenses@db:5432/xpenses` — on `backend` service
- `INTERNAL_API_URL=http://backend:8000/api` — on `frontend` service (server-side proxy)

### Security note
PostgreSQL credentials (`xpenses:xpenses`) are hardcoded in `docker-compose.yml`. For production, move to `.env` and use secrets management.

---

## Key Architectural Decisions

1. **asyncpg over SQLAlchemy** — direct asyncpg was chosen to stay close to the original aiosqlite approach (raw SQL queries). No ORM layer.
2. **`get_pool()` function** — services that need DB access outside FastAPI dependency injection (like `fx_service.py`) use `get_pool().acquire()` instead of the `get_db()` dependency.
3. **`INTERNAL_API_URL`** — Docker networking requires the frontend container to reach the backend via service name (`http://backend:8000/api`), not `localhost`. The `NEXT_PUBLIC_API_URL` is still used for client-side browser requests.
4. **Native datetime objects** — asyncpg requires Python `datetime` objects for TIMESTAMPTZ columns. Never use `.isoformat()` when inserting/updating timestamps.
5. **PDF receipt grid** — 2-per-row layout with PDF receipts merged as separate pages via pypdf (not rendered as images).

---

## Common Commands

```bash
# Start all services
docker compose up -d --build

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Rebuild single service
docker compose up -d --build backend

# Access PostgreSQL
docker exec -it xpenses-db psql -U xpenses

# Check table counts
docker exec xpenses-db psql -U xpenses -c "SELECT 'expenses', count(*) FROM expenses UNION ALL SELECT 'expense_reports', count(*) FROM expense_reports;"

# Backend health check
curl http://localhost:8001/api/health
```

---

## Known Issues

- **None critical** — app is stable and all features work
- Next.js dev server shows CORS `allowedDevOrigins` warning (harmless in dev)
- PostgreSQL credentials hardcoded (dev-only concern)

## What's Next (from README roadmap)

- **Phase 4**: Authentication & Users (AD/LDAP, JWT, roles)
- **Phase 5**: Approval Workflow (manager approval, email notifications)
- **Phase 6**: Analytics & Reporting (trends, budgets, CSV export)

---

## How to Resume

1. `cd /home/poa/xpenses_copy`
2. `docker compose up -d` (containers should already be running)
3. Open http://localhost:3001 in browser
4. API docs at http://localhost:8001/docs (FastAPI Swagger)
5. All changes are uncommitted — review with `git diff` before committing
