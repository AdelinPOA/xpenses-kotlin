# Codebase Structure

**Analysis Date:** 2026-08-14

## Directory Layout

```
xpenses-kotlin/
├── backend-kotlin-jpa/                 # Spring Boot / Kotlin REST backend application
│   ├── src/main/kotlin/eu/nt/xpenses/  # Main application Kotlin source code
│   │   ├── config/                     # Spring configurations (Security, Async, Cache, Validation)
│   │   ├── controllers/                # REST API controllers and endpoint definitions
│   │   ├── dto/                        # Domain-grouped Data Transfer Objects
│   │   ├── ingestion/                  # Background IMAP email ledger entities
│   │   ├── model/                      # JPA persistence entities
│   │   ├── models/                     # Shared model objects and helper DTOs
│   │   ├── report/                     # Report lifecycle state machine & review projections
│   │   ├── repositories/               # Spring Data JPA repositories
│   │   ├── security/                   # JWT filters, rate limiters, token providers
│   │   └── services/                   # Business logic, FX, OCR, PDF, storage engines
│   ├── src/main/resources/             # App properties, Flyway migrations, logging config
│   │   ├── db/migration/               # Flyway database migration scripts (V1..V32, V99, V100)
│   │   └── application.yml             # Spring Boot YAML configuration
│   ├── src/test/kotlin/eu/nt/xpenses/  # Backend JUnit / Spring Boot integration tests
│   ├── build.gradle.kts                # Gradle Kotlin DSL build script and dependency declarations
│   └── Dockerfile                      # Multi-stage production container build for backend
├── frontend/                           # Next.js 16 App Router web frontend
│   ├── app/                            # Next.js App Router routes, layouts, and page clients
│   │   ├── (routes)/                   # Page routes: dashboard, reports, expenses, admin, etc.
│   │   ├── globals.css                 # Global CSS and Tailwind CSS v4 directives
│   │   └── layout.tsx                  # Root HTML shell and global context providers
│   ├── components/                     # Reusable React UI and domain components
│   │   ├── dashboard/                  # Dashboard charts, stats, tables, and drawers
│   │   ├── expenses/                   # Expense forms, receipt scanners, upload zones
│   │   ├── layout/                     # AppShell, Sidebar, mobile navigation
│   │   ├── signature/                  # Digital canvas signature pad
│   │   └── ui/                         # Base UI widgets (Badge, SearchDropdown, EmptyState)
│   ├── i18n/                           # next-intl configuration and locale provider
│   ├── lib/                            # API clients, TypeScript types, auth helpers, query keys
│   │   ├── api/                        # Domain-specific API function modules
│   │   ├── types/                      # TypeScript type definition files
│   │   ├── api.ts                      # Axios client with refresh interceptor
│   │   ├── queryKeys.ts                # React Query cache key factory
│   │   └── serverApi.ts                # Server-side API fetching utilities
│   ├── messages/                       # JSON translation bundles (en.json, ro.json)
│   ├── public/                         # Static assets, icons, manifest.json, sw.js
│   ├── tests/                          # Playwright end-to-end and responsive test suites
│   ├── middleware.ts                   # Next.js edge route protection & auth guard
│   ├── next.config.ts                  # Next.js configuration and /api proxy rewrites
│   ├── package.json                    # Node dependencies and project scripts
│   └── Dockerfile                      # Multi-stage container build for frontend
├── docs/                               # Architectural decision records and documentation
│   └── adr/                            # ADR Markdown records (e.g., BNR FX rates)
├── openspec/                           # Open specifications and feature proposals
├── scripts/                            # Repository validation, sync, and maintenance scripts
├── docker-compose.yml                  # Service orchestration (PostgreSQL, Redis, Backend, Frontend)
└── Makefile                            # Common project management targets (dev, build, test)
```

## Directory Purposes

**`backend-kotlin-jpa/`:**
- **Purpose:** Full-featured Spring Boot / Kotlin REST backend service handling authentication, persistence, calculations, OCR, and storage.
- **Contains:** Kotlin source files (`.kt`), Gradle configuration (`build.gradle.kts`), Flyway SQL scripts (`.sql`), Dockerfiles.
- **Key files:** `XpensesApplication.kt`, `src/main/resources/application.yml`, `build.gradle.kts`.
- **Subdirectories:** `src/main/kotlin/eu/nt/xpenses/`, `src/main/resources/`, `src/test/`.

