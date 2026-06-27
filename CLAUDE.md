# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Workflow & Agent Capabilities

This repo is worked on in a pair-programming mode. To maximize efficiency and reduce token/cost consumption, follow these guidelines. (Note: `GEMINI.md` and `AGENTS.md` hold the equivalent instructions for the Antigravity/Gemini and Codex/other agents respectively; keep all three consistent when changing shared workflow rules.)

- **Token & Cost Monitoring**: The `/usage` slash command shows token consumption and cost.
- **Spec-driven work**: For significant features, use the OpenSpec skills (`/openspec-propose`, `/openspec-apply-change`, `/openspec-sync-specs`, `/openspec-archive-change`) — see the OpenSpec Workflow section below. Use the `brainstorming` skill to align on requirements before implementation, and `/schedule` or `/loop` for recurring/timed tasks.
- **Subagents strategy** (only spawn when the user asks or the task clearly benefits — cold-start cost is real):
  - Use the read-only **`Explore`** agent for broad fan-out searches across many files when you only need the conclusion, not the file contents.
  - Use the **`Plan`** agent to design an implementation strategy for a non-trivial task.
  - Use **`general-purpose`** for multi-step research/implementation that should be isolated from the main conversation.
  - Keep subagent prompts precise and narrowly scoped to limit context usage.
- **Background tasks**: Run long-running commands (`docker compose up`, the test suite, native builds) with Bash `run_in_background: true`, or via the Task tools. Do not loop or poll — you are re-invoked when the work finishes.
- **Build & Development Optimization**:
  - **Do NOT** run `docker compose up -d --build` or `docker compose build` frequently. Rebuilding Docker containers consumes CPU and adds overhead. Prefer the hot-swap workflow (see README "Backend Hot-Swapping").
  - Run the Spring Boot backend on a **standard JVM** (standard JAR execution) during active development rather than compiling GraalVM Native images (which takes several minutes).
  - Prefer targeted Gradle commands (e.g., `./gradlew compileKotlin`, or `./gradlew test --tests '...'` for a single class) instead of complete system builds.
  - **JDK constraint**: Kotlin 2.1.0 compiles only on **JDK 21 or 22**. `make build` / `make test` run `check-java-version` first and fail with a clear message on JDK 23+; build via Docker in that case. A `.java-version` file pins the version for SDKMAN!/jEnv/asdf.

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

# Build Kotlin backend locally (inside backend-kotlin-jpa/)
make build
# or: cd backend-kotlin-jpa && ./gradlew bootJar --no-daemon

# Run the JUnit/Testcontainers suite (spins up a throwaway PostgreSQL via Docker)
make test
# Run a single test class
cd backend-kotlin-jpa && ./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'

# Smoke-test the running backend
make test-health
make test-login

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
| Backend (Kotlin/Spring) | 8001 | 8080 |
| PostgreSQL | 5432 | 5432 |

## Active Backend: Kotlin (Spring Boot JPA)

**The live backend is `backend-kotlin-jpa/`**, built as a standard JVM jar (`bootJar`) and served on port 8080 inside the container (mapped to host 8001). The Python FastAPI backend has been removed — migration is 100% complete.

### Kotlin Backend Stack

| Layer | Technology |
|---|---|
| Language | Kotlin 2.1.0 / Java 21 |
| Framework | Spring Boot 3.4.5 (Spring MVC, not WebFlux) |
| ORM | Spring Data JPA + Hibernate |
| Database driver | PostgreSQL JDBC |
| Migrations | Flyway (`V1`–`V16` in `src/main/resources/db/migration/`; never edit an applied migration, add a new one) |
| Tests | JUnit 5 + Spring MockMvc + Testcontainers (PostgreSQL); base class `IntegrationTestBase` |
| Auth | Spring Security + custom `JwtAuthenticationFilter` |
| JWT | JJWT 0.12.5 |
| PDF | OpenPDF (iText fork) + PDFBox |
| HTTP client | Spring `RestClient` (synchronous) |
| Build | Gradle (`build.gradle.kts`), JDK 21, `eclipse-temurin:21-jre-alpine` runtime image |
| GraalVM native | `Dockerfile.native` exists for production native image; `Dockerfile` (active) uses standard JVM |

### Kotlin Source Layout

