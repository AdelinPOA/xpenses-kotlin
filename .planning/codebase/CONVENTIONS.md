# Coding Conventions

**Analysis Date:** 2026-06-29

## Naming Patterns

**Files:**
- Kotlin: PascalCase (e.g., `AuthController.kt`, `ExpenseService.kt`, `Models.kt`)
- TypeScript/React: PascalCase for components (e.g., `AuthProvider.tsx`, `ThemeProvider.tsx`), camelCase for utilities (e.g., `queryKeys.ts`, `api.ts`)
- Directories: kebab-case in frontend (`components/ui/`, `app/expenses/`), lowercase in backend (`controllers/`, `services/`, `repositories/`)

**Functions:**
- Kotlin: camelCase (e.g., `createExpense()`, `listExpenses()`, `getExpense()`)
- TypeScript: camelCase for utilities and hooks (e.g., `formatAmount()`, `downloadBlob()`, `duplicateExpense()`)
- React hooks: `use` prefix (e.g., `useAuth()`, `useToast()`, `useQuery()`)

**Variables:**
- Kotlin: camelCase for local variables, properties, and parameters
- TypeScript: camelCase consistently
- Constants: UPPERCASE_SNAKE_CASE (e.g., `API_BASE_URL`, `CURRENCIES`)
- Frontend state: camelCase (e.g., `statusFilter`, `isDragging`, `bulkFiles`)

**Types:**
- Kotlin: PascalCase for classes, interfaces, data classes (e.g., `Expense`, `ExpenseCreate`, `PagedResponse`)
- TypeScript: PascalCase for interfaces and types (e.g., `User`, `Category`, `OCRScanResult`)
- Backend DTOs: PascalCase suffixed with `Out`, `In`, `Create`, `Update` (e.g., `ExpenseOut`, `ExpenseCreate`, `UserResponse`)

## Code Style

**Formatting:**
- Kotlin: IntelliJ IDEA defaults, 4-space indentation
- TypeScript: ESLint + Next.js defaults, 2-space indentation
- No automatic formatter configured (ESLint is linter only, not Prettier)

**Linting:**
- **Kotlin:** No explicit linter configured; relies on IntelliJ built-in inspections
- **TypeScript/React:** ESLint (Next.js core-web-vitals preset) in `frontend/eslint.config.mjs`
  - Rules: `@next/next/no-img-element` off, `react-hooks/exhaustive-deps` off
  - `@typescript-eslint/no-explicit-any` disabled to allow `any` types where needed
  - `react/no-unescaped-entities` disabled

**TypeScript Strict Mode:**
- `tsconfig.json` sets `strict: true` (all strict flags enabled)
- `noEmit: true` in compile (type-checking only, no JS emission — Next.js handles emission)

## Import Organization

**Order (Kotlin):**
1. Package declaration
2. Imports from `java` and `jakarta` (standard library, JPA)
3. Imports from Spring Boot and third-party libs
4. Imports from `eu.nt.xpenses` (project)

**Order (TypeScript):**
1. Third-party imports (`react`, `next`, `@tanstack/react-query`)
2. Relative imports (local components, libs, types)
3. CSS/style imports

**Path Aliases:**
- Frontend: `@/*` resolves to project root (`src/` is omitted, layout is flat)
  - `@/lib/api` → `/lib/api.ts`
  - `@/components/...` → `/components/...`

## Error Handling

**Kotlin Patterns:**
- **HTTP errors:** Use `ResponseStatusException(HttpStatus.XXX, "message")` for controller-level responses
  - Example: `throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")` in `ExpenseController.kt:65`
- **Auth errors:** Custom exceptions `LDAPUnavailableException`, `LDAPBindException` caught and mapped to HTTP status codes (`503`, `401`)
- **Business logic errors:** Return appropriate HTTP response directly (no throw) when validation fails
  - Example: In `AuthController.kt:53`, return `ResponseEntity.status(403).body(mapOf("detail" to "Account deactivated"))`
- **Data access:** Repository queries assumed to succeed; failed lookups return null (e.g., `userRepository.findByUsername(username)`)

**TypeScript Patterns:**
- **API errors:** Axios interceptor (`lib/api.ts:26-68`) normalizes error responses
  - All errors get a `detail` field: uses `error.response?.data?.detail` if present, falls back to `message` or `error`
  - `401` responses trigger automatic token refresh; if refresh fails, redirect to `/login`
