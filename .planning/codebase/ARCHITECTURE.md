<!-- refreshed: 2026-06-29 -->
# Architecture

**Analysis Date:** 2026-06-29

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                  Frontend Layer (React 19)                   │
│  Next.js 15 / TypeScript / TanStack Query v5 / Tailwind CSS │
│              `frontend/app`, `frontend/components`           │
└──────────────────────────────────────────────────────────────┘
         │ HTTP/REST (axios with cookie auth)
         │ NEXT_PUBLIC_API_URL=http://localhost:8001/api
         │ (Browser) or INTERNAL_API_URL=http://backend:8080/api (SSR)
         ▼
┌──────────────────────────────────────────────────────────────┐
│                  API Gateway / Reverse Proxy                  │
│              (Caddy - HTTPS, currently disabled)              │
└──────────────────────────────────────────────────────────────┘
         │ HTTP/REST (Spring MVC)
         │ Internal container-to-container: port 8080
         │ Host port mapping: 8001
         ▼
┌──────────────────────────────────────────────────────────────┐
│             Controller Layer (Spring MVC)                     │
│     `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/      │
│     controllers/`                                             │
│                                                               │
│  AuthController, ExpenseController, ReportController,        │
│  AdvanceController, MileageController, OcrController, etc.   │
└──────────────────────────────────────────────────────────────┘
         │ Delegates to Services
         ▼
┌──────────────────────────────────────────────────────────────┐
│              Business Logic Layer (Services)                  │
│     `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/      │
│     services/`                                                │
│                                                               │
│  ExpenseService, ReportService, FxService, OcrService,       │
│  StorageService, ExportService, CryptoService, etc.          │
└──────────────────────────────────────────────────────────────┘
         │ Reads/Writes via Spring Data JPA
         ▼
┌──────────────────────────────────────────────────────────────┐
│          Data Access Layer (Spring Data JPA)                  │
│     `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/      │
│     repositories/`, `models/`                                 │
│                                                               │
│  Repositories.kt (all @Repository interfaces)                │
│  Models.kt (all @Entity classes)                             │
└──────────────────────────────────────────────────────────────┘
         │ JPA/Hibernate → JDBC
         │ (Spring-managed transactions)
         ▼
┌──────────────────────────────────────────────────────────────┐
│          Database + File Storage                              │
│                                                               │
│  PostgreSQL (docker image postgres:16-alpine)                │
│  File Storage (local filesystem or S3 provider)               │
│  `backend-kotlin-jpa/src/main/resources/db/migration/`       │
│  (Flyway migrations: V1–V16)                                  │
└──────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Frontend (Next.js)** | User interface, routing, form handling, state via TanStack Query | `frontend/` |
| **Controllers** | HTTP request routing, auth extraction, parameter validation, delegation | `controllers/*.kt` |
| **Services** | Business logic, state transitions, data validation, external API calls | `services/*.kt` |
| **Repositories** | JPA-based data persistence queries | `repositories/Repositories.kt` |
| **Models** | JPA @Entity classes; single-file aggregation | `models/Models.kt` |
| **Config** | Spring configuration, security, async, caching, data seeding | `config/*.kt` |
| **Security** | JWT authentication, CORS, role-based access control, CSRF defense | `security/*.kt`, `config/SecurityConfig.kt` |

## Pattern Overview

**Overall:** Three-tier MVC backend (Controller → Service → Repository) with thin controllers and database-driven state machine for reports.

**Key Characteristics:**
- **Thin Controllers:** Controllers extract `currentUser` from request attributes, validate input, delegate to services
- **Rich Services:** Services contain business logic, validation, state transitions, transaction boundaries
- **Single-Aggregate Repositories:** All 15+ repositories in one file (`Repositories.kt`); all 20+ entities in one file (`Models.kt`)
- **Request-scoped Auth:** `JwtAuthenticationFilter` decodes JWT from `access_token` cookie, stores `User` object in request attributes
- **Soft Deletes:** Key entities (reports, expenses, receipts) use Hibernate `@SQLDelete` + `@SQLRestriction` to mark deleted without physical removal
- **Stateless Sessions:** `SessionCreationPolicy.STATELESS` with JWT; no session cookies except `access_token` and `refresh_token`
- **Async Off-Thread:** Async OCR, email notifications via `@Async` and Spring `TaskExecutor` beans
- **DTOs via Jackson:** `@JsonProperty` and `property-naming-strategy: SNAKE_CASE` convert Kotlin `camelCase` to JSON `snake_case`

