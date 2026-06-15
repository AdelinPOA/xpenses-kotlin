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

# Run all tests (~185 tests, inside backend container — targets the Python test suite)
make test

# Run tests with stop-on-first-failure
make test-quick

# Run a single test file
docker compose exec backend pytest tests/test_auth.py -v

# Run a single test function
docker compose exec backend pytest tests/test_auth.py::test_login_success -v

# Lint check / auto-fix (Python)
make lint
make lint-fix

# Tests with coverage report
make test-cov

# Run pre-commit hooks on all files (ruff + trailing-whitespace + end-of-file)
make format

# Build Kotlin backend locally (inside backend-kotlin-jpa/)
./gradlew bootJar --no-daemon

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
| MinerU OCR (opt-in) | 8002 | 8000 |

## Active Backend: Kotlin (Spring Boot JPA)

**The live backend is `backend-kotlin-jpa/`**, built as a standard JVM jar (`bootJar`) and served on port 8080 inside the container (mapped to host 8001). The Python `backend/` directory is legacy reference code — its test suite still runs, but the Python process is not running in the current `docker-compose.yml`.

### Kotlin Backend Stack

| Layer | Technology |
|---|---|
| Language | Kotlin 2.1.0 / Java 21 |
| Framework | Spring Boot 3.4.3 (Spring MVC, not WebFlux) |
| ORM | Spring Data JPA + Hibernate |
| Database driver | PostgreSQL JDBC |
| Migrations | Flyway (`V1__init.sql` in `src/main/resources/db/migration/`) |
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
│   ├── ExpenseController.kt    # /api/expenses — CRUD, receipts, duplicate
│   ├── ReportController.kt     # /api/reports — full state machine, PDF, ZIP
│   ├── AdvanceController.kt    # /api/reports/{id}/advances + /api/advances/pending
│   ├── MileageController.kt    # /api/reports/{id}/mileage
│   ├── UserController.kt       # /api/users
│   ├── CategoryController.kt   # /api/categories
│   ├── DashboardController.kt  # /api/dashboard
│   ├── AppSettingsController.kt# /api/settings/*
│   ├── OcrController.kt        # /api/ocr/*
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
└── services/
    ├── FxService.kt            # Frankfurter + fallback; caches in fx_rates table
    ├── PdfService.kt           # OpenPDF report generation + PDFBox receipt merging
    ├── OcrService.kt           # EasyOCR subprocess + Gemini + MinerU + NaiveBayes classifier
    ├── StorageService.kt       # Local storage fully implemented; remote providers (S3/SFTP/SMB/WebDAV) stubbed
    ├── LdapService.kt
    ├── CryptoService.kt        # HKDF-SHA256 Fernet key derivation (mirrors Python crypto.py)
    ├── EmailSettingsService.kt
    ├── EmailImportService.kt   # IMAP delegation email parsing
    └── ReportService.kt
```

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

### Report State Machine (identical to Python)

```
draft → submitted → approved → paid
                  → rejected (expenses detached back to draft)
submitted → draft (via recall, by owner)
```

- Approval: `manager` or `chef_finance`; cannot approve own report.
- Payment: `chef_finance` only.
- Only `draft` expenses/reports can be edited or deleted.

### Key Implementation Notes

- **In-memory filtering**: `ExpenseController.listExpenses` fetches by user (or all) then filters `reportId`, `categoryId`, `status`, `fromDate`, `toDate` in Kotlin. For large datasets this is less efficient than the Python SQL-WHERE approach.
- **Remote storage stubbed**: `StorageService.downloadFile` and `uploadFile` for non-local providers return stub responses or throw — only `local` provider is functional.
- **OcrService runs EasyOCR as a subprocess**: `runEasyOcrSubprocess()` spawns a Python child process. This requires Python + EasyOCR to be installed in the Kotlin container image (currently handled via the shared Docker volume).
- **Daily allowance**: hardcoded in `PdfService.calculateDailyAllowance()` and `ReportController` — not yet read from `app_settings` (this was fixed in the Python backend but not yet ported to Kotlin).
- **CORS**: hardcoded to `http://localhost:3001` in `SecurityConfig`. Change this for production.

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

## Python Backend (Legacy Reference)

The `backend/` directory contains the original FastAPI + asyncpg implementation. It is **not running** in the current stack but:
- Its test suite (`make test`) is the primary automated test coverage for the API contract
- Its router/service code is the reference for features not yet fully verified in the Kotlin port
- Raw SQL patterns with `$1, $2` placeholders, no ORM

The Python backend used Alembic for migrations; those migration files are in `backend/xpenses/migrations/versions/`. The Kotlin backend uses a separate Flyway `V1__init.sql` that reproduces the full schema independently.

---

## Key Cross-Cutting Patterns

- **FX conversion:** Frankfurter API (primary) → fawazahmed0/currency-api (fallback). Cached per `(currency, date)` in `fx_rates` table. Raises `IllegalArgumentException` if API returns `0.0`.
- **Crypto:** HKDF-SHA256 key derivation from `JWT_SECRET` with a per-subsystem `info` label. Each subsystem (LDAP, OCR, IMAP, storage) gets a distinct encryption key. Rotating `JWT_SECRET` invalidates all encrypted settings.
- **App settings table:** Key/value JSON rows in `app_settings`. Keys: `mileage_rate_before_tax`, `mileage_rate_after_tax`, `daily_allowance_rate`, `ldap_config`, `ocr_config`, `imap_config`, `storage_config`, `storage_migration_status`. All use upsert on the key column.
- **Receipt storage:** Pluggable via `StorageService`. Local provider fully working. Remote providers (S3, SFTP, SMB, WebDAV) are stubbed in the Kotlin backend. Filenames sanitized before storage.
- **OCR:** EasyOCR (local subprocess) + Gemini 2.5 Flash (cloud) + MinerU (self-hosted HTTP API). Both active provider and EasyOCR run in parallel for comparison tracking.
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
CORS_ORIGINS=["http://localhost:3001"]        # used by Python backend only
JWT_SECRET=dev-secret-change-in-production
COOKIE_SECURE=false
SEED_DEMO_USERS=true                          # used by Python backend only
SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/xpenses
SPRING_DATASOURCE_USERNAME=xpenses
SPRING_DATASOURCE_PASSWORD=xpenses
```

Test accounts (seeded by `DataInitializer.kt`): `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1`.

## GitHub & Branching Strategy

- **Repo:** `AdelinPOA/xpenses-kotlin`
- **Branch Policy:** Always implement new features or fixes on dedicated branches (`feat/feature-name` or `fix/bug-fix-name`). Do not develop directly on `main`.
- **Workflow:** Create branch → implement (use OpenSpec workflow for significant features) → `make test` + `make lint` pass → commit and push → merge to `main`.

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`:
1. PostgreSQL service spun up, Python dependencies installed, lint (`ruff`) + pre-commit hooks run.
2. Python tests with coverage executed; report uploaded to Codecov.
3. Docker images built for both backend and frontend.

Note: CI currently runs the **Python** test suite, not Kotlin tests. Kotlin has no automated test suite yet.
