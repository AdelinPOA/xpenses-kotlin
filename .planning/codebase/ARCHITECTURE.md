# Architecture

**Analysis Date:** 2026-08-14

## Pattern Overview

**Overall:** Full-Stack Decoupled Client-Server (Next.js App Router + Spring Boot Kotlin REST Microservice + PostgreSQL)

**Key Characteristics:**
- **Decoupled Monolith Services:** Next.js 16 App Router frontend in `frontend/` communicating via typed REST APIs and Next.js reverse-proxy rewrites with a Spring Boot 3 / Kotlin JPA backend in `backend-kotlin-jpa/`.
- **Stateless Authentication with Dual Token Flow:** JWT authentication using HttpOnly access/refresh cookies or Authorization bearer headers, with automatic client-side interceptor token refreshing and server-side refresh token rotation in database (`eu.nt.xpenses.model.RefreshToken`).
- **Domain-Driven Lifecycle Management:** Dedicated state machine engine (`eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycle`) enforcing deterministic status transitions for financial claims (Draft → Submitted → Approved/Rejected → Paid).
- **Extensible Storage & Ingestion Subsystems:** Pluggable multi-tier storage architecture (`LocalStorageProvider`, `S3StorageProvider`) with background migration engine (`StorageMigrationEngine`), automated IMAP email receipt ingestion ledger (`ImapIngestionLedger`), and multi-model Gemini OCR fallback chain.
- **Strict Currency & FX Snapshotting:** Multi-currency expense recording with automated BNR (National Bank of Romania) historical exchange rate retrieval, per-currency bank spread margins (`fx_margins`), manual FX overrides, and immutable EUR canonical conversion snapshots.

## Layers

### Frontend Layers (`frontend/`)

**Presentation / App Router Layer:**
- **Purpose:** Route handling, layout composition, server-side data prefetching, and client UI rendering.
- **Contains:** Next.js App Router page routes (`frontend/app/**/page.tsx`), layout trees (`frontend/app/layout.tsx`), client components (`*Client.tsx`), error boundaries (`frontend/app/error.tsx`, `frontend/app/global-error.tsx`).
- **Depends on:** Component layer, API client layer, React Query state hooks.
- **Used by:** End-user browser and mobile PWA client.

**Component Layer:**
- **Purpose:** Reusable atomic and domain-specific UI components.
- **Contains:** Layout components (`frontend/components/layout/AppShell.tsx`, `Sidebar.tsx`), domain components (`frontend/components/expenses/ReceiptScanner.tsx`, `BulkUploadZone.tsx`, `FxRateInput.tsx`), dashboard widgets (`frontend/components/dashboard/`), canvas signing (`frontend/components/signature/SignaturePad.tsx`), UI primitives (`frontend/components/ui/`).
- **Depends on:** React Query hooks, next-intl translations, Lucide icons, Tailwind CSS styles.
- **Used by:** App Router pages and client containers.

**Client State & Data Access Layer:**
- **Purpose:** HTTP client lifecycle, token refresh interception, server state caching, and typed API functions.
- **Contains:** Axios client with refresh queue (`frontend/lib/api.ts`), SSR server API client (`frontend/lib/serverApi.ts`), domain API modules (`frontend/lib/api/*.ts`), centralized query key factory (`frontend/lib/queryKeys.ts`), TypeScript contracts (`frontend/lib/types/*.ts`).
- **Depends on:** Backend REST API endpoints, Axios, TanStack React Query.
- **Used by:** React components and SSR page loaders.

**Middleware & I18n Layer:**
- **Purpose:** Edge request routing, session guard redirects, and multi-language translation resolution.
- **Contains:** Next.js edge auth guard (`frontend/middleware.ts`), locale providers and translation bundles (`frontend/i18n/`, `frontend/messages/en.json`, `frontend/messages/ro.json`).
- **Depends on:** Next.js runtime, cookies.
- **Used by:** Next.js request pipeline.

---

### Backend Layers (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/`)

**Controller Layer (`eu.nt.xpenses.controllers.*`):**
- **Purpose:** REST API endpoint definition, HTTP status code translation, authorization annotations, and parameter extraction.
- **Contains:** 19 REST controllers: `AuthController.kt`, `ExpenseController.kt`, `ReportController.kt`, `ReviewQueueController.kt`, `DashboardController.kt`, `AdvanceController.kt`, `MileageController.kt`, `InsuranceController.kt`, `InventoryController.kt`, `SignatureController.kt`, `SearchController.kt`, `CategoryController.kt`, `UserController.kt`, `AppSettingsController.kt`, `LdapSettingsController.kt`, `OcrController.kt`, `BulkExpenseController.kt`, `HealthController.kt`.
- **Depends on:** Service layer, DTO models, Spring Security context.
- **Used by:** Frontend HTTP client and external automation.

