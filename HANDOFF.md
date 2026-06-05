# HANDOFF.md — xpenses_copy

> Last updated: 2026-06-05 (session 8)  
> Author: Claude (AI assistant session)

---

## What This Project Is

Self-hosted expense management app (alternative to Zoho Expenses). FastAPI backend + Next.js frontend + PostgreSQL, running in Docker Compose on port 3001 (frontend) / 8001 (backend API).

**AI Workflow:** Opus 4.6 for planning, coordination, orchestration, and code review. Sonnet agents for coding implementation tasks.

## Current State: OPERATIONAL (Phase 7 Partial + Advance Payments v1 + Test Suite)

All 3 Docker containers running, all endpoints healthy:

| Service | Container | Port | Status |
|---------|-----------|------|--------|
| PostgreSQL 16 | `xpenses-db` | 5432 (internal) | Healthy |
| FastAPI backend | `xpenses-backend` | 8001 → 8000 | `{"status":"ok"}` |
| Next.js frontend | `xpenses-frontend` | 3001 → 3000 | Serving (307 redirect to /login if unauthenticated) |

## Latest Session (2026-06-05, session 8)

### What Was Done
- **Advance payments v2 — full request/pay/reject workflow** (IMPLEMENTED + TESTED)
  - Two advance types: self-paid (instant `paid`) and requested (`requested` → `paid`/`rejected`)
  - Technicians can add self-paid advances and request advances from the company
  - Managers/chef_finance can approve requests (setting final amount), reject, and add paid advances to any report
  - Dedicated page at `/reports/[id]/advances` replaces inline advances UI
  - Global manager page at `/advances` for all pending requests across users
  - Only `paid` advances count in `total_advances` and `total_reimbursable`
  - 67 tests passing (49 original + 18 advance tests)

### Design & Plan Documents
- **Spec:** `docs/superpowers/specs/2026-06-05-advance-payments-redesign.md`
- **Implementation Plan:** `docs/superpowers/plans/2026-06-05-advance-payments-redesign.md`

### New Files
- `frontend/app/reports/[id]/advances/page.tsx` — dedicated report-scoped advances page
- `frontend/app/advances/page.tsx` — global manager advances dashboard

### Modified Files
- `backend/xpenses/database.py` — 7 new columns on advance_payments + status index
- `backend/xpenses/models.py` — AdvancePayBody, AdvanceRejectBody, PendingAdvanceOut + updated existing models
- `backend/xpenses/routers/advances.py` — complete rewrite: type=paid/request, pay/reject endpoints, global pending
- `backend/xpenses/main.py` — registered global_router for /api/advances/pending
- `backend/xpenses/routers/reports.py` — filter total_advances to paid-only
- `backend/xpenses/services/pdf_export.py` — filter PDF advances to paid-only
- `backend/tests/conftest.py` — updated create_advance helper with advance_type param
- `backend/tests/test_advances.py` — 18 tests (9 original updated + 9 new workflow tests)
- `frontend/lib/api.ts` — updated AdvancePayment interface + PendingAdvance
- `frontend/lib/queryKeys.ts` — added advanceKeys.pending
- `frontend/app/reports/[id]/page.tsx` — removed inline advances, clickable metric card
- `frontend/components/layout/Sidebar.tsx` — added Advances nav for managers

### Previous Session (2026-06-04, session 7)
- **Advance payments v1 implemented** — basic inline CRUD within reports
  - `advance_payments` table with FX conversion
  - CRUD router at `/api/reports/{id}/advances`
  - Inline form + table on report detail page
  - PDF export with advance payments table and real summary values
  - 10 tests for advances (59 total tests passing)
  - Updated CLAUDE.md, HANDOFF.md, README.md with AI workflow docs

## Previous Session (2026-06-02, session 6)

### What Was Done
- **Backend test suite** — 49 tests across 4 files, all passing
  - `test_auth.py` (12) — login, refresh, logout, role gating, deactivated user
  - `test_reports.py` (13) — full state machine: draft→submitted→approved→paid, rejection, recall, self-approval prevention
  - `test_expenses.py` (12) — CRUD, ownership isolation, draft-only edit/delete, FX recalculation
  - `test_categories_users.py` (12) — categories CRUD + MOD role gating, user management
- **Test infrastructure** — conftest.py with session-scoped test DB, auto-cleanup, login/create helpers
- **Linting** — ruff wired up via Makefile (`make lint`, `make lint-fix`)
- **Makefile** — test, lint, up, down, rebuild, logs targets
- **No backend code changes** — tests validate existing behavior

### New Files
- `backend/tests/conftest.py` — fixtures, helpers, test DB lifecycle
- `backend/tests/test_auth.py`, `test_reports.py`, `test_expenses.py`, `test_categories_users.py`
- `Makefile` — developer workflow targets

### Modified Files
- `backend/pyproject.toml` — test deps (pytest, pytest-asyncio, ruff), pytest config
- `backend/Dockerfile` — installs test deps (`.[test]`)
- `docker-compose.yml` — volume mounts for tests/ and pyproject.toml
- `backend/xpenses/routers/reports.py` — ruff auto-fix: removed unused ExpenseOut import, sorted imports

