# Codebase Structure

**Analysis Date:** 2026-06-29

## Directory Layout

```
xpenses-kotlin/
├── backend-kotlin-jpa/                # Kotlin/Spring Boot backend (active)
│   ├── src/main/kotlin/eu/nt/xpenses/
│   │   ├── XpensesApplication.kt      # Spring Boot entry point
│   │   ├── config/                    # Spring configuration
│   │   │   ├── SecurityConfig.kt      # CORS, JWT, role-based URL guards
│   │   │   ├── AsyncConfig.kt         # Thread pools for async tasks
│   │   │   ├── CacheConfig.kt         # Spring cache configuration
│   │   │   ├── DataInitializer.kt     # Seed test data on startup
│   │   │   └── ValidationExceptionHandler.kt  # Global exception handler
│   │   ├── controllers/               # HTTP endpoints (one per domain)
│   │   │   ├── AuthController.kt
│   │   │   ├── ExpenseController.kt
│   │   │   ├── ReportController.kt
│   │   │   ├── AdvanceController.kt
│   │   │   ├── MileageController.kt
│   │   │   ├── OcrController.kt
│   │   │   ├── AppSettingsController.kt
│   │   │   ├── UserController.kt
│   │   │   ├── CategoryController.kt
│   │   │   ├── DashboardController.kt
│   │   │   ├── InventoryController.kt
│   │   │   ├── BulkExpenseController.kt
│   │   │   ├── InsuranceController.kt
│   │   │   ├── SignatureController.kt
│   │   │   ├── LdapSettingsController.kt
│   │   │   └── HealthController.kt
│   │   ├── models/                    # JPA entities + DTOs
│   │   │   ├── Models.kt              # All @Entity classes in one file
│   │   │   ├── PagedResponse.kt       # Pagination wrapper
│   │   │   └── UserResponse.kt        # User DTO
│   │   ├── repositories/              # Spring Data JPA interfaces
│   │   │   └── Repositories.kt        # All @Repository interfaces in one file
│   │   ├── services/                  # Business logic
│   │   │   ├── ExpenseService.kt      # Expense CRUD + validation
│   │   │   ├── ReportService.kt       # Report state machine
│   │   │   ├── OcrService.kt          # Gemini OCR with model fallback
│   │   │   ├── AsyncOcrService.kt     # Async OCR job runner
│   │   │   ├── FxService.kt           # Currency conversion (Frankfurter + fallback)
│   │   │   ├── ExportService.kt       # CSV/Excel export
│   │   │   ├── PdfService.kt          # PDF report generation
│   │   │   ├── StorageService.kt      # File storage dispatch
│   │   │   ├── storage/               # Storage provider implementations
│   │   │   │   ├── StorageProvider.kt # Provider interface
│   │   │   │   └── S3StorageProvider.kt
│   │   │   ├── ExpenseMapper.kt       # Entity ↔ DTO mapping
│   │   │   ├── LdapService.kt         # LDAP user sync
│   │   │   ├── CryptoService.kt       # HKDF-SHA256 encryption
│   │   │   ├── EmailSettingsService.kt # SMTP config + sending
│   │   │   └── EmailImportService.kt  # IMAP parsing
│   │   ├── security/                  # Spring Security customization
│   │   │   ├── JwtAuthenticationFilter.kt   # Cookie-based JWT auth
│   │   │   └── JwtTokenProvider.kt    # JWT encode/decode (JJWT)
│   │   └── utils/                     # Shared utilities (if any)
│   ├── src/main/resources/
│   │   ├── application.yml            # Spring config (local dev)
│   │   ├── application-test.yml       # Spring config (test profile)
│   │   ├── db/migration/              # Flyway SQL migrations
│   │   │   ├── V1__initial_schema.sql
│   │   │   ├── V2__...sql
│   │   │   └── ...
│   │   │   └── V16__...sql
│   │   └── i18n/                      # Message bundles (if any)
│   ├── src/test/kotlin/eu/nt/xpenses/
│   │   ├── IntegrationTestBase.kt     # Base class for all integration tests (Testcontainers)
│   │   ├── TestAuthHelper.kt          # Helper for logging in as users
│   │   ├── ContextLoadsTest.kt        # Smoke test (app loads)
│   │   ├── controllers/               # Controller tests (MockMvc)
│   │   │   ├── AuthControllerTest.kt
│   │   │   ├── ExpenseControllerTest.kt
│   │   │   ├── ReportControllerTest.kt
│   │   │   ├── DashboardControllerTest.kt
│   │   │   ├── AdvanceControllerTest.kt
│   │   │   └── UserControllerTest.kt
│   │   ├── services/                  # Service tests
│   │   │   ├── ExpenseServiceTest.kt
│   │   │   ├── ReportServiceTest.kt
│   │   │   ├── OcrServiceTest.kt
│   │   │   └── FxServiceTest.kt
│   │   ├── report/                    # Domain-specific tests
│   │   │   └── ReportStateMachineTest.kt  # State machine transitions
│   │   ├── ocr/                       # OCR-specific tests
│   │   │   └── AsyncOcrTest.kt        # Async job runner
│   │   └── resources/
│   │       └── application-test.yml   # Test profile overrides
│   ├── build.gradle.kts               # Gradle build config (Kotlin DSL)
│   ├── Dockerfile                     # Runtime: eclipse-temurin:21-jre-alpine
│   ├── Dockerfile.native              # GraalVM native image (not active)
│   └── Makefile                       # Local dev commands

├── frontend/                          # Next.js 15 frontend
│   ├── app/                           # App Router (Next.js 13+)
│   │   ├── layout.tsx                 # Root layout + Providers
│   │   ├── page.tsx                   # / redirect to /dashboard
│   │   ├── (auth)/login/              # Login page (unprotected)
│   │   ├── (protected)/               # Wrapped by middleware (protected routes)
│   │   │   ├── dashboard/
│   │   │   ├── expenses/
│   │   │   │   ├── page.tsx           # Expense listing
│   │   │   │   └── new/page.tsx       # Create expense
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx           # Report listing
│   │   │   │   ├── new/page.tsx       # Create report
│   │   │   │   └── [id]/page.tsx      # Report detail + state machine actions
│   │   │   ├── approvals/             # Approval queue (manager/chef_finance)
│   │   │   ├── payments/              # Payment queue (chef_finance)
│   │   │   ├── advances/              # Advance request listing
│   │   │   ├── profile/               # User profile + signature
│   │   │   ├── categories/            # Category management
│   │   │   ├── inventory/             # Inventory items + requests
│   │   │   ├── insurance/             # Insurance file uploads
│   │   │   └── admin/                 # Admin settings (mod only)
│   │   │       ├── ocr/               # OCR settings + comparison history
│   │   │       ├── ldap/              # LDAP sync + config
│   │   │       ├── imap/              # IMAP parser + email simulation
│   │   │       ├── receipts/          # Storage provider config + migration
│   │   │       └── users/             # User creation (mod only)
│   │   ├── error.tsx                  # Error boundary
│   │   ├── global-error.tsx           # Global error handler
│   │   └── not-found.tsx              # 404 page
│   ├── components/                    # Reusable React components
│   │   ├── Providers.tsx              # Context setup (Auth, Theme, Query, Toast)
│   │   ├── AuthProvider.tsx           # Auth context hook
│   │   ├── ThemeProvider.tsx          # Dark/light mode
│   │   ├── ToastProvider.tsx          # Notification toast provider
│   │   ├── layout/
│   │   │   ├── AppShell.tsx           # Sidebar + main content wrapper
│   │   │   └── Sidebar.tsx            # Navigation drawer (responsive)
│   │   ├── ui/                        # Generic UI components
│   │   │   ├── EmptyState.tsx         # Empty list placeholder
│   │   │   ├── Badge.tsx              # Status badge
│   │   │   └── ...
│   │   ├── dashboard/                 # Dashboard-specific
│   │   ├── expenses/                  # Expense-related
│   │   │   ├── ExpenseForm.tsx        # Create/edit form
│   │   │   ├── BulkUploadZone.tsx     # Drag-drop for bulk upload
│   │   │   └── BulkReviewDrawer.tsx   # Bulk upload review
│   │   ├── reports/                   # Report-specific
│   │   └── signature/                 # Signature pad
│   ├── lib/                           # Utilities + API client
│   │   ├── api.ts                     # Axios instance + types + API functions
│   │   ├── serverApi.ts               # Server-side API calls (RSC)
│   │   ├── auth.ts                    # Auth utilities
│   │   ├── queryKeys.ts               # TanStack Query key factory
│   │   ├── themes.ts                  # Theme definitions
│   │   └── ...
│   ├── public/                        # Static assets (favicon, images)
│   ├── middleware.ts                  # Next.js middleware (auth redirect)
│   ├── next.config.ts                 # Build config + API proxy
│   ├── package.json                   # Dependencies (React 19, Next 15, TanStack Query v5, Tailwind v4)
│   ├── tsconfig.json                  # TypeScript config
│   ├── tailwind.config.ts             # Tailwind config (CSS-first v4)
│   ├── globals.css                    # Global styles + Tailwind @import
│   └── Dockerfile                     # Runtime: node:22-alpine

├── docker-compose.yml                 # Local dev: frontend + backend + postgres + caddy
├── docker-compose.override.yml        # Local dev overrides (opt-in)
├── Dockerfile.native                  # (GraalVM native image, not used)
├── Makefile                           # Top-level commands (build, test, test-health)
├── .env                               # Local dev secrets (not committed)
├── .env.example                       # Example env vars
├── CLAUDE.md                          # Claude Code instructions (architecture, stacks)
├── GEMINI.md                          # Gemini agent instructions
├── AGENTS.md                          # Codex/other agent instructions
├── HANDOFF.md                         # Session-by-session history
├── README.md                          # Project overview + local setup
├── .github/
│   └── workflows/
│       └── ci.yml                     # GitHub Actions: gitleaks, build-kotlin, build-frontend, build-docker
├── openspec/                          # OpenSpec workflow (specs + changes)
│   ├── specs/                         # Finalized feature specs
│   └── changes/                       # In-progress + archived changes
├── docs/
│   └── superpowers/                   # Plan/spec archives
└── .planning/
    └── codebase/                      # Codebase analysis (ARCHITECTURE.md, STRUCTURE.md, etc.)
```