**`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/`:**
- **Purpose:** Primary Kotlin codebase partitioned by architectural responsibility.
- **Contains:**
  - `config/`: Spring bean definitions (`SecurityConfig.kt`, `AsyncConfig.kt`, `CacheConfig.kt`, `ValidationExceptionHandler.kt`).
  - `controllers/`: 19 REST endpoints (`ExpenseController.kt`, `ReportController.kt`, `ReviewQueueController.kt`, `AuthController.kt`, etc.).
  - `dto/`: Domain request/response envelopes (`dto/expense/`, `dto/report/`, `dto/dashboard/`, `dto/user/`, `dto/search/`, `dto/auth/`).
  - `model/`: Hibernate JPA entities (`Expense.kt`, `ExpenseReport.kt`, `User.kt`, `Receipt.kt`, `AdvancePayment.kt`, `MileageRecord.kt`, etc.).
  - `report/`: Domain state machine (`lifecycle/ExpenseReportLifecycle.kt`) and review projections (`review/ReviewQueueReader.kt`).
  - `repositories/`: Spring Data JPA database access interfaces (`ExpenseRepository.kt`, `ExpenseReportRepository.kt`, etc.).
  - `security/`: JWT authentication filter, Token Provider, and Rate Limiting stores.
  - `services/`: Core logic (`ExpenseService.kt`, `ReportService.kt`, `FxService.kt`, `OcrService.kt`, `StorageService.kt`, `PdfService.kt`, `LdapService.kt`).

**`frontend/`:**
- **Purpose:** Next.js 16 web application with App Router, Tailwind CSS, TanStack Query, and multi-language support.
- **Contains:** TypeScript source files (`.ts`, `.tsx`), CSS styles (`globals.css`), i18n JSON files, Playwright tests.
- **Key files:** `package.json`, `next.config.ts`, `middleware.ts`, `app/layout.tsx`.
- **Subdirectories:** `app/`, `components/`, `lib/`, `i18n/`, `messages/`, `public/`, `tests/`.

**`frontend/app/`:**
- **Purpose:** Next.js App Router route hierarchy and page views.
- **Contains:**
  - Page routes: `dashboard/`, `reports/`, `reports/[id]/`, `reports/[id]/edit/`, `reports/[id]/advances/`, `reports/[id]/mileage/`, `expenses/`, `expenses/new/`, `expenses/[id]/edit/`, `approvals/`, `payments/`, `inventory/`, `insurance/`, `profile/`, `search/`, `categories/`, `admin/*`.
  - Global error boundaries: `error.tsx`, `global-error.tsx`, `not-found.tsx`.
  - Stylesheet & Shell: `layout.tsx`, `globals.css`.

**`frontend/components/`:**
- **Purpose:** Modular React components for dashboard visualization, expense management, layout, and common UI elements.
- **Contains:** `dashboard/` (widgets, cards, drawers), `expenses/` (upload zones, scanners, rate inputs), `layout/` (AppShell, Sidebar), `signature/` (canvas SignaturePad), `ui/` (primitives).

**`frontend/lib/`:**
- **Purpose:** Shared frontend utility code, API clients, and TypeScript type declarations.
- **Contains:**
  - `api.ts`: Axios client configured with automatic 401 token refresh queue.
  - `serverApi.ts`: Server-side API fetching utilities.
  - `queryKeys.ts`: React Query cache key factory namespace.
  - `api/`: Modular API calling functions (`admin.ts`, `expenses.ts`, `reviewQueue.ts`).
  - `types/`: Domain TypeScript type contracts (`expense.ts`, `report.ts`, `dashboard.ts`, `admin.ts`, `user.ts`, `inventory.ts`, `insurance.ts`, `search.ts`, `common.ts`).

**`scripts/`:**
- **Purpose:** Repository-level automation, CI checking, and maintenance tools.
- **Contains:** `check-i18n-parity.mjs` (validates parity between en.json and ro.json translations).

## Key File Locations

**Entry Points:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/XpensesApplication.kt`: Spring Boot backend entry point.
- `frontend/app/layout.tsx`: Next.js root layout mounting global providers and shell.
- `frontend/app/page.tsx`: Web client landing page redirecting to `/dashboard` or `/login`.
- `frontend/middleware.ts`: Next.js edge authentication barrier.

**Configuration:**
- `backend-kotlin-jpa/src/main/resources/application.yml`: Spring Boot default and environment configurations.
- `backend-kotlin-jpa/src/main/resources/application-prod.yml`: Production profile overrides.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt`: Security filter chain, CSRF origin verification, and CORS rules.
- `frontend/next.config.ts`: Next.js runtime configuration, standalone output, and `/api` rewrites.
- `frontend/package.json`: Frontend scripts and npm package dependencies.
- `docker-compose.yml`: Multi-container topology (Postgres 16, Redis 7.4, Backend, Frontend).
- `.env.example`: Template for environment variables.