- **Component errors:** Error boundary components catch React errors (`app/error.tsx`, `app/global-error.tsx`)
- **Form validation:** Zod schema validation on form submission; errors displayed inline

**Status codes used:**
- `200` — Success
- `201` — Created (POST responses)
- `400` — Bad request (validation, invalid state transitions)
- `401` — Unauthorized (no auth token or token invalid)
- `403` — Forbidden (authenticated but insufficient permissions)
- `404` — Not found (no matching entity)
- `503` — Service unavailable (external service down, e.g., LDAP)

## Logging

**Framework:** SLF4J (backend), `console` (frontend)

**Kotlin Patterns:**
- Logger instance per class: `private val log = LoggerFactory.getLogger(ExpenseController::class.java)`
- Log level not explicitly set in code; uses `application.yml` and environment
- Limited logging visible in codebase; rely on Spring Boot actuator `/api/health` and Prometheus metrics

**TypeScript Patterns:**
- Frontend: No logger configured; uses `console.log/error` via toast notifications for user-facing errors
- API errors surface to user via `toast.error()` calls (e.g., `ExpensesClient.tsx:79`)

## Comments

**When to Comment:**
- **Kotlin:** Complex business logic (e.g., state machine transitions in `ReportStateMachineTest.kt:43-68` with "── Submit ────")
- **Multi-step workflows:** Explain why a step is needed, not what it does
  - Example: `IntegrationTestBase.kt:26-31` explains `@Transactional` behavior and transaction isolation
- **Constraints and caveats:** Document limitations (e.g., `OcrService.kt` multi-tier fallback chain behavior)
- **Non-obvious initialization:** Explain setup order where order matters

**JSDoc/TSDoc:** Not used; types are self-documenting via TypeScript interfaces

## Function Design

**Size (Kotlin):**
- Controllers: thin, delegate to services; typically 15–50 lines
- Services: business logic isolated; 20–100 lines per method
- Large files exist (758 lines in `ReportController.kt`, 659 in `Models.kt`) but organize logic by domain, not by size

**Parameters:**
- Kotlin: Use destructuring / data classes for multiple related params (e.g., `@Valid @RequestBody body: ExpenseCreate`)
- TypeScript: Destructure object params (e.g., `{ children }: { children: React.ReactNode }`)
- Prefer named parameters in Kotlin; use `@RequestParam` for HTTP query/path params

**Return Values:**
- Controllers return `ResponseEntity<T>` or raw domain objects (auto-wrapped by Spring)
- Services return domain models (`User`, `Expense`) or custom DTOs (`ExpenseOut`, `PagedResponse`)
- Frontend hooks return typed results: `{ data, isLoading, error }` from TanStack Query

## Module Design

**Exports:**
- **Kotlin:** No explicit barrel files; import directly from class files
- **TypeScript:** Utilities export functions directly; no barrel files (import path resolves to function)
  - Example: `import { formatAmount } from "@/lib/utils"` or inline in files

**Barrel Files:** Not used in either backend or frontend

**Architectural separation:**
- **Backend:** Controllers → Services → Repositories (three-layer)
  - Controllers: HTTP layer, input validation, auth checks
  - Services: Business logic, transactions, domain model transforms
  - Repositories: Data access (JPA repositories in `Repositories.kt`)
- **Frontend:** Pages (routes) → Client components → UI components → hooks
  - Pages: Next.js app directory structure (`app/expenses/page.tsx`)
  - Client components: `"use client"` marked, handle state and data fetching
  - UI components: Stateless, styled with Tailwind
  - Hooks: TanStack Query for async state, custom hooks for domain logic

## JSON Serialization

**Kotlin:**
- Jackson configured with `property-naming-strategy: SNAKE_CASE` in `application.yml:5`
- Kotlin `camelCase` properties automatically serialize to `snake_case` JSON
- Override with explicit `@JsonProperty("field_name")` when needed (e.g., `ExpenseController.kt` DTOs)

**TypeScript:**
- Interfaces reflect backend snake_case (e.g., `category_id`, `amount_original` in `lib/api.ts`)
- Frontend uses these interfaces directly; no transformation layer

## Database & Migrations

**Naming:**
- Flyway migrations: `V{n}__{description}.sql` (e.g., `V1__init.sql`, `V16__add_soft_delete.sql`)
- Database columns: snake_case (e.g., `amount_eur`, `created_at`, `password_hash`)
- JPA entities: camelCase properties (serialized to snake_case by Jackson)

---

*Convention analysis: 2026-06-29*