## Layers

**Presentation Layer (Frontend):**
- Purpose: Web UI for expense management, report workflows, admin settings
- Location: `frontend/`
- Contains: Next.js pages, React components, TanStack Query hooks, axios API client
- Depends on: Backend REST API, browser APIs (localStorage, fetch/axios)
- Used by: Web browsers

**API Layer (Controllers):**
- Purpose: HTTP endpoint routing, input validation, authentication enforcement, response serialization
- Location: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/`
- Contains: `@RestController` classes with `@GetMapping`, `@PostMapping`, etc.
- Depends on: Services, Models, Spring Security
- Used by: Frontend (HTTP clients), external systems

**Business Logic Layer (Services):**
- Purpose: Core business rules, state transitions, data validation, external integrations
- Location: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/`
- Contains: `@Service` classes with `@Transactional` methods
- Depends on: Repositories, Models, external APIs (Gemini, Frankfurter, S3, LDAP, IMAP)
- Used by: Controllers, other services

**Data Access Layer (Repositories):**
- Purpose: JPA/Hibernate-based queries for entities
- Location: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt`
- Contains: Spring Data `@Repository` interfaces with custom `@Query` methods
- Depends on: Models, JPA, Hibernate
- Used by: Services

**Domain Model Layer (Models):**
- Purpose: JPA entity definitions, database schema representation
- Location: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt`
- Contains: `@Entity` classes, relationships, soft-delete annotations
- Depends on: JPA/Hibernate annotations, Jackson serialization annotations
- Used by: Repositories, services, DTOs

**Configuration Layer:**
- Purpose: Spring context setup, security rules, async executors, database initialization
- Location: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/`
- Contains: `SecurityConfig`, `AsyncConfig`, `CacheConfig`, `DataInitializer`, exception handlers
- Depends on: Spring Framework, models, services
- Used by: Spring context

## Data Flow

### Primary Request Path (Expense Create)

1. **Browser** → POST `/api/expenses` with `{ amount, currency, date, description, ... }` (`frontend/app/expenses/new/page.tsx`)
2. **Middleware** → `Next.js middleware` checks `access_token` cookie; redirects to `/login` if absent (`frontend/middleware.ts`)
3. **Next.js Server** → Routes to proxy; calls `INTERNAL_API_URL=http://backend:8080/api` via `axios`
4. **Spring Boot** → `JwtAuthenticationFilter` reads `access_token` cookie, validates via `JwtTokenProvider`, loads `User` from DB, sets request attribute
5. **Controller** → `ExpenseController.createExpense()` receives request, extracts `currentUser` from attributes, deserializes `ExpenseCreate` DTO
6. **Service** → `ExpenseService.createExpense()` (transactional):
   - Calls `FxService.getRate(currency, date)` to fetch EUR exchange rate
   - Calculates EUR amount: `amountEur = amount * fxRate`
   - Looks up `Category` and `ExpenseReport` if provided
   - Validates ownership: throws `403` if expense assigned to another user's report
   - Validates report status: throws `400` if report not `draft`
   - Creates `Expense` entity with `status = "draft"`
   - Saves to repository
   - Returns persisted expense
7. **Repository** → `ExpenseRepository.save(expense)` → Hibernate → PostgreSQL INSERT
8. **Response** → Controller serializes `Expense` to JSON with snake_case fields (via Jackson `@JsonProperty` + `property-naming-strategy`), returns 201 Created
9. **Browser** → `axios` response interceptor processes response; stores in TanStack Query cache (key: `/api/expenses`); re-renders component with new expense

### Report State Machine (Submit → Approve → Pay)

1. **User submits draft report**:
   - `ReportController.submitReport(reportId, [expenseIds])` → `ReportService.submitReport()`
   - Service attaches expenses (if provided), validates all are `draft` status
   - Marks expenses → `status = "submitted"`
   - Marks report → `status = "submitted"`, `submittedAt = now`
   - Calls async `sendReportSubmittedNotification()` to notify approvers via email
   - Persists report and all expenses within single transaction