### Previous Session (2026-06-01, session 5)
- **Dark mode** — full dark theme across all 16 page/component files
  - ThemeProvider with 3-state toggle: light / dark / system (follows OS preference)
  - Persisted in localStorage, toggles `.dark` class on `<html>`
  - Tailwind CSS v4 `@custom-variant dark` for class-based dark mode
  - Theme toggle button in sidebar (Sun/Moon/Monitor icon cycle)
- **Mobile responsive layout**
  - Sidebar collapses into a drawer overlay below `lg` breakpoint (1024px)
  - Mobile header bar with hamburger menu + "xpenses" title
  - All tables wrapped in `overflow-x-auto` for horizontal scroll
  - Status filter pills wrap on narrow screens (`flex-wrap`)
  - Page headers stack vertically on mobile (`flex-col sm:flex-row`)
  - Stat cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- **No backend changes** — purely frontend

### New Files
- `frontend/components/ThemeProvider.tsx` — theme state + localStorage + system preference detection

### Modified Files (20)
- `globals.css`, `layout.tsx`, `Providers.tsx` — dark mode infrastructure
- `AppShell.tsx` — mobile header, responsive margin
- `Sidebar.tsx` — drawer behavior, theme toggle
- `StatCard.tsx`, `Badge.tsx`, `EmptyState.tsx` — dark: variants
- `ExpenseForm.tsx` — dark form inputs
- All 11 page files — dark: classes + responsive improvements

### Previous Session (2026-05-31, session 4)
- Security hardening: COOKIE_SECURE, strict samesite, SEED_DEMO_USERS gate

### Previous Session (2026-05-31, session 3)
- **Phase 4 fully implemented and tested** — authentication & role-based access control
- Full approval workflow verified: tech submits → manager approves → CFO pays
- Security fix: removed fail-open IDOR on NULL user_id
- Database startup order fix: user_id indexes run after column migration

### Implementation Summary
- **Backend**: `auth.py` (JWT/bcrypt utilities), `seed.py` (4 test users), `routers/auth.py` (login/refresh/logout/me), `routers/users.py` (MOD-only user management)
- **All existing routers protected**: expenses/reports/categories/dashboard scoped by user_id
- **New endpoints**: `POST /reports/{id}/approve`, `POST /reports/{id}/reject`, role-gated `POST /reports/{id}/pay`
- **Frontend**: AuthProvider, Next.js middleware (redirect to /login), login page, role-based sidebar
- **New pages**: `/approvals` (Manager/CFO), `/payments` (CFO), `/admin/users` (MOD)
- **Report status flow**: draft → submitted → approved → paid (or → rejected)

### Test Accounts

| Username | Password | Role |
|----------|----------|------|
| tech1 | tech1 | Technician |
| manager1 | manager1 | Manager |
| cfo1 | cfo1 | Chef of Finances |
| mod1 | mod1 | Moderator (app admin) |

---

## Database Contents (PostgreSQL)

| Table | Notes |
|-------|-------|
| `categories` | 10 default categories |
| `expenses` | Now has `user_id` column |
| `expense_reports` | Now has `user_id`, `approved_by`, `approved_at`, `rejected_reason` |
| `receipts` | File references |
| `fx_rates` | Cached ECB rates |
| `users` | 4 seeded test users |
| `refresh_tokens` | JWT refresh token hashes |
| `advance_payments` | Cash advances per report (v1: basic CRUD; v2 plan: request/pay workflow) |

---

## Key Architectural Decisions

1. **asyncpg over SQLAlchemy** — direct raw SQL, no ORM
2. **`get_pool()`** — services outside FastAPI DI use `get_pool().acquire()`
3. **`INTERNAL_API_URL`** — Docker networking (frontend → backend via service name)
4. **Native datetime objects** — asyncpg requires Python datetime for TIMESTAMPTZ
5. **JWT in httpOnly cookies** — access token (15 min) + refresh token (7 days), token rotation on refresh
6. **Role-based access** — `get_current_user()` dependency + `require_role()` for role gates
7. **LDAP prep** — `auth_source` column + config flags, not implemented yet

---

## Common Commands

```bash
# Start all services
docker compose up -d --build

# View logs
docker compose logs -f backend

# Access PostgreSQL
docker exec -it xpenses-db psql -U xpenses

# Test login
curl -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}'

# Test authenticated endpoint
curl -b /tmp/cookies.txt http://localhost:8001/api/expenses
```

---

## Known Issues

- None critical — app is stable with auth working
- Next.js dev server shows CORS `allowedDevOrigins` warning (harmless in dev)
- PostgreSQL credentials hardcoded in docker-compose.yml (dev-only concern)
- `datetime.utcnow()` deprecation warnings in Pyright (works fine, pre-existing pattern)

## What's Next

- **IMMEDIATE**: Execute advance payments redesign plan (`docs/superpowers/plans/2026-06-05-advance-payments-redesign.md`)
- **Phase 5**: Approval Workflow enhancements (email notifications, delegation)
- **Phase 6**: Analytics & Reporting (trends, budgets, CSV export)
- **Phase 7 remaining**: Expense duplication, recurring expenses, OCR receipt scanning
- **Production**: Set `LDAP_ENABLED=true`, implement LDAP bind, deploy on company server

---

## How to Resume

1. `cd /home/poa/xpenses_copy`
2. `docker compose up -d` (containers should already be running)
3. Open http://localhost:3001 → login with any test account
4. API docs at http://localhost:8001/docs (FastAPI Swagger)