```
backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/
├── XpensesApplication.kt
├── config/
│   ├── DataInitializer.kt      # Seeds categories, users, mileage rates on startup
│   └── SecurityConfig.kt       # CORS, JWT filter, role-based URL guards, stateless sessions
├── controllers/                # One controller per domain, all under /api/*
│   ├── AuthController.kt       # /api/auth — login, refresh, logout, me
│   ├── ExpenseController.kt    # /api/expenses — CRUD, receipts, duplicate (delegates to ExpenseService)
│   ├── ReportController.kt     # /api/reports — state machine, PDF, ZIP (delegates to ReportService)
│   ├── AdvanceController.kt    # /api/reports/{id}/advances + /api/advances/pending
│   ├── MileageController.kt    # /api/reports/{id}/mileage
│   ├── InventoryController.kt  # /api/inventory — items + requests
│   ├── InsuranceController.kt  # /api/insurance — insurance file uploads
│   ├── UserController.kt       # /api/users
│   ├── CategoryController.kt   # /api/categories
│   ├── DashboardController.kt  # /api/dashboard
│   ├── AppSettingsController.kt# /api/settings/*
│   ├── OcrController.kt        # /api/ocr/* — async; enqueues jobs, polls status
│   ├── SignatureController.kt  # /api/users/me/signature, /api/reports/{id}/sign
│   ├── LdapSettingsController.kt
│   └── HealthController.kt     # /api/health
├── models/
│   └── Models.kt               # All JPA @Entity classes in one file
├── repositories/
│   └── Repositories.kt         # All Spring Data JPA repositories in one file
├── security/
│   ├── JwtAuthenticationFilter.kt  # Reads access_token cookie, sets request attribute "currentUser"
│   └── JwtTokenProvider.kt
└── services/                   # Business logic extracted out of controllers
    ├── ExpenseService.kt       # Expense CRUD/validation/scoping logic
    ├── ReportService.kt        # Report state-machine transitions, totals, scoping
    ├── ExpenseMapper.kt        # Entity ↔ DTO mapping (keeps controllers thin)
    ├── ExportService.kt        # CSV/Excel export via Apache POI
    ├── FxService.kt            # Frankfurter + fallback; caches in fx_rates table
    ├── PdfService.kt           # OpenPDF report generation + PDFBox receipt merging
    ├── OcrService.kt           # EasyOCR subprocess + Gemini + NaiveBayes classifier
    ├── AsyncOcrService.kt      # Runs OCR off-thread; persists results to ocr_jobs table
    ├── StorageService.kt       # Dispatches to storage/ providers
    ├── storage/
    │   ├── StorageProvider.kt      # Provider interface
    │   └── S3StorageProvider.kt    # S3 impl; local provider lives in StorageService
    ├── LdapService.kt
    ├── CryptoService.kt        # HKDF-SHA256 Fernet key derivation (mirrors Python crypto.py)
    ├── EmailSettingsService.kt
    └── EmailImportService.kt   # IMAP delegation email parsing
```

Controllers are intentionally thin: they read `currentUser`, deserialize the request, and delegate to a service. Put business logic, validation, and data-scoping in the service layer (`ExpenseService`, `ReportService`), not in the controller.

### Auth Pattern in Kotlin

`JwtAuthenticationFilter` runs on every request. It reads the `access_token` cookie, validates and decodes it via `JwtTokenProvider`, loads the full `User` entity from the DB, and sets it as a Spring `SecurityContext` authentication **and** as `request.setAttribute("currentUser", user)`.

Controllers read the current user with:
```kotlin
val currentUser = request.getAttribute("currentUser") as? User
    ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
```

Role guards use both Spring Security's `@PreAuthorize("hasRole('mod')")` (for URL-level rules in `SecurityConfig`) and inline `currentUser.role` checks inside controllers (for data-scoping logic).

URL-level role guards configured in `SecurityConfig`:
- `POST /api/users` — requires `mod`
- `/api/settings/ocr/**`, `/api/settings/ldap/**`, `/api/settings/imap/**` — requires `mod`

### JPA / Database Patterns

**JPA with Hibernate** — unlike the Python backend which used raw SQL only, the Kotlin backend uses JPA entities and Spring Data repositories. Filters that aren't expressible as repository methods are applied in-memory after `findAll()`.

