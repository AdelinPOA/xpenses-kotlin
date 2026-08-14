# Coding Conventions

**Analysis Date:** 2026-08-14

## Naming Patterns

### Backend (Kotlin / Spring Boot)

**Files & Packages:**
- Source files: PascalCase matching top-level class/interface (e.g. `ExpenseController.kt`, `ExpenseReportLifecycle.kt`, `ValidationExceptionHandler.kt`)
- Package names: All lowercase, domain/layer structured under `eu.nt.xpenses.*` (e.g. `eu.nt.xpenses.controllers`, `eu.nt.xpenses.services.fx`, `eu.nt.xpenses.model`, `eu.nt.xpenses.dto.expense`)
- Database migrations: Flyway versioned prefix `V{number}__{description}.sql` under `backend-kotlin-jpa/src/main/resources/db/migration/` (e.g. `V32__add_mileage_fuel_calculation_snapshots.sql`)

**Classes, Interfaces & Types:**
- Classes and Interfaces: PascalCase (e.g. `ExpenseService`, `RateLimitStore`, `ImapIngestionLedger`)
- JPA Entities: PascalCase singular nouns (e.g. `Expense`, `User`, `ExpenseReport`, `Receipt`, `Category`)
- DTOs: PascalCase with descriptive suffix (e.g. `ExpenseCreateDto`, `ReportSubmitDto`, `UserResponseDto`)
- Enums: PascalCase enum name with UPPER_SNAKE_CASE values (e.g. `FxRateSource.BNR`, `ReportStatus.DRAFT`)

**Functions & Variables:**
- Methods & functions: camelCase (e.g. `getRate`, `calculateMileageAmount`, `approveReport`)
- Variables & properties: camelCase in Kotlin code (e.g. `amountOriginal`, `exchangeRate`, `userId`)
- Constants: UPPER_SNAKE_CASE in companion objects or file top-level (e.g. `DEFAULT_CURRENCY`)
- Test methods: Backtick descriptive phrases (e.g. `` `POST expense creates expense and returns 201`() ``)

### Frontend (Next.js / React / TypeScript)

**Files & Directories:**
- Component files: PascalCase matching component name (e.g. `frontend/components/layout/Sidebar.tsx`, `frontend/components/dashboard/ManagerKpiCards.tsx`, `frontend/components/expenses/ReceiptScanner.tsx`)
- App Router route files: Standard Next.js lowercase filenames (e.g. `frontend/app/expenses/page.tsx`, `frontend/app/layout.tsx`)
- Interactive route client entry points: PascalCase with `Client` suffix (e.g. `frontend/app/expenses/ExpensesClient.tsx`, `frontend/app/dashboard/DashboardClient.tsx`)
- Utilities, libraries, configs: camelCase (e.g. `frontend/lib/api.ts`, `frontend/lib/format.ts`, `frontend/lib/queryKeys.ts`)
- Test files: kebab-case or feature-named `.spec.ts` under `frontend/tests/` (e.g. `frontend/tests/dashboard/dashboard.spec.ts`, `frontend/tests/responsive/overflow.spec.ts`, `frontend/tests/mobile-ui.spec.ts`)

**Functions, Variables & Types:**
- Components: PascalCase (e.g. `ExpenseForm`, `SignaturePad`, `EmptyState`)
- Functions & hooks: camelCase (e.g. `formatCurrency`, `useAuth`, `setupAuthMocks`)
- Event handlers: `handleEvent` or `onEvent` pattern (e.g. `handleSubmit`, `onSelectCategory`)
- Types & Interfaces: PascalCase, without `I` prefix (e.g. `Expense`, `DashboardData`, `UserRole`)
- Query key factories: Object with camelCase methods returning tuple arrays in `frontend/lib/queryKeys.ts`
- Constants: UPPER_SNAKE_CASE (e.g. `VIEWPORTS`, `BASE_URL`, `USERS`)

---

## Code Style & Formatting

### Backend (Kotlin / Gradle)

**Formatting & Tooling:**
- Kotlin 2.4.0 targeting JVM 21 toolchain (`java.toolchain.languageVersion = 21`)
- Strict JSR-305 compiler option enabled in `backend-kotlin-jpa/build.gradle.kts`: `-Xjsr305=strict`
- Constructor injection preferred across all Spring `@Service`, `@RestController`, and `@Component` beans
- Explicit nullability annotations and Kotlin null safety (`String?`, `BigDecimal?`) throughout models and services
- Monetary values: Always use `java.math.BigDecimal` (never `Double` or `Float`) for financial calculations, maintaining precision and rounding modes

**Database & Entities:**
- Flyway manages all schema migrations (`org.flywaydb:flyway-database-postgresql`)
- Hibernate `ddl-auto` is set to `validate` in `backend-kotlin-jpa/src/main/resources/application.yml`
- Optimistic locking with `@Version var version: Long = 0` on financial and stateful entities (`Expense`, `ExpenseReport`, `AdvancePayment`)
- Soft delete pattern: `deletedAt: Instant? = null` with `@Where(clause = "deleted_at IS NULL")` or query filtering

