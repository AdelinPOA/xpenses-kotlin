# GEMINI.md

This file provides guidance to Antigravity (Gemini-powered AI coding assistant) when working with code in this repository.

> [!IMPORTANT]
> **Token Optimization Alert**: Read [TOKEN_OPTIMIZATION.md](file:///home/poa/xpenses-kotlin/TOKEN_OPTIMIZATION.md) immediately. The user wants you to optimize your build/migration workflow to save tokens, and introduce them to the `/usage` slash command.

## AI Workflow & Agent Capabilities

Antigravity operates in a pair-programming mode. To maximize efficiency and reduce token/cost consumption, always follow these guidelines:

- **Token & Cost Monitoring**: Mention and recommend the `/usage` slash command in the chat UI to allow the user to monitor token consumption and cost.
- **Workflow Orchestration**: Recommend or use slash commands like `/goal` (for comprehensive, long-running tasks), `/schedule` (for recurring timers), `/grill-me` (to align on plans through an interactive interview), or `/teamwork-preview` (to coordinate multiple agents).
- **Subagents Strategy**:
  - Spawn a **`research`** subagent (read-only) for large search queries or exploration steps (e.g., scanning large code directories) to avoid bloating the main conversation history.
  - Spawn a **`self`** subagent (read/write) to isolate specific implementational tasks or file generation.
  - Keep subagent prompts precise and focused on a single file or a narrow scope to limit context usage.
- **Background Tasks**: Long-running commands (like `docker compose up` or running test suites) should be run as background tasks. Use the `manage_task` tool to check status or terminate them. Do not loop or poll; wait for the system to notify you of completion.
- **Build & Development Optimization**:
  - **Do NOT** run `docker compose up -d --build` or `docker compose build` frequently. Rebuilding Docker containers consumes CPU and adds overhead.
  - Run the Spring Boot backend on a **standard JVM** (standard JAR execution) during active development rather than compiling GraalVM Native images (which takes several minutes).
  - Prefer targeted Gradle commands (e.g., `./gradlew compileKotlin` or `./gradlew test` for specific tests) instead of complete system builds.

## Project Tracking (MANDATORY)

At the START of every session, read [HANDOFF.md](file:///home/poa/xpenses-kotlin/HANDOFF.md) and [README.md](file:///home/poa/xpenses-kotlin/README.md) for the current state. At the END, update both and push to GitHub. GitHub is the single source of truth — see [HANDOFF.md](file:///home/poa/xpenses-kotlin/HANDOFF.md) for session-by-session history.

## Commands

```bash
# Start all services (frontend + backend + PostgreSQL)
docker compose up -d --build

# Rebuild single service (using optimized fast JVM mode)
docker compose up -d --build backend

# Build production GraalVM Native Image
docker compose -f docker-compose.yml build --build-arg DOCKERFILE=Dockerfile.native backend

# View logs
docker compose logs -f backend

# Access PostgreSQL
docker exec -it xpenses-db psql -U xpenses

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
| Backend (Spring Boot JVM) | 8001 | 8080 |
| PostgreSQL | not exposed | 5432 |

## Architecture

### Backend (Spring Boot 3.4.5 + Hibernate + JPA)

- **JPA & Hibernate.** All database access is managed via Spring Data JPA repositories. Eager relations are fetched using optimized JPQL `JOIN FETCH` queries to avoid N+1 select query issues.
- **Transactions:** Write operations (including token invalidation in `AuthController` and state machine updates in `ReportController`) are wrapped inside `@Transactional` blocks to ensure atomic execution.
- **Auth:** JWT access tokens (15 min) + refresh tokens (7 days), both in httpOnly cookies. Filtered using `JwtAuthenticationFilter` and verified against the context via the token provider.
- **Schema:** Database schemas are managed via **Flyway Migrations** (run programmatically on application startup under `src/main/resources/db/migration`). Seed categories, app settings, and test users are created by `DataInitializer.kt` upon fresh boots.
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
- **Server-side (SSR/rewrites):** `INTERNAL_API_URL=http://backend:8080/api` — container-to-container via Docker network.
- **Client-side (browser):** `NEXT_PUBLIC_API_URL=http://localhost:8001/api` — via host port mapping.

`next.config.ts` has a rewrite rule that proxies `/api/*` to the backend using `INTERNAL_API_URL`.

## Key Patterns

- **FX conversion:** Primary: Frankfurter API (ECB rates). Fallback: fawazahmed0/currency-api. Rates cached per `(currency, date)` in `fx_rates` table. Changing amount/currency/date on an expense triggers automatic FX recalculation.
- **OCR Scanning:** Hybrid local & cloud OCR system. Supported providers: local EasyOCR and Google Gemini 2.5 Flash API (Cloud). Config stored in DB `app_settings` under `ocr_config` key. API keys are encrypted via Fernet (password `xpenses-gemini-ocr-pw`). To prevent outbound name resolution timeouts, the backend container uses public DNS servers (`8.8.8.8`, `1.1.1.1`) specified in `docker-compose.yml`. Features:
  - Gemini structured JSON schema matching (`category_id` and `description` extraction).
  - Pure Python self-learning Multinomial Naive Bayes category classifier trained on raw database scan texts.
  - Automatic fallback to EasyOCR with classification heuristics and warnings when Gemini API fails.
  - Drag-and-drop receipt upload drop-zone and full form autofill (category, description, amount, currency, date, merchant, tax) in [ExpenseForm.tsx](file:///home/poa/xpenses-kotlin/frontend/components/expenses/ExpenseForm.tsx).
- **Receipt storage:** Files in `/app/data/receipts/` (Docker volume), organized by `YYYY/MM/`. Multiple receipts per expense. Path traversal protection in `StorageService.kt`. Allowed: JPG, PNG, GIF, PDF, WEBP (max 10MB).
- **Expense Image Preview on Upload:** Side-by-side split layout on the expense form pages (new/edit). Left: input fields (max-w-lg). Right: dynamically-sized preview panel (`lg:flex-1`). Handles images (with dynamic scale zoom + click-and-drag panning coordinates managed via `useRef`/`useEffect` lifecycles) and PDFs (via embedded HTML `<iframe>`). If multiple receipts are attached, a file tab header switches the active preview item.
- **PDF export:** `openpdf` generates the main report PDF. Receipt PDFs are appended via `pdfbox`. Receipt images rendered 2-per-row.
- **Dashboard scoping:** `chef_finance`, `mod`, and `manager` see org-wide data only when passing `?all=true` (the frontend defaults this on for `chef_finance`/`mod`); without it, they see only their own data, same as everyone else.
- **Mileage:** `POST/GET/DELETE /api/reports/{id}/mileage` — per-report km records with dual tax rates (before/after). Rates are CFO-editable via `PATCH /api/settings/mileage-rates` (stored in `app_settings` DB table, not env vars).
- **Digital signatures:** `POST /api/users/me/signature` stores a base64 PNG. `POST /api/reports/{id}/sign` stamps the report. Signature is stored per-user in the `users` table.
- **Advance payments:** Two routers — `AdvanceController` at `/api/reports/{id}/advances` for per-report CRUD, and global mappings at `/api/advances/pending` for the org-wide manager/CFO queue. Manager direct-pay creates an advance already marked `paid`; employee requests create `status=requested` advances that CFO pays separately.
- **LDAP/AD authentication:** Config stored as JSON in `app_settings` key `ldap_config` (DB-authoritative, not env vars). Bind password Fernet-encrypted with HKDF-SHA256 key derived from `jwt_secret`. `LdapService.kt` provides `getLdapConfig()`, `saveLdapConfig()`, `testConnection()`, `syncUsers()`, and `authenticateLdap()`. Login handler in `AuthController.kt` reads DB config and calls `authenticateLdap()` for `auth_source='ldap'` users. Sync deactivates directory-absent users and revokes their refresh tokens.
- **App settings:** Generic `app_settings` table (key/value JSON rows) stores mileage tax rates, LDAP config, SMTP config, and OCR config. `AppSettingsController.kt` handles mileage rates and OCR configuration endpoints (restricting `/api/settings/ocr` to `mod` role). All use upsert on the `key` column.

## Environment Variables

Key `.env` settings for development:
```
CORS_ORIGINS=["http://localhost:3001"]
JWT_SECRET=dev-secret-change-in-production
COOKIE_SECURE=false
SEED_DEMO_USERS=true
```

Test accounts (when `SEED_DEMO_USERS=true`): `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1`.

## OpenSpec Workflow (MANDATORY)

**Always use OpenSpec when implementing a new feature.** Before writing any code:
1. Use the `/openspec-propose` skill to generate a proposal with design, specs, and tasks.
2. Get the proposal reviewed before implementation.
3. Use `/openspec-apply-change` to implement the tasks.
4. Use `/openspec-archive-change` to finalize when done.

Specs live under `openspec/specs/`, in-progress changes under `openspec/changes/`, completed ones under `openspec/changes/archive/`.

## GitHub & Branching Strategy

- **Repo:** `AdelinPOA/xpenses`
- **Branch Policy:** Always implement new features or fixes on dedicated branches (e.g., `feat/feature-name` or `fix/bug-fix-name`). Do not develop directly on `main`.
- **Workflow:**
  1. Create a feature branch from the latest `main`.
  2. Implement changes (using OpenSpec workflow for significant features).
  3. Verify everything compiles and works correctly on the branch.
  4. Commit and push the branch to remote, and merge it back to `main` (or let the user merge) once verified.