## Directory Purposes

**`backend-kotlin-jpa/`:**
- Purpose: Spring Boot 3.4 REST API backend
- Contains: Kotlin source, Gradle build config, database migrations, Docker image
- Key files: `src/main/kotlin/eu/nt/xpenses/`, `build.gradle.kts`, `src/main/resources/db/migration/`

**`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/`:**
- Purpose: HTTP request handlers for each domain (Auth, Expenses, Reports, OCR, Settings, etc.)
- Contains: Spring `@RestController` classes with `@GetMapping`, `@PostMapping`, etc.
- Key files: `ExpenseController.kt`, `ReportController.kt`, `OcrController.kt`, `AppSettingsController.kt`

**`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/`:**
- Purpose: Business logic, state transitions, external API calls
- Contains: `@Service` classes with `@Transactional` methods
- Key files: `ExpenseService.kt`, `ReportService.kt`, `OcrService.kt`, `FxService.kt`, `StorageService.kt`

**`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/`:**
- Purpose: JPA entities and data transfer objects
- Contains: `@Entity` classes, `@Embeddable` components, DTOs with `@JsonProperty`
- Key files: `Models.kt` (all entities), `PagedResponse.kt`, `UserResponse.kt`

**`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/`:**
- Purpose: Spring Data JPA data access layer
- Contains: `@Repository` interfaces with custom `@Query` methods
- Key files: `Repositories.kt` (all interfaces in single file)