Repositories are in a single file (`Repositories.kt`). Key custom queries use `@Query` with JPQL `JOIN FETCH` to avoid N+1:
```kotlin
@Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses WHERE r.id = :id")
fun findByIdWithExpenses(@Param("id") id: Int): Optional<ExpenseReport>
```

**Flyway** manages schema migrations. `ddl-auto: validate` — Hibernate validates the schema against entities but does not create or alter tables. All DDL must go through Flyway migrations in `src/main/resources/db/migration/`.

**Jackson** is configured with `property-naming-strategy: SNAKE_CASE` in `application.yml`, so Kotlin `camelCase` fields serialize to `snake_case` JSON automatically. DTOs that need to override this use explicit `@JsonProperty` annotations.

### Report State Machine

```
draft → submitted → approved → paid
                  → rejected (expenses detached back to draft)
submitted → draft (via recall, by owner)
```

- Approval: `manager` or `chef_finance`; cannot approve own report.
- Payment: `chef_finance` only.
- Only `draft` expenses/reports can be edited or deleted.

### Key Implementation Notes

- **Soft delete**: `ExpenseReport`, `Expense`, `Receipt` (and other financial records, migration `V13`) use Hibernate `@SQLDelete` + `@SQLRestriction("deleted = false")`. `repository.delete(...)` issues an `UPDATE ... SET deleted = true` instead of a `DELETE`, and all reads are transparently filtered to non-deleted rows. Do not assume a `delete` physically removes the row.
- **In-memory filtering**: expense listing fetches by user (or all) then filters `reportId`, `categoryId`, `status`, `fromDate`, `toDate` in Kotlin (in `ExpenseService`). For large datasets consider adding SQL-level WHERE clauses via custom repository queries.
- **Storage providers**: `StorageService` dispatches to `storage/` providers. `local` is fully functional; `S3StorageProvider` exists. Other remote providers (SFTP/SMB/WebDAV) are still stubbed.
- **Async OCR**: `OcrController` enqueues work and `AsyncOcrService` runs it off the request thread, persisting status/results to the `ocr_jobs` table (migration `V14`); clients poll for completion. `OcrService` still spawns EasyOCR as a Python subprocess (`runEasyOcrSubprocess()`), requiring Python + EasyOCR in the container image (shared Docker volume).
- **Daily allowance**: read from `app_settings` table via `getDailyAllowanceRate()` in `ReportController`. Configurable via `PATCH /api/settings/daily-allowance-rate` by `chef_finance`.
- **CORS**: configured via `cors.allowed-origins` (env `CORS_ALLOWED_ORIGINS`) in `SecurityConfig`. Set to your production domain.

---

## Frontend (Next.js 15 + React 19)

**Tailwind CSS v4** with CSS-first config (`@import "tailwindcss"` in `globals.css`). No `tailwind.config.js`. Dark mode uses `@custom-variant dark (&:where(.dark, .dark *))` with `.dark` class on `<html>`.

**Data fetching:** TanStack Query v5 + axios. The axios instance (`lib/api.ts`) sets `withCredentials: true` for cookie auth. Query keys centralized in `lib/queryKeys.ts`.

**Auth flow:** `AuthProvider` context wraps the app via `Providers.tsx`. `useAuth()` hook provides `user`, `logout`, `setUser`. Next.js middleware (`middleware.ts`) redirects unauthenticated users to `/login` by checking the `access_token` cookie; allows through if either `access_token` or `refresh_token` is present.

**Role-gated UI:** Check `user?.role` from `useAuth()`. Pattern: `const isPrivileged = user?.role === "chef_finance" || user?.role === "mod" || user?.role === "manager"`.

**Layout:** `AppShell` provides sidebar + main content. Sidebar is a responsive drawer (overlay on mobile, fixed on desktop at `lg` breakpoint). `ThemeProvider` manages light/dark/system, persisted in localStorage.