2. **Manager/Chef Finance approves**:
   - `ReportController.approveReport(reportId)` → `ReportService.approveReport()`
   - Service checks current user role; throws `403` if not `manager`/`chef_finance`
   - Checks cannot approve own report (author != currentUser)
   - Marks report → `status = "approved"`, `approvedBy = currentUser`, `approvedAt = now`
   - Does NOT change expense status

3. **Chef Finance marks as paid**:
   - `ReportController.markAsPaid(reportId)` → `ReportService.markAsPaid()`
   - Service checks current user is `chef_finance`; throws `401` if not
   - Marks expenses → `status = "paid"`
   - Marks report → `status = "paid"`, `paidAt = now`
   - Persists within transaction

**State Diagram:**
```
draft ──[submit]──> submitted ──[approve]──> approved ──[pay]──> paid
  ▲                    │
  │                    └──[recall]──> draft
  └──[reject]─────────────────────────────┘
```

**State Transition Constraints:**
- Only `draft` reports/expenses can be edited or deleted
- Only report owner can submit draft report
- Cannot approve own report
- Cannot pay without prior approval
- Rejection returns expenses to `draft` status (if implemented)

### OCR Processing (Async)

1. **User uploads receipt** → `ExpenseController.uploadReceipt(expenseId, file)` → `StorageService.store(file)`
2. **Controller enqueues job** → `OcrController.scanReceipt()` enqueues to `ocr_jobs` table (migration V14)
3. **Async service** → `AsyncOcrService` runs off-thread via `@Async` on `ocrTaskExecutor`
4. **OCR logic** → `OcrService.scanReceipt()`:
   - Reads receipt from storage
   - Calls Gemini API with multi-tier model fallback: `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash`
   - If model returns error, retries next model in chain
   - Extracts amount, currency, date, merchant, tax amount
   - Returns `OCRScanResult` with confidence score and warnings
5. **Result stored** → `ocr_jobs` table updated with `status = "completed"`, `scan_result = JSON`
6. **Client polls** → `OcrController.getOcrStatus(jobId)` returns job status; client retries until `completed` or `failed`
7. **User reviews** → Frontend displays OCR result; user can accept or correct fields before saving expense

### External Integrations

**FX Conversion (FxService):**
1. Service calls `Frankfurter API` (primary) with `{ from, to, date }`
2. If Frankfurter fails → fallback to `fawazahmed0/currency-api`
3. Result cached in `fx_rates` table: `(currency, date) → rate`
4. Raises `IllegalArgumentException` if API returns `0.0`

**OCR (OcrService):**
- Gemini API with encrypted API key (stored in `app_settings` via `CryptoService`)
- Model fallback chain handles rate limits and model availability
- Async processing via `AsyncOcrService`

**LDAP (LdapService):**
- Binds to LDAP server for user sync
- Encrypted bind password in `app_settings`
- Maps LDAP attributes to xpenses roles (technician, manager, chef_finance, mod)

**IMAP (EmailImportService):**
- Polls IMAP inbox for delegation emails
- Parses via local regex + optional Gemini fallback
- Creates `ExpenseReport` from email metadata (Kundenauftrag, Technplatz, etc.)

**Storage (StorageService):**
- Receipt files stored locally (default) or S3
- Pluggable providers: `StorageProvider` interface; `S3StorageProvider` impl
- Filenames sanitized before storage to prevent directory traversal

**State Machine / Event Publishing:**
- No explicit event bus; services call each other directly
- Async notifications via `@Async` methods (e.g., `sendReportSubmittedNotification()`)
- Async OCR via background `TaskExecutor`

## Key Abstractions

**Report State Machine:**
- Purpose: Enforce valid transitions (draft → submitted → approved → paid) and access control (only owner can edit draft)
- Examples: `ReportService.submitReport()`, `ReportService.approveReport()`, `ReportService.markAsPaid()`
- Pattern: Guard clauses in service methods check status + role before state transition; saves all related entities in single `@Transactional` block

**Expense Scoping:**
- Purpose: Prevent users from viewing/editing expenses outside their role/ownership
- Examples: `ExpenseService`, `ReportController.listExpenses()` with `?all=true` flag
- Pattern: Controllers extract `currentUser` and pass to service; service filters by `user_id` unless caller is privileged (`chef_finance`, `mod`, `manager`) and passes `?all=true`