**`backend-kotlin-jpa/src/main/resources/db/migration/`:**
- Purpose: Flyway SQL migration files
- Contains: Versioned `.sql` files (V1, V2, ..., V16); never edit applied migrations
- Committed: Yes
- Generated: No

**`backend-kotlin-jpa/src/test/`:**
- Purpose: JUnit 5 + MockMvc + Testcontainers test suite
- Contains: Controller tests, service tests, state machine tests, async OCR tests
- Key files: `IntegrationTestBase.kt`, `ReportStateMachineTest.kt`, `AsyncOcrTest.kt`

**`frontend/`:**
- Purpose: Next.js React client
- Contains: App Router pages, components, API client, TanStack Query hooks
- Key files: `app/layout.tsx`, `lib/api.ts`, `components/Providers.tsx`, `middleware.ts`

**`frontend/app/`:**
- Purpose: Next.js 13+ App Router (file-system based routing)
- Contains: Pages (route segments), layouts, error boundaries
- Key files: `layout.tsx` (root), `page.tsx` (each route), `[id]/page.tsx` (dynamic routes)

**`frontend/app/login/`:**
- Purpose: Unauthenticated login page
- Contains: Login form, submission to `/api/auth/login`
- Key files: `page.tsx`

**`frontend/app/(protected)/`:**
- Purpose: Authenticated routes (guarded by middleware)
- Contains: All user-facing pages (dashboard, expenses, reports, etc.)
- Key files: `dashboard/page.tsx`, `expenses/page.tsx`, `reports/page.tsx`