**Core Logic:**
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt`: Report state machine and business rules.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt`: Expense creation, bulk uploads, and validation.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt`: BNR foreign exchange conversion and margin markups.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`: Gemini OCR multi-tier fallback cascade.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt`: Abstract file storage engine (Local / S3).
- `frontend/lib/api.ts`: Frontend HTTP client and transparent JWT token refresh handler.
- `frontend/lib/queryKeys.ts`: React Query cache invalidation hub.

**Testing:**
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/`: Spring Boot integration and unit tests.
- `frontend/tests/`: Playwright end-to-end tests (`tests/auth/`, `tests/reports/`, `tests/expenses/`, `tests/admin/`, `tests/dashboard/`, `tests/responsive/`).

**Documentation & ADRs:**
- `CONTEXT.md`: Business domain terminology, roles, and currency calculation definitions.
- `README.md`: System overview, setup guide, and operational instructions.
- `docs/adr/0001-bnr-fx-rates-with-margin.md`: Architectural decision record for BNR FX rate margins.

## Naming Conventions

**Files:**
- `PascalCase.kt`: Kotlin classes, interfaces, entities, services, controllers (`ExpenseReportLifecycle.kt`, `ExpenseController.kt`).
- `PascalCase.tsx`: React components and client page containers (`ReceiptScanner.tsx`, `ReportDetailClient.tsx`, `Sidebar.tsx`).
- `camelCase.ts`: TypeScript modules, utilities, and API wrappers (`queryKeys.ts`, `serverApi.ts`, `useBodyScrollLock.ts`).
- `kebab-case.spec.ts`: Playwright test suites (`auth-guard.spec.ts`, `overflow.spec.ts`).
- `V{N}__{description}.sql`: Flyway database migrations (`V30__persist_fx_source_date_and_reset_cache.sql`).

**Directories:**
- `kebab-case`: Subsystem roots and tooling dirs (`backend-kotlin-jpa`, `test-results`).
- `lowercase`: Kotlin packages (`eu/nt/xpenses/controllers`, `eu/nt/xpenses/repositories`).
- `camelCase` / `kebab-case`: Frontend route and component categories (`components/expenses`, `components/dashboard`, `lib/types`).

**Special Patterns:**
- `*Client.tsx`: Client-side interactive wrapper for App Router Server Component pages (`DashboardClient.tsx`, `ReportsClient.tsx`).
- `[id]/page.tsx`: Dynamic Next.js route parameter endpoints (`reports/[id]/page.tsx`, `profile/[id]/page.tsx`).

## Where to Add New Code

**New Feature (Full-Stack):**
- Database: Add Flyway migration in `backend-kotlin-jpa/src/main/resources/db/migration/V{next}__<name>.sql`.
- Entity & Repo: Create JPA entity in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/` and repository in `.../repositories/`.
- Business Logic: Implement service methods in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/`.
- Endpoint: Add controller endpoint in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/`.
- Frontend Types & API: Define contracts in `frontend/lib/types/` and endpoints in `frontend/lib/api/`.
- Frontend UI & Route: Add page in `frontend/app/<route>/page.tsx` and UI components in `frontend/components/<domain>/`.
- E2E Tests: Add Playwright test suite in `frontend/tests/<feature>/<feature>.spec.ts`.

**New React Component:**
- Implementation: `frontend/components/<domain>/<ComponentName>.tsx`.
- Types: `frontend/lib/types/<domain>.ts`.
- Translation Keys: Add bilingual strings to `frontend/messages/en.json` and `frontend/messages/ro.json`.

**New API Endpoint / Controller:**
- Controller: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/<Domain>Controller.kt`.
- DTOs: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/<domain>/`.
- Security Matchers: Update `SecurityConfig.kt` if endpoint requires specific role authorization.
- Query Key: Add query key factory in `frontend/lib/queryKeys.ts`.

**Shared Utilities:**
- Backend helpers: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/` or `config/`.
- Frontend helpers: `frontend/lib/` or `frontend/lib/format.ts`.

## Special Directories

**`backend-kotlin-jpa/src/main/resources/db/migration/`:**
- **Purpose:** Immutable, version-controlled database schema migrations.
- **Source:** Written by developers, executed automatically by Flyway on Spring Boot startup.
- **Committed:** Yes (versioned source of truth).

**`frontend/messages/`:**
- **Purpose:** Bilingual JSON translation files (`en.json`, `ro.json`).
- **Source:** Maintained alongside UI changes; verified by `scripts/check-i18n-parity.mjs`.
- **Committed:** Yes.

**`.planning/`:**
- **Purpose:** GSD planning state, roadmap, phase specifications, and codebase documentation.
- **Source:** Generated and maintained by GSD workflows.
- **Committed:** Yes.

---

*Structure analysis: 2026-08-14*
*Update when directory structure changes*