**Lifecycle & Domain Workflow Layer (`eu.nt.xpenses.report.lifecycle.*`, `eu.nt.xpenses.report.review.*`):**
- **Purpose:** Enforce strict business state transitions and optimized review queue projections.
- **Contains:** `ExpenseReportLifecycle.kt`, `ExpenseReportLifecycleState.kt`, `ExpenseReportLifecycleTypes.kt`, `ReportLifecycleNotificationAdapter.kt`, `ReviewQueueReader.kt`, `ReviewQueueProjection.kt`.
- **Depends on:** Repositories, Authorization service, JPA entities.
- **Used by:** `ReportController.kt`, `ReviewQueueController.kt`, `ReportService.kt`.

**Service Layer (`eu.nt.xpenses.services.*`):**
- **Purpose:** Core business rules, calculation engines, transaction boundaries, and provider orchestration.
- **Contains:** `ExpenseService.kt`, `ReportService.kt`, `MileageCalculationService.kt`, `FxService.kt`, `OcrService.kt`, `AsyncOcrService.kt`, `StorageService.kt`, `EmailImportService.kt`, `ExportService.kt`, `PdfService.kt`, `LdapService.kt`, `CryptoService.kt`, `EmailSettingsService.kt`, `Authorization.kt`.
- **Depends on:** Repositories, Storage providers, External clients (Gemini REST, BNR FX, LDAP, IMAP/SMTP).
- **Used by:** Controllers and lifecycle coordinators.

**Persistence / Repository Layer (`eu.nt.xpenses.repositories.*`):**
- **Purpose:** Data access abstraction via Spring Data JPA with custom JPQL/native queries and projection interfaces.
- **Contains:** `ExpenseReportRepository.kt`, `ExpenseRepository.kt`, `ReceiptRepository.kt`, `AdvancePaymentRepository.kt`, `MileageRecordRepository.kt`, `UserRepository.kt`, `RefreshTokenRepository.kt`, `CategoryRepository.kt`, `AppSettingRepository.kt`, `FxRateRepository.kt`, `OcrJobRepository.kt`, `OcrComparisonRepository.kt`, `OcrResultCacheRepository.kt`, `InventoryItemRepository.kt`, `InventoryRequestRepository.kt`, `InsuranceFileRepository.kt`.
- **Depends on:** JPA EntityManager, Hibernate, PostgreSQL database.
- **Used by:** Service layer and Lifecycle components.

**Domain Model Layer (`eu.nt.xpenses.model.*`, `eu.nt.xpenses.models.*`):**
- **Purpose:** Relational database entities mapping business state, relationships, audit timestamps, and optimistic locking versions.
- **Contains:** `ExpenseReport.kt`, `Expense.kt`, `Receipt.kt`, `AdvancePayment.kt`, `MileageRecord.kt`, `User.kt`, `RefreshToken.kt`, `Category.kt`, `AppSetting.kt`, `FxRate.kt`, `OcrJob.kt`, `OcrComparison.kt`, `OcrResultCache.kt`, `InventoryItem.kt`, `InventoryRequest.kt`, `InsuranceFile.kt`.
- **Depends on:** Jakarta Persistence (`jakarta.persistence.*`), Jackson annotations.
- **Used by:** Repositories, Services, Mappers.

**Data Transfer Object (DTO) Layer (`eu.nt.xpenses.dto.*`):**
- **Purpose:** Decoupled request payloads and response contracts preventing JPA entity leakage.
- **Contains:** Subpackages by domain: `dto/auth/`, `dto/expense/`, `dto/report/`, `dto/dashboard/`, `dto/user/`, `dto/search/`.
- **Depends on:** Jackson annotations, validation annotations (`jakarta.validation.*`).
- **Used by:** Controllers and Service mappers (`eu.nt.xpenses.services.mapper.*`).

**Security & Infrastructure Layer (`eu.nt.xpenses.security.*`, `eu.nt.xpenses.config.*`):**
- **Purpose:** Authentication filters, token verification, rate limiting, CORS configuration, caching, and async executors.
- **Contains:** `SecurityConfig.kt`, `JwtAuthenticationFilter.kt`, `JwtTokenProvider.kt`, `RateLimitingFilter.kt`, `RateLimitStore.kt` (`InMemoryRateLimitStore.kt`, `RedisRateLimitStore.kt`), `ValidationExceptionHandler.kt`, `AsyncConfig.kt`, `CacheConfig.kt`, `DataInitializer.kt`.
- **Depends on:** Spring Security, JJWT, Redis, Bucket4j / Token Bucket algorithm.
- **Used by:** Entire backend request and execution pipeline.

## Data Flow

### 1. Expense Creation & OCR Processing Flow

