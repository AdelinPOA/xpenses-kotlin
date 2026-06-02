# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Tracking (MANDATORY)

At the START of every session, read `HANDOFF.md` and `README.md` for current state. At the END, update both and push to GitHub. GitHub is the single source of truth — see HANDOFF.md for session-by-session history.

## Commands

```bash
# Start all services
docker compose up -d --build

# Rebuild single service
docker compose up -d --build backend

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Access PostgreSQL
docker exec -it xpenses-db psql -U xpenses

# Test login
curl -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}'

# Test authenticated endpoint
curl -b /tmp/cookies.txt http://localhost:8001/api/expenses

# Backend health check
curl http://localhost:8001/api/health
```

No test framework is configured for either backend or frontend. No linter scripts are wired up (ruff is configured in pyproject.toml but no `lint` script exists).

## Ports

- Frontend: `3001` (host) → `3000` (container)
- Backend API: `8001` (host) → `8000` (container)
- PostgreSQL: `5432` (internal only, not exposed to host)

## Architecture

### Backend (FastAPI + asyncpg)

**No ORM.** All database access is raw SQL via asyncpg. Use `$1, $2` placeholders (not `?`). asyncpg requires native Python `datetime` objects for TIMESTAMPTZ columns — never pass `.isoformat()` strings.

**Two DB access patterns:**
- `get_db()` — FastAPI dependency, yields a connection from the pool. Used in routers.
- `get_pool().acquire()` — direct pool access. Used in services outside FastAPI DI (e.g., `fx_service.py`, `auth.py`).

**Auth flow:** JWT access tokens (15 min) + refresh tokens (7 days), both in httpOnly cookies. `get_current_user()` is a FastAPI dependency that reads the `access_token` cookie. `require_role(*roles)` stacks on it for role gating. Four roles: `technician`, `manager`, `chef_finance`, `mod`.

**Schema management:** `database.py` runs DDL on startup via `init_db()`. No migration tool — schema changes are `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` with existence checks. Seed users created by `seed.py` (gated behind `SEED_DEMO_USERS` env var).

**Router prefix:** All API routes are prefixed with `/api/` (e.g., `/api/expenses`, `/api/auth/login`).

### Frontend (Next.js 15 + React 19)

**Tailwind CSS v4** with CSS-first config (`@import "tailwindcss"` in globals.css). No `tailwind.config.js`. Dark mode uses `@custom-variant dark (&:where(.dark, .dark *))`.

**Data fetching:** TanStack Query v5 with axios. The axios instance (`lib/api.ts`) has `withCredentials: true` for cookie-based auth. Query keys are centralized in `lib/queryKeys.ts`.

**Auth:** `AuthProvider` context wraps the app. `useAuth()` hook provides `user`, `logout`, `setUser`. Next.js middleware (`middleware.ts`) redirects unauthenticated users to `/login`.

**Layout:** `AppShell` component provides the sidebar + main content area. All authenticated pages import `AppShell`. The sidebar is a responsive drawer (overlay on mobile, fixed on desktop at `lg` breakpoint).

**Theme:** `ThemeProvider` manages light/dark/system preference, persisted in localStorage, applies `.dark` class on `<html>`.

### Docker Networking

Frontend server-side uses `INTERNAL_API_URL=http://backend:8000/api` to reach the backend (container-to-container). `next.config.ts` has a rewrite rule that proxies `/api/*` to the backend. Client-side uses `NEXT_PUBLIC_API_URL=http://localhost:8001/api`.

## Key Patterns

- **Expense FX conversion:** Primary: Frankfurter API (ECB, ~30 currencies). Fallback: fawazahmed0/currency-api (200+ currencies). Rates cached per `(currency, date)` in `fx_rates` table.
- **Report workflow:** `draft → submitted → approved → paid` (or `→ rejected`). Approval requires `manager` or `chef_finance` role. Payment requires `chef_finance`.
- **Receipt storage:** Files stored in `/app/data/receipts/` (Docker volume). Multiple receipts per expense. Supported: JPG, PNG, PDF, WEBP.

## Environment Variables

Key `.env` settings for development:
```
CORS_ORIGINS=["http://localhost:3001"]
JWT_SECRET=dev-secret-change-in-production
COOKIE_SECURE=false
SEED_DEMO_USERS=true
```

Test accounts (when `SEED_DEMO_USERS=true`): `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1`.

## GitHub

- **Repo:** `AdelinPOA/xpenses`
- **Branch:** `main`
- Always commit and push after completing work