**JSON Serialization:**
- Spring Boot configured with snake_case naming strategy: `spring.jackson.property-naming-strategy: SNAKE_CASE`
- Kotlin Jackson module registered (`jackson-module-kotlin`)
- Java 8 Date/Time module support (`jackson-datatype-jsr310`) with `write-dates-as-timestamps: false`

### Frontend (TypeScript / Next.js / Tailwind CSS)

**Formatting & Linting:**
- ESLint flat configuration in `frontend/eslint.config.mjs` using `@eslint/js`, `@next/eslint-plugin-next`, and browser/node globals
- Tailwind CSS v4 using PostCSS plugin `@tailwindcss/postcss` configured in `frontend/postcss.config.js`
- 2-space indentation, semicolons, single/double quotes per ESLint defaults
- Script validation: `npm run lint` for ESLint, `npm run i18n:check` for translation key parity

**Styling & UI:**
- Utility-first styling via Tailwind CSS v4 classes with `clsx` for conditional classes
- Icons imported from `lucide-react`
- Responsive design: Mobile-first layout with minimum touch targets of 44x44px for touch interactions
- Zero horizontal overflow contract verified across viewports (mobile 412px, tablet 768px, desktop 1280px)

---

## Import Organization

### Backend (Kotlin)

**Order:**
1. Standard library imports (`java.*`, `kotlin.*`)
2. Framework imports (`org.springframework.*`, `jakarta.*`)
3. Third-party library imports (`org.slf4j.*`, `com.fasterxml.jackson.*`, `org.testcontainers.*`)
4. Internal project imports (`eu.nt.xpenses.model.*`, `eu.nt.xpenses.services.*`, `eu.nt.xpenses.dto.*`)

### Frontend (TypeScript)

**Order:**
1. React / Next.js core imports (`react`, `next/navigation`, `next/link`)
2. External third-party packages (`@tanstack/react-query`, `lucide-react`, `zod`, `react-hook-form`, `axios`)
3. Internal utilities and lib helpers (`@/lib/api`, `@/lib/format`, `@/lib/queryKeys`)
4. Internal UI & layout components (`@/components/ui/*`, `@/components/layout/*`)
5. Translation hooks and i18n (`@/i18n/*`, `next-intl`)
6. Types (`import type { ... }`)

**Path Aliases:**
- `@/*` aliases configured in `frontend/tsconfig.json` mapping to `./*`

---

## Error Handling

### Backend (Spring Boot)

**Centralized Handling:**
- Centralized REST advice in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt` using `@RestControllerAdvice`
- Handles:
  - `MethodArgumentNotValidException` -> 400 Bad Request with field-level details
  - `ConstraintViolationException` -> 400 Bad Request
  - `HttpMessageNotReadableException` -> 400 Bad Request with sanitized message
  - `AuthorizationDeniedException` / `AccessDeniedException` -> 403 Forbidden
  - `ResponseStatusException` -> Preserves status and reason message
  - Custom domain exceptions (e.g. `FxMarginsValidationException`) -> 400 Bad Request with structured errors map
- Standardized error JSON response format:
  ```json
  {
    "detail": "Field or validation error description"
  }
  ```

**Business Logic Exceptions:**
- Use explicit exceptions or `ResponseStatusException(HttpStatus.NOT_FOUND, "...")` / `ResponseStatusException(HttpStatus.BAD_REQUEST, "...")` at service boundaries
- Invariants and preconditions verified via Kotlin `require()`, `check()`, or `error()`

### Frontend (Next.js / React)

**Client-Side Strategy:**
- Form validation handled before submission via Zod schemas and `react-hook-form` resolvers (`@hookform/resolvers/zod`)
- API errors handled centrally through Axios interceptors in `frontend/lib/api.ts`
- Toast notifications via `ToastProvider` for user feedback on API mutation errors
- Guard clauses and empty states rendered via `EmptyState` component

---

## Logging

### Backend

- SLF4J logger instantiated via `LoggerFactory.getLogger(Class::class.java)`
- Production JSON logging enabled via `net.logstash.logback:logstash-logback-encoder` configured in `backend-kotlin-jpa/src/main/resources/logback-spring.xml`
- Log levels: `DEBUG` for internal flow diagnostics, `INFO` for state transitions/lifecycle events, `WARN` for recoverable errors/fallback triggers, `ERROR` for unexpected failures
- Sensitive data policy: Passwords, JWT secrets, and PII must never be logged

### Frontend

- Minimal console logging; no raw `console.log` in committed production components
- Error reporting via UI error boundaries and toast notifications

---

## Internationalization (i18n)

- Dual language support: English (`frontend/messages/en.json`) and Romanian (`frontend/messages/ro.json`)
- Parity enforced by automated test script `scripts/check-i18n-parity.mjs` (run via `npm run i18n:check`)
- Every new user-facing UI key must exist in both `en.json` and `ro.json` with matching placeholder parameters
- Server/Client i18n provided by `next-intl` runtime in `frontend/i18n/`

---

*Mapped from current repository state on 2026-08-14.*