```
Technician (Browser)
       │
       ▼  [POST /api/expenses/upload (multipart receipt image/PDF)]
Next.js Reverse Proxy (`next.config.ts` rewrites)
       │
       ▼
`RateLimitingFilter` & `JwtAuthenticationFilter` (Token verification)
       │
       ▼
`ExpenseController.kt` / `BulkExpenseController.kt`
       │
       ├──► `StorageService.kt` (Magic byte validation, saves file locally / S3)
       │
       ├──► `AsyncOcrService.kt` / `OcrService.kt` (Gemini model cascade fallback)
       │       └── Checks `OcrResultCacheRepository` (SHA-256 hit) or calls Gemini API
       │
       ├──► `FxService.kt` (Resolves BNR exchange rate + FX margin on expense date)
       │       └── Persists rate in `FxRateRepository`
       │
       ▼
`ExpenseRepository.kt` & `ReceiptRepository.kt` (Persists draft expense & receipt)
       │
       ▼
`ExpenseOut` DTO returned to UI -> React Query caches under `queryKeys.expenses.all`
```

### 2. Report Submission & Review Lifecycle Flow

```
Technician (Browser)
       │
       ▼  [POST /api/reports/{id}/submit]
`ReportController.kt`
       │
       ▼
`ExpenseReportLifecycle.kt` (State machine verification)
       │  - Checks actor is owner
       │  - Validates report status is DRAFT
       │  - Attaches draft expenses and updates statuses to SUBMITTED
       │  - Computes total EUR amount from attached expense snapshots
       │  - Emits `ExpenseReportLifecycleEvent.ReportSubmitted`
       │
       ▼
`ExpenseReportRepository.kt` (Saves report status: SUBMITTED)
       │
       ▼
Manager / Chef Finance reviews via `ReviewQueueController.kt`
       │
       ├──► `ReviewQueueReader.kt` (Executes high-performance projection query)
       │
       ▼  [POST /api/reports/{id}/approve]
`ExpenseReportLifecycle.kt` (Validates reviewer role, marks APPROVED, triggers notification)
       │
       ▼  [POST /api/reports/{id}/pay]
`ExpenseReportLifecycle.kt` (Validates `chef_finance` role, marks PAID)
```

### State Management:
- **Client State:** Server state managed via `@tanstack/react-query` with strict query key invalidation (`frontend/lib/queryKeys.ts`). UI state (drawers, dialogs, filters) handled via local React hooks (`useState`, `useReducer`, `react-hook-form`).
- **Server State:** Fully relational persistence in PostgreSQL (`xpenses` DB) managed via Hibernate JPA.
- **Cache State:** Redis and JCache (`CacheConfig.kt`) for rate limiting counters, OCR cache lookups, and storage configuration.

## Key Abstractions

**Lifecycle State Machine (`ExpenseReportLifecycle`):**
- **Purpose:** Encapsulates all state mutation operations and invariants for expense reports.
- **Examples:** `eu.nt.xpenses.report.lifecycle.ExpenseReportLifecycle.kt` (`submit`, `approve`, `reject`, `recall`, `pay`, `sign`, `deleteDraft`).
- **Pattern:** Domain Service / Command-Outcome State Machine.

**Storage Provider Abstraction (`StorageProvider`):**
- **Purpose:** Decouples receipt and signature file storage from underlying physical storage mechanics.
- **Examples:** `eu.nt.xpenses.services.storage.LocalStorageProvider.kt`, `S3StorageProvider.kt`.
- **Pattern:** Strategy Pattern / Factory via `StorageService.kt`.

**FX Rate Provider & Calculator (`FxRateProvider`, `FxService`):**
- **Purpose:** Abstracts foreign exchange data sources (BNR daily XML/JSON feed) with weekend/holiday lookback fallback and margin markup.
- **Examples:** `eu.nt.xpenses.services.fx.FxRateProvider.kt`, `eu.nt.xpenses.services.FxService.kt`.
- **Pattern:** Provider / Decorator with local cache repository persistence.

**OCR Fallback Cascade (`OcrService`):**
- **Purpose:** Robust OCR receipt extraction with automatic model degradation fallback and cache matching.
- **Examples:** `eu.nt.xpenses.services.OcrService.kt` (`GEMINI_FALLBACK_CHAIN`: `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash` → `gemini-2.5-flash`).
- **Pattern:** Chain of Responsibility.

**Rate Limiting Store (`RateLimitStore`):**
- **Purpose:** Abstract rate-limit counter backend allowing runtime switching between in-memory and Redis storage.
- **Examples:** `eu.nt.xpenses.security.InMemoryRateLimitStore.kt`, `eu.nt.xpenses.security.RedisRateLimitStore.kt`.
- **Pattern:** Strategy Pattern configured in `RateLimitStoreConfiguration.kt`.