**`frontend/app/admin/`:**
- Purpose: Settings pages (OCR, LDAP, IMAP, storage, users)
- Contains: Admin-only pages (role check: `mod`)
- Key files: `ocr/page.tsx`, `ldap/page.tsx`, `imap/page.tsx`, `receipts/page.tsx`

**`frontend/components/`:**
- Purpose: Reusable React components
- Contains: Layout components (AppShell, Sidebar), UI components (Badge, EmptyState), domain components (ExpenseForm, BulkUploadZone)
- Key files: `Providers.tsx`, `layout/AppShell.tsx`, `expenses/ExpenseForm.tsx`

**`frontend/lib/`:**
- Purpose: Shared utilities, API client, React hooks
- Contains: Axios instance with interceptors, TanStack Query key factory, auth helpers
- Key files: `api.ts` (API client + types), `queryKeys.ts` (query key factory), `auth.ts` (auth helpers)

**`backend-kotlin-jpa/src/main/resources/`:**
- Purpose: Configuration files and database migrations
- Contains: `application.yml` (Spring config), `db/migration/` (Flyway SQL files)
- Key files: `application.yml`, `application-test.yml`

**`docker-compose.yml`:**
- Purpose: Local development container orchestration
- Contains: Services: `frontend` (port 3001), `backend` (port 8001), `xpenses-db` (PostgreSQL), `caddy` (reverse proxy)
- Committed: Yes

## Key File Locations

**Entry Points:**
- Backend: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/XpensesApplication.kt` (Spring Boot)
- Frontend: `frontend/app/layout.tsx` (Next.js root layout)

**Configuration:**
- Spring config: `backend-kotlin-jpa/src/main/resources/application.yml`
- Spring security: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt`
- Next.js config: `frontend/next.config.ts`
- Build config: `backend-kotlin-jpa/build.gradle.kts`, `frontend/package.json`

**Core Logic:**
- Expense CRUD: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt`
- Report state machine: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt`
- OCR async: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt`
- FX conversion: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt`
- Storage dispatch: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt`

**Testing:**
- Integration test base: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt`
- State machine tests: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/report/ReportStateMachineTest.kt`
- Async OCR tests: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ocr/AsyncOcrTest.kt`

**Data Models:**
- Entities: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt`
- Repositories: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt`
- Migrations: `backend-kotlin-jpa/src/main/resources/db/migration/V*.sql`

**Frontend API & Auth:**
- Axios + types: `frontend/lib/api.ts`
- Query keys: `frontend/lib/queryKeys.ts`
- Auth context: `frontend/components/AuthProvider.tsx`
- Middleware: `frontend/middleware.ts`

## Naming Conventions

