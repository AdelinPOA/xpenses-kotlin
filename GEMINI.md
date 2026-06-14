# GEMINI.md

This file provides guidance to Antigravity (Gemini-powered AI coding assistant) when working with code in this repository.

## AI Workflow & Agent Capabilities

Antigravity operates in a pair-programming mode.
- **Workflow Orchestration**: When performing changes, recommend or use slash commands like `/goal` (for comprehensive tasks), `/schedule` (for recurring timers), `/grill-me` (to align on plans), or `/teamwork-preview` (to coordinate multiple agents).
- **Subagents**: You can spawn `research` subagents (read-only) or `self` subagents (full read/write capabilities) using the `invoke_subagent` tool to run tasks concurrently or search in a separate context without cluttering the main conversation window.
- **Background Tasks**: Long-running commands (like `docker compose up` or running the test suite) can be run as background tasks. Use the `manage_task` tool to check their status or terminate them. Do not loop or poll; wait for the system to notify you of completion.

## Project Tracking (MANDATORY)

At the START of every session, read [HANDOFF.md](file:///home/poa/xpenses_copy/HANDOFF.md) and [README.md](file:///home/poa/xpenses_copy/README.md) for the current state. At the END, update both and push to GitHub. GitHub is the single source of truth — see [HANDOFF.md](file:///home/poa/xpenses_copy/HANDOFF.md) for session-by-session history.

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

# Run all tests (185 tests, ~40s, inside backend container)
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

# Tests with coverage report
make test-cov

# Run pre-commit hooks on all files (ruff + trailing-whitespace + end-of-file)
make format

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

- **No ORM.** All database access is raw SQL via asyncpg. Use `$1, $2` positional placeholders — never `?` or `%s`. asyncpg requires native Python `datetime` objects for TIMESTAMPTZ columns — never pass `.isoformat()` strings.
- **Two DB access patterns:**
  - `get_db()` — FastAPI dependency, yields a connection. Used in route handlers.
  - `get_pool().acquire()` — direct pool access. Used in services outside FastAPI DI (`fx_service.py`, `auth.py`, `seed.py`).
- **Auth:** JWT access tokens (15 min) + refresh tokens (7 days), both in httpOnly cookies. `get_current_user()` dependency reads the `access_token` cookie. `require_role(*roles)` stacks on it for role gating. Four roles: `technician`, `manager`, `chef_finance`, `mod`. The `mod` role is a superuser: can create local users (`POST /api/users`), manage LDAP/AD config, and access all admin pages. It does not participate in the expense/report workflow.
- **Schema:** `database.py` runs DDL on startup via `init_db()`. Schema migrations are managed via **Alembic** (programmatically invoked at startup). If a legacy database without an `alembic_version` table is detected, it is stamped to the head migration. Seed users created by `seed.py` (gated behind `SEED_DEMO_USERS` env var).
- **Router prefix:** All API routes are under `/api/` (e.g., `/api/expenses`, `/api/auth/login`).

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

- **Tailwind CSS v4** with CSS-first config (`@import "tailwindcss"` in `globals.css`). No `tailwind.config.js`. Dark mode uses `@custom-variant dark (&:where(.dark, .dark *))` with `.dark` class on `<html>`.
- **Data fetching:** TanStack Query v5 + axios. The axios instance (`lib/api.ts`) sets `withCredentials: true` for cookie auth. Query keys centralized in `lib/queryKeys.ts`.
- **Auth flow:** `AuthProvider` context wraps the app via `Providers.tsx`. `useAuth()` hook provides `user`, `logout`, `setUser`. Next.js middleware (`middleware.ts`) redirects unauthenticated users to `/login` by checking the `access_token` cookie.
- **Role-gated UI:** Check `user?.role` from `useAuth()`. Pattern used across pages: `const isPrivileged = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager"`. Pay button renders only for `chef_finance`; approve/reject for `manager | chef_finance`.
- **Layout:** `AppShell` provides sidebar + main content. Sidebar is a responsive drawer (overlay on mobile, fixed on desktop at `lg` breakpoint). `ThemeProvider` manages light/dark/system, persisted in localStorage.

### Docker Networking (dual-URL pattern)

Frontend uses two different URLs to reach the backend:
- **Server-side (SSR/rewrites):** `INTERNAL_API_URL=http://backend:8000/api` — container-to-container via Docker network.
- **Client-side (browser):** `NEXT_PUBLIC_API_URL=http://localhost:8001/api` — via host port mapping.

`next.config.ts` has a rewrite rule that proxies `/api/*` to the backend using `INTERNAL_API_URL`.

## Key Patterns

- **FX conversion:** Primary: Frankfurter API (ECB rates). Fallback: fawazahmed0/currency-api. Rates cached per `(currency, date)` in `fx_rates` table. Changing amount/currency/date on an expense triggers automatic FX recalculation.
- **OCR Scanning:** Hybrid local & cloud OCR system. Supported providers: local EasyOCR (default) and Google Gemini 2.5 Flash API (Cloud). Config stored in DB `app_settings` under `ocr_config` key. API keys are encrypted via Fernet (password `xpenses-gemini-ocr-pw`). To prevent outbound name resolution timeouts, the backend container uses public DNS servers (`8.8.8.8`, `1.1.1.1`) specified in `docker-compose.yml`. Features:
  - Gemini structured JSON schema matching (`category_id` and `description` extraction).
  - Pure Python self-learning Multinomial Naive Bayes category classifier ([classifier_service.py](file:///home/poa/xpenses_copy/backend/xpenses/services/classifier_service.py)) trained on raw database scan texts.
  - Automatic fallback to EasyOCR with classification heuristics and warnings when Gemini API fails.
  - Drag-and-drop receipt upload drop-zone and full form autofill (category, description, amount, currency, date, merchant, tax) in [ExpenseForm.tsx](file:///home/poa/xpenses_copy/frontend/components/expenses/ExpenseForm.tsx).
- **Receipt storage:** Files in `/app/data/receipts/` (Docker volume), organized by `YYYY/MM/`. Multiple receipts per expense. Path traversal protection in `storage.py`. Allowed: JPG, PNG, GIF, PDF, WEBP (max 10MB).
- **Expense Image Preview on Upload:** Side-by-side split layout on the expense form pages (new/edit). Left: input fields (max-w-lg). Right: dynamically-sized preview panel (`lg:flex-1`). Handles images (with dynamic scale zoom + click-and-drag panning coordinates managed via `useRef`/`useEffect` lifecycles) and PDFs (via embedded HTML `<iframe>`). If multiple receipts are attached, a file tab header switches the active preview item.
- **PDF export:** `reportlab` generates the main report PDF. Receipt PDFs are appended via `pypdf`. Receipt images rendered 2-per-row.
- **Dashboard scoping:** `chef_finance` and `mod` always see org-wide data (no flag needed). `manager` sees org-wide when `?all=true` is passed. All other roles see only their own data regardless of flags.
- **Mileage:** `POST/GET/DELETE /api/reports/{id}/mileage` — per-report km records with dual tax rates (before/after). Rates are CFO-editable via `PATCH /api/settings/mileage-rates` (stored in `app_settings` DB table, not env vars).
- **Digital signatures:** `POST /api/users/me/signature` stores a base64 PNG. `POST /api/reports/{id}/sign` stamps the report. Signature is stored per-user in the `users` table.
- **Advance payments:** Two routers — `APIRouter` at `/api/reports/{id}/advances` for per-report CRUD, and `global_router` at `/api/advances/pending` for the org-wide manager/CFO queue. Manager direct-pay creates an advance already marked `paid`; employee requests create `status=requested` advances that CFO pays separately.
- **LDAP/AD authentication:** Config stored as JSON in `app_settings` key `ldap_config` (DB-authoritative, not env vars). Bind password Fernet-encrypted with HKDF-SHA256 key derived from `jwt_secret`. `ldap_service.py` provides `get_ldap_config()`, `save_ldap_config()`, `test_connection()`, `sync_users()`, and `authenticate_ldap()`. Login handler in `auth.py` reads DB config and calls `authenticate_ldap()` for `auth_source='ldap'` users. Sync deactivates directory-absent users and revokes their refresh tokens.
- **App settings:** Generic `app_settings` table (key/value JSON rows) stores mileage tax rates, LDAP config, SMTP config, and OCR config. `app_settings.py` router handles mileage rates and OCR configuration endpoints (restricting `/api/settings/ocr` to `mod` role). All use upsert on the `key` column.

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

## GitHub & Branching Strategy

- **Repo:** `AdelinPOA/xpenses`
- **Branch Policy:** Always implement new features or fixes on dedicated branches (e.g., `feat/feature-name` or `fix/bug-fix-name`). Do not develop directly on `main`.
- **Workflow:**
  1. Create a feature branch from the latest `main`.
  2. Implement changes (using the OpenSpec workflow if applicable).
  3. Ensure all tests (`make test`) and lint checks (`make lint`) pass on the branch.
  4. Commit and push the branch to remote, and merge it back to `main` (or let the user merge) once verified.

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`:
1. PostgreSQL service spun up, dependencies installed, lint (`ruff`) + pre-commit hooks run.
2. Tests with coverage executed; report uploaded to Codecov.
3. Docker images built for both backend and frontend.

`pytest-cov` and `pre-commit` are in `[project.optional-dependencies] test` in `pyproject.toml`.
