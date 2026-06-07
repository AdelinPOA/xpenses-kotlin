# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Workflow

Use **Opus 4.6** for planning, coordination, orchestration, and code review. Use **Sonnet agents** for coding implementation tasks.

## Project Tracking (MANDATORY)

At the START of every session, read `HANDOFF.md` and `README.md` for current state. At the END, update both and push to GitHub. GitHub is the single source of truth — see HANDOFF.md for session-by-session history.

## Commands

```bash
# Start all services (frontend + backend + PostgreSQL)
docker compose up -d --build

# Rebuild single service
docker compose up -d --build backend

# View logs
docker compose logs -f backend

# Access PostgreSQL
docker exec -it xpenses-db psql -U xpenses

# Run all tests (101 tests, ~40s, inside backend container)
make test

# Run tests with stop-on-first-failure
make test-quick

# Run a single test file
docker compose exec backend pytest tests/test_auth.py -v

# Run a single test function
docker compose exec backend pytest tests/test_auth.py::test_login_success -v

# Lint check / auto-fix
make lint
make lint-fix

# Test login (get cookies)
curl -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}'

# Test authenticated endpoint
curl -b /tmp/cookies.txt http://localhost:8001/api/expenses

# Health check
curl http://localhost:8001/api/health
```

## Ports

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| Frontend (Next.js) | 3001 | 3000 |
| Backend (FastAPI) | 8001 | 8000 |
| PostgreSQL | not exposed | 5432 |

## Architecture

### Backend (FastAPI + asyncpg)

**No ORM.** All database access is raw SQL via asyncpg. Use `$1, $2` positional placeholders — never `?` or `%s`. asyncpg requires native Python `datetime` objects for TIMESTAMPTZ columns — never pass `.isoformat()` strings.

**Two DB access patterns:**
- `get_db()` — FastAPI dependency, yields a connection. Used in route handlers.
- `get_pool().acquire()` — direct pool access. Used in services outside FastAPI DI (`fx_service.py`, `auth.py`, `seed.py`).

**Auth:** JWT access tokens (15 min) + refresh tokens (7 days), both in httpOnly cookies. `get_current_user()` dependency reads the `access_token` cookie. `require_role(*roles)` stacks on it for role gating. Four roles: `technician`, `manager`, `chef_finance`, `mod`.

**Schema:** `database.py` runs DDL on startup via `init_db()`. No migration tool — uses `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` with existence checks. Seed users created by `seed.py` (gated behind `SEED_DEMO_USERS` env var).

**Router prefix:** All API routes are under `/api/` (e.g., `/api/expenses`, `/api/auth/login`).

### Report State Machine

```
draft → submitted → approved → paid
                  → rejected (expenses detached back to draft)
submitted → draft (via recall, by owner)
```

- Approval requires `manager` or `chef_finance` role, and you cannot approve your own report.
- Payment requires `chef_finance` role.
- Only `draft` reports/expenses can be edited or deleted.
- Rejecting a report detaches its expenses and resets them to `draft`.

### Frontend (Next.js 15 + React 19)

**Tailwind CSS v4** with CSS-first config (`@import "tailwindcss"` in `globals.css`). No `tailwind.config.js`. Dark mode uses `@custom-variant dark (&:where(.dark, .dark *))` with `.dark` class on `<html>`.

**Data fetching:** TanStack Query v5 + axios. The axios instance (`lib/api.ts`) sets `withCredentials: true` for cookie auth. Query keys centralized in `lib/queryKeys.ts`.

**Auth flow:** `AuthProvider` context wraps the app via `Providers.tsx`. `useAuth()` hook provides `user`, `logout`, `setUser`. Next.js middleware (`middleware.ts`) redirects unauthenticated users to `/login` by checking the `access_token` cookie.

**Layout:** `AppShell` provides sidebar + main content. Sidebar is a responsive drawer (overlay on mobile, fixed on desktop at `lg` breakpoint). `ThemeProvider` manages light/dark/system, persisted in localStorage.

### Docker Networking (dual-URL pattern)

Frontend uses two different URLs to reach the backend:
- **Server-side (SSR/rewrites):** `INTERNAL_API_URL=http://backend:8000/api` — container-to-container via Docker network.
- **Client-side (browser):** `NEXT_PUBLIC_API_URL=http://localhost:8001/api` — via host port mapping.

`next.config.ts` has a rewrite rule that proxies `/api/*` to the backend using `INTERNAL_API_URL`.

## Key Patterns

- **FX conversion:** Primary: Frankfurter API (ECB rates). Fallback: fawazahmed0/currency-api. Rates cached per `(currency, date)` in `fx_rates` table. Changing amount/currency/date on an expense triggers automatic FX recalculation.
- **OCR Scanning:** Integrated EasyOCR for receipts (`POST /api/ocr/scan`). Automatically extracts date, merchant, amount and currency. Validates languages via `ocr_languages` setting. Fallbacks to lookahead on total amounts.
- **Receipt storage:** Files in `/app/data/receipts/` (Docker volume), organized by `YYYY/MM/`. Multiple receipts per expense. Path traversal protection in `storage.py`. Allowed: JPG, PNG, GIF, PDF, WEBP (max 10MB).
- **PDF export:** `reportlab` generates the main report PDF. Receipt PDFs are appended via `pypdf`. Receipt images rendered 2-per-row.
- **Dashboard scoping:** `chef_finance` and `mod` see org-wide data; other roles see only their own.

## Testing

Tests run inside the backend container against a `xpenses_test` PostgreSQL database (created/dropped per session). `conftest.py` provides:
- `client` — httpx `AsyncClient` with ASGI transport (no real HTTP)
- `pool` — asyncpg pool to the test DB
- `login(client, username)` — sets auth cookies on client (password defaults to username)
- `create_expense(client, **kwargs)` / `create_report(client, **kwargs)` — quick data creation
- `new_client()` — fresh `AsyncClient` for multi-user tests
- `clean_tables` fixture truncates transactional data after each test; users + categories persist across session

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