**Files:**
- Kotlin source: PascalCase (e.g., `ExpenseService.kt`, `Models.kt`)
- Kotlin test: Test suffix (e.g., `ExpenseServiceTest.kt`, `ReportStateMachineTest.kt`)
- TypeScript/TSX: PascalCase components, camelCase utils (e.g., `ExpenseForm.tsx`, `queryKeys.ts`)
- SQL migrations: `VN__description.sql` (e.g., `V1__initial_schema.sql`)

**Directories:**
- Kotlin: lowercase plural (e.g., `controllers/`, `services/`, `repositories/`, `models/`)
- Frontend: lowercase plural (e.g., `app/`, `components/`, `lib/`, `public/`)

**Classes & Functions:**
- Kotlin: PascalCase (e.g., `class ExpenseService`, `fun createExpense()`)
- TypeScript: PascalCase components (e.g., `function ExpenseForm()`), camelCase functions (e.g., `function getExpenses()`)

**Variables & Fields:**
- Kotlin: camelCase (e.g., `amountEur`, `currentUser`, `fxRate`)
- TypeScript: camelCase (e.g., `userId`, `displayName`, `categoryId`)

**Database:**
- Tables: snake_case plural (e.g., `expenses`, `expense_reports`, `users`)
- Columns: snake_case (e.g., `amount_eur`, `currency_original`, `created_at`)

## Where to Add New Code

**New Feature (e.g., Mileage report):**
- Primary code: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/MileageService.kt` (service logic), `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt` (endpoints)
- Frontend: `frontend/app/(protected)/mileage/page.tsx` (listing), `frontend/components/mileage/MileageForm.tsx` (form component)
- Tests: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/MileageServiceTest.kt`, `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt`
- Model: Add `@Entity class MileageRecord` to `Models.kt`; add `@Repository interface MileageRepository` to `Repositories.kt`

**New Component/Module:**
- Implementation: Follow existing pattern (controller → service → repository)
- Controller: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/NewDomainController.kt`
- Service: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/NewDomainService.kt`
- Repository: Add interface to `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt`
- Model: Add `@Entity` to `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt`

**Shared/Utility Functions:**
- Backend: Add to appropriate service (e.g., `ExportService.kt` for export helpers) or create `utils/` package for truly generic functions
- Frontend: Add to `frontend/lib/` (e.g., `frontend/lib/formatters.ts` for date/currency formatting)

**Database Schema Changes:**
- Create new migration: `backend-kotlin-jpa/src/main/resources/db/migration/V<N>__description.sql`
- Never edit applied migrations (V1–V16); always create a new version

**Tests:**
- Unit/integration test: Co-locate in `src/test/` mirroring `src/main/` structure
- Test base: Extend `IntegrationTestBase` for full Spring context tests
- Mocking: Use `@MockitoBean` for external services (FxService, OcrService, EmailSettingsService)

## Special Directories

**`backend-kotlin-jpa/src/main/resources/db/migration/`:**
- Purpose: Flyway version-controlled database migrations
- Generated: No (hand-written SQL)
- Committed: Yes
- Naming: `V<number>__<description>.sql` (e.g., `V14__add_ocr_jobs_table.sql`)
- Constraint: Never edit or delete an applied migration; always create a new version

**`frontend/public/`:**
- Purpose: Static assets served without build processing
- Generated: No (hand-authored or tools like Figma export)
- Committed: Yes

**`frontend/app/(protected)/`:**
- Purpose: Route segment group that shares middleware guard (auth redirect)
- Generated: No (Next.js App Router directory convention)
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: Codebase analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Yes (by gsd-map-codebase)
- Committed: Yes
- Note: Updated on architectural/structural changes

**`openspec/specs/` and `openspec/changes/`:**
- Purpose: Feature specification and implementation tracking
- Generated: Yes (by openspec-propose, openspec-apply-change, openspec-archive-change skills)
- Committed: Yes
- Note: Used for major feature work; specs guide implementation

**`docs/superpowers/`:**
- Purpose: Plan and spec archives from prior sessions
- Generated: Yes (by superpowers skills)
- Committed: Yes

---

*Structure analysis: 2026-06-29*