**Soft Deletes:**
- Purpose: Preserve financial records for audit trails
- Examples: `ExpenseReport`, `Expense`, `Receipt` entities
- Pattern: Hibernate `@SQLDelete` rewrites DELETE to UPDATE `deleted = true`; `@SQLRestriction` transparently filters reads

**Storage Providers:**
- Purpose: Pluggable receipt file storage (local, S3, SFTP, SMB, WebDAV)
- Examples: `StorageService`, `StorageProvider`, `S3StorageProvider`
- Pattern: `StorageService` reads config from `app_settings` and dispatches to appropriate provider

**Async OCR with Model Fallback:**
- Purpose: Non-blocking receipt scanning with graceful degradation across model tiers
- Examples: `AsyncOcrService`, `OcrService`
- Pattern: Service runs off-thread via `@Async`; tries models in order; persists result to job table; client polls for completion

**Encryption (CryptoService):**
- Purpose: Encrypt sensitive settings at rest (Gemini API key, LDAP bind password, IMAP password, S3 credentials)
- Examples: `CryptoService` with HKDF-SHA256 key derivation
- Pattern: Each subsystem (OCR, LDAP, IMAP, storage) gets distinct encryption key derived from `JWT_SECRET` + system-specific `info` label

## Entry Points

**Backend:**
- Location: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/XpensesApplication.kt`
- Triggers: Spring Boot startup (port 8080, containerized)
- Responsibilities: Application context initialization, auto-configuration of Spring beans, dependency injection

**Controllers (HTTP endpoints):**
- `AuthController` — `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`, `/api/auth/me`
- `ExpenseController` — `/api/expenses` (CRUD), `/api/expenses/{id}/receipts`, `/api/expenses/{id}/duplicate`
- `ReportController` — `/api/reports` (CRUD), `/api/reports/{id}/submit`, `/api/reports/{id}/approve`, `/api/reports/{id}/pay`, `/api/reports/{id}/pdf`
- `OcrController` — `/api/ocr/scan`, `/api/ocr/{jobId}/status`
- `AppSettingsController` — `/api/settings/ocr`, `/api/settings/ldap`, `/api/settings/imap`, `/api/settings/storage`

**Frontend:**
- Location: `frontend/app/layout.tsx`
- Triggers: Next.js server startup (port 3000, containerized; mapped to 3001)
- Responsibilities: Root layout, provider setup (Auth, Theme, QueryClient, Toast), hydration script for theme

**Routes (frontend):**
- `/login` — Login page
- `/dashboard` — Home dashboard
- `/expenses` → `/expenses/new` — Expense listing + creation
- `/reports` → `/reports/new`, `/reports/{id}` — Report listing + creation + detail view
- `/approvals` — Pending approval queue (manager/chef_finance only)
- `/payments` — Pending payment queue (chef_finance only)
- `/admin/*` — Settings pages (OCR, LDAP, IMAP, storage, users, receipts)

## Architectural Constraints

- **Threading:** Single-threaded event loop (Spring MVC synchronous); `@Async` methods run on dedicated `TaskExecutor` beans (`applicationTaskExecutor`, `ocrTaskExecutor`) for OCR and email notifications
- **Global state:** `DataInitializer` seeds test users and categories on startup; `JwtAuthenticationFilter` stores current `User` in request attributes (request-scoped, not global)
- **Circular imports:** No known circular dependencies; all imports flow downward (controllers → services → repositories)
- **Stateless sessions:** `SessionCreationPolicy.STATELESS`; JWT in `access_token` cookie; no server-side session store
- **Transaction scope:** `@Transactional` on service methods; OpenEntityManager-in-View pattern enabled (Hibernate lazy-loads within request)
- **Soft delete transparency:** `@SQLRestriction` hides deleted rows in queries; code does not need to filter explicitly
- **Storage path traversal:** Filenames sanitized via `StorageService` before disk write; path components stripped
- **Role-based access:** `SecurityConfig` guards URLs via `hasRole()`; controllers additionally check `currentUser.role` for data scoping

## Anti-Patterns

### Silent Expense Re-parenting

**What happens:** `ReportService.attachExpenses()` attaches an expense already bound to another draft report without warning.

**Why it's wrong:** Users may unintentionally move expenses between reports if UI doesn't prevent multi-selection or if async operations collide.

**Do this instead:** Check in `attachExpenses()` that no expense is already parented: `if (exp.report?.id != null && exp.report?.id != reportId) throw BAD_REQUEST`. This is implemented in the current code (`line 68-70` in `ReportService.kt`).

### Lazy-Load N+1 in List Views

**What happens:** `ExpenseRepository.findAll()` fetches expense rows; each access to `expense.report.title` or `expense.category.name` triggers a separate query.

**Why it's wrong:** Large expense lists perform 1 + N queries (1 to fetch expenses, N to fetch categories and reports), causing O(N) latency.

**Do this instead:** Use `@Query` with `LEFT JOIN FETCH` in repository methods: `@Query("SELECT e FROM Expense e LEFT JOIN FETCH e.category WHERE e.user = :user")`. This is partially implemented (e.g., `findByIdWithExpenses()`); consider applying to all list methods.

### In-Memory Filtering for Large Datasets

**What happens:** `ExpenseService.listExpenses()` fetches all expenses and filters by `status`, `categoryId`, `fromDate`, `toDate` in Kotlin (in-memory).

**Why it's wrong:** For 10k+ expenses, this loads entire result set into memory before filtering, causing GC pressure and slow pagination.

**Do this instead:** Implement SQL WHERE clauses via custom `@Query` repository methods: `findByUserAndStatusAndCategoryIdAndDateBetween(...)`. This is a known limitation noted in CLAUDE.md.

### Soft Delete Queries Without Explicit Filter

**What happens:** Ad-hoc queries via `findAll()` implicitly filter `deleted = false` via `@SQLRestriction`, but custom `@Query` methods without `WHERE deleted = false` return deleted rows.

**Why it's wrong:** Custom queries may accidentally expose soft-deleted rows if developer forgets to add the filter.

**Do this instead:** Always include `WHERE deleted = false` in custom `@Query` methods. Example: `@Query("SELECT e FROM Expense e WHERE e.deleted = false AND e.user = :user")`.

### CSRF Token Not Checked on State-Changing Requests

**What happens:** CSRF is disabled globally (`csrf { it.disable() }`), but `csrfOriginRefererFilter` attempts to validate Origin/Referer headers as a defense-in-depth.

**Why it's wrong:** If Origin header is missing or spoofed by a network-layer attacker, POST/PUT/PATCH/DELETE requests are allowed without verification.

**Do this instead:** Enable Spring CSRF tokens (session-based or stateless per-request token). The current Origin/Referer filter is a band-aid; consider adding stateless double-submit CSRF tokens or SameSite cookie flag enforcement.

## Error Handling

**Strategy:** Spring `ResponseStatusException` with HTTP status codes; global `ValidationExceptionHandler` for Bean Validation errors.

**Patterns:**
- **Resource not found:** `ResponseStatusException(HttpStatus.NOT_FOUND, "Entity not found")`
- **Forbidden (role/ownership):** `ResponseStatusException(HttpStatus.FORBIDDEN, "Only owner can access")`
- **Bad request (validation):** `ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid expense status")`
- **Unauthorized (auth):** `ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")`
- **Server error (external API):** `ResponseStatusException(HttpStatus.BAD_GATEWAY, "FX API failed")`

Controllers return appropriate HTTP status codes. Frontend axios interceptor catches 401, attempts token refresh, and redirects to `/login` if refresh fails.

## Cross-Cutting Concerns

**Logging:** SLF4J via Logback; each service logs entry/exit and errors.

**Validation:** Jakarta Bean Validation (`@NotNull`, `@Min`, `@Pattern`); global exception handler returns 400 with field errors.

**Authentication:** `JwtAuthenticationFilter` reads `access_token` cookie (httpOnly, secure in production); validates via `JwtTokenProvider` (JJWT library); stores `User` in request attributes.

**Authorization:** Spring Security `@PreAuthorize` for URL-level role checks (`hasRole('mod')`, `hasRole('manager')`); inline `currentUser.role` checks in controllers/services for data scoping.

**CORS:** Configured in `SecurityConfig` via `cors.allowed-origins` env var; allows credentials (cookies).

---

*Architecture analysis: 2026-06-29*