**File downloads:** Use `axios.get(..., { responseType: 'blob' })` → `URL.createObjectURL` → synthetic anchor click → `URL.revokeObjectURL`. Do **not** use bare `<a href>` for authenticated file endpoints (cookies don't forward cross-port).

### Docker Networking

Frontend uses two URLs to reach the backend:
- **Server-side:** `INTERNAL_API_URL=http://backend:8080/api` — container-to-container (note: port 8080, not 8000)
- **Client-side:** `NEXT_PUBLIC_API_URL=http://localhost:8001/api` — via host port mapping

`next.config.ts` proxies `/api/*` to `INTERNAL_API_URL`.

---

## Key Cross-Cutting Patterns

- **FX conversion:** Frankfurter API (primary) → fawazahmed0/currency-api (fallback). Cached per `(currency, date)` in `fx_rates` table. Raises `IllegalArgumentException` if API returns `0.0`.
- **Crypto:** HKDF-SHA256 key derivation from `JWT_SECRET` with a per-subsystem `info` label. Each subsystem (LDAP, OCR, IMAP, storage) gets a distinct encryption key. Rotating `JWT_SECRET` invalidates all encrypted settings.
- **App settings table:** Key/value JSON rows in `app_settings`. Keys: `mileage_rate_before_tax`, `mileage_rate_after_tax`, `daily_allowance_rate`, `ldap_config`, `ocr_config`, `imap_config`, `storage_config`, `storage_migration_status`. All use upsert on the key column.
- **Receipt storage:** Pluggable via `StorageService` → `storage/` providers. Local and S3 providers work; SFTP/SMB/WebDAV are stubbed. Filenames sanitized before storage.
- **OCR:** EasyOCR (local subprocess) + Gemini 2.5 Flash (cloud). Both active provider and EasyOCR run in parallel for comparison tracking.
- **Dashboard scoping:** `chef_finance` and `mod` always see org-wide data. `manager` sees org-wide with `?all=true`. Others see only their own data.

## App Settings Keys

| Key | Type | Who edits |
|-----|------|-----------|
| `mileage_rate_before_tax` | float string | chef_finance |
| `mileage_rate_after_tax` | float string | chef_finance |
| `daily_allowance_rate` | float string (default 50.0) | chef_finance |
| `ldap_config` | JSON object (encrypted bind pw) | mod |
| `ocr_config` | JSON object (encrypted Gemini key) | mod |
| `imap_config` | JSON object (encrypted IMAP pw) | mod |
| `storage_config` | JSON object (encrypted credentials) | mod |
| `storage_migration_status` | JSON object | system |

## Environment Variables

Key `.env` settings for development:
```
JWT_SECRET=dev-secret-change-in-production
COOKIE_SECURE=false
SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/xpenses
SPRING_DATASOURCE_USERNAME=xpenses
SPRING_DATASOURCE_PASSWORD=xpenses
```

Test accounts (seeded by `DataInitializer.kt`): `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1`.

## GitHub & Branching Strategy

- **Repo:** `AdelinPOA/xpenses-kotlin`
- **Branch Policy:** Always implement new features or fixes on dedicated branches (`feat/feature-name` or `fix/bug-fix-name`). Do not develop directly on `main`.
- **Workflow:** Create branch → implement (use OpenSpec workflow for significant features) → `make test-health` + `make build` pass → commit and push → merge to `main`.

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`:
1. **gitleaks** — secrets scan via `gitleaks-action`
2. **build-kotlin** — JDK 21 (temurin); runs `./gradlew test bootJar --no-daemon` in `backend-kotlin-jpa/`
3. **build-frontend** — Node.js 22; `npm ci` + `npx tsc --noEmit` + `npm run lint` + `npm run build`
4. **build-docker** — `docker compose build` (needs both Kotlin and frontend builds)

There is now a JUnit 5 + MockMvc + Testcontainers suite under `backend-kotlin-jpa/src/test/` (state machine, controller, and service tests). `make test` runs it locally and requires Docker (Testcontainers starts a throwaway PostgreSQL).

## OpenSpec Workflow (MANDATORY)

**Always use OpenSpec when implementing a new feature.** This is required, not optional. Before writing any code:
1. Use the `/openspec-propose` skill to generate a proposal with design, specs, and tasks.
2. Get the proposal reviewed before implementation.
3. Use `/openspec-apply-change` to implement the tasks.
4. Use `/openspec-archive-change` to finalize when done.

Specs live under `openspec/specs/`, in-progress changes under `openspec/changes/`, completed ones under `openspec/changes/archive/`. Use the `/openspec-*` (or `/opsx:*`) skills to propose, apply, sync, and archive changes. Spec-driven work is the expected path for new features per the branching policy above.