**Query Key Factory (`queryKeys`):**
- **Purpose:** Centralized, type-safe React Query cache key definitions preventing key drift across frontend views.
- **Examples:** `frontend/lib/queryKeys.ts` (`reports`, `expenses`, `dashboard`, `admin`, `inventory`, `insurance`).
- **Pattern:** Namespace Factory.

## Entry Points

**Backend Application Entry:**
- **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/XpensesApplication.kt`
- **Triggers:** JVM bootstrap (`java -jar` or Spring Boot runner).
- **Responsibilities:** Bootstraps Spring application context, enables async task executors (`@EnableAsync`), scheduled jobs (`@EnableScheduling`), caching (`@EnableCaching`), and Flyway database migrations.

**Backend HTTP Filter Chain:**
- **Location:** `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt`
- **Triggers:** Inbound HTTP requests to `/api/**`.
- **Responsibilities:** Evaluates CORS policies, executes Origin/Referer CSRF check (`csrfOriginRefererFilter`), enforces IP/user rate limiting (`RateLimitingFilter`), verifies JWT claims (`JwtAuthenticationFilter`), and authorizes endpoints by role (`technician`, `mod`, `chef_finance`).

**Frontend Application Root Layout:**
- **Location:** `frontend/app/layout.tsx`
- **Triggers:** Browser page request.
- **Responsibilities:** Renders root HTML structure, injects global fonts and CSS (`frontend/app/globals.css`), mounts context providers (`ThemeProvider`, `AuthProvider`, `ToastProvider`, `LocaleProvider`, `Providers.tsx`), and registers Service Worker for PWA (`PwaRegistration.tsx`).

**Frontend Edge Middleware:**
- **Location:** `frontend/middleware.ts`
- **Triggers:** Next.js routing pipeline for all non-static page requests.
- **Responsibilities:** Inspects auth cookies (`access_token`, `refresh_token`), guards protected routes, and redirects unauthenticated users to `/login`.

## Error Handling

**Strategy:** Global Exception Interception with Normalized Error Envelopes on Backend; Interceptor-Level Token Recovery and User Toast Feedback on Frontend.

**Backend Patterns:**
- `eu.nt.xpenses.config.ValidationExceptionHandler.kt`: Spring `@RestControllerAdvice` capturing `MethodArgumentNotValidException`, `ResponseStatusException`, `IllegalArgumentException`, and `DataIntegrityViolationException`, returning JSON payloads with `detail` and field-level `errors`.
- Defensive magic byte checking in `StorageService.kt` throwing `400 Bad Request` or `413 Payload Too Large`.
- Explicit business condition guards in `ExpenseReportLifecycle.kt` throwing `ResponseStatusException` with descriptive HTTP status codes (`400`, `403`, `404`).

**Frontend Patterns:**
- Axios response interceptor (`frontend/lib/api.ts`): Intercepts `401 Unauthorized`, queues concurrent requests, triggers `/api/auth/refresh`, retries failed requests seamlessly, or redirects to `/login` on refresh expiration.
- Normalizes server error formats (`data.detail = data.message ?? data.error`).
- App Router boundaries (`frontend/app/error.tsx`, `frontend/app/global-error.tsx`, `frontend/app/not-found.tsx`) provide fallback UI for rendering failures.

## Cross-Cutting Concerns

**Authentication & Role Authorization:**
- Three primary user roles: `technician` (submits expenses/reports), `mod` / Manager (reviews/approves reports, manages settings/users), and `chef_finance` (reimburses and pays approved reports).
- Method-level security (`@EnableMethodSecurity`, `Authorization.kt` helper) and Spring Security filter matchers (`SecurityConfig.kt`).

**CSRF Defense-in-Depth:**
- Custom `csrfOriginRefererFilter()` in `SecurityConfig.kt` validates `Origin` or `Referer` headers against allowed origins for all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).

**Rate Limiting:**
- Token-bucket rate limiting (`RateLimitingFilter.kt`) backing by in-memory cache or Redis (`RedisRateLimitStore.kt`), supporting proxy header resolution (`X-Forwarded-For`) with trusted proxy lists.

**Audit Logging & Timestamps:**
- Entities maintain `createdAt`, `updatedAt`, `submittedAt`, `approvedAt`, `paidAt`, `signedAt` instant timestamps.
- Flyway migrations track schema revision history (`backend-kotlin-jpa/src/main/resources/db/migration/`).

**Internationalization (I18n):**
- Bilingual support (English `en` and Romanian `ro`) managed via `next-intl` (`frontend/messages/en.json`, `frontend/messages/ro.json`) and `frontend/i18n/LocaleProvider.tsx`.

---

*Architecture analysis: 2026-08-14*
*Update when major patterns change*
