# Complete Codebase Review: xpenses-kotlin

## Project Overview
Self-hosted expense management system: Kotlin/Spring Boot 3.4 backend + Next.js 15 frontend + PostgreSQL 16. Manages expenses, reports, advances, mileage, inventory, insurance, OCR scanning, and email import.

---

## Architecture Assessment

### Backend (Kotlin/Spring Boot)
- **42 source files, 20 test files** across 7 packages
- Clean layered architecture: Controllers -> Services -> Repositories -> Models
- Single `Models.kt` file (662 lines) and `Repositories.kt` file (230 lines) — works but could be split for larger teams
- 15 controllers, 16 services, 12 repositories, 14 entities

### Frontend (Next.js 15)
- **58+ source files** with App Router, 12+ route groups
- TanStack Query v5 + axios for data fetching
- React Hook Form + Zod for forms
- Tailwind CSS v4 (CSS-first config)
- Playwright E2E tests (33 test files)

---

## Strengths

1. **Security hardening is solid**: JWT PBKDF2 key derivation (`JwtTokenProvider.kt:35`), CSRF origin/referer filter (`SecurityConfig.kt:73`), token version invalidation on password change, httpOnly cookie auth, rate limiting via Bucket4j, file magic byte validation, path traversal protection in `StorageService`, AES-GCM encryption for secrets

2. **Good soft delete pattern**: `@SQLDelete` + `@SQLRestriction` consistently applied on financial entities with `deleted`/`deleted_at` columns

3. **Proper optimistic locking**: `@Version` on `ExpenseReport`, `Expense`, `AdvancePayment`, `MileageRecord` prevents concurrent update conflicts

4. **Dual storage architecture**: Local + remote (S3) with cache-first strategy and background migration support

5. **OCR fallback chain**: Gemini model tiers tried in sequence (`OcrService.kt:45-50`), SHA-256 cache for duplicate receipts, comparison tracking for accuracy metrics

6. **Comprehensive CI pipeline**: Gitleaks secrets scan + Kotlin build/test + frontend typecheck/lint/build + Docker build

7. **Good test infrastructure**: Testcontainers for PostgreSQL, `IntegrationTestBase` with MockMvc, `TestAuthHelper` for cookie-based auth, proper `@Transactional` rollback per test

---

## Issues Found

### Critical / High

1. **`validate-on-migrate: false` in Flyway config** (`application.yml:23`): This means schema drift between JPA entities and DB can go undetected. Should be `true` in production or at least have a separate profile with validation enabled.

2. **No HTTPS enforcement**: `COOKIE_SECURE=false` in `.env.example`. In production, cookies could be intercepted. The `secure` flag should default to `true` and be explicitly set to `false` only for local dev.

3. **JWT secret fallback is empty string** (`JwtTokenProvider.kt:18`): `@Value("\${jwt.secret:}")` defaults to blank. The `validateSecret()` check catches it at startup, but `ENCRYPTION_SECRET` in `application.yml:36` falls back to `JWT_SECRET` which could also be blank — if `validateSecret()` hasn't run yet or is bypassed, encryption could fail silently.

4. **`ExpenseController` has business logic** (`ExpenseController.kt:341-384`): The `saveReceiptLocal` and `validateMagicBytes` methods contain business logic that should be in a service. The AGENTS.md anti-pattern explicitly states "No business logic in controllers."

5. **`BulkExpenseController` duplicates `validateMagicBytes`** (`BulkExpenseController.kt:158-177`): Identical copy-paste of the method from `ExpenseController`. Should be extracted to a shared utility/service.

### Medium

6. **In-memory filtering pattern** (AGENTS.md convention): `ReportController.listReports()` fetches all reports then paginates in Kotlin (`ReportController.kt:86-100`). This will not scale — all reports are loaded into memory, sorted, then sub-listed. Same for `DashboardController` which loads all expenses to count them (`DashboardController.kt:45-46`).

7. **`Receipt` entity lacks `@Version`**: Unlike other financial entities (`Expense`, `ExpenseReport`, `AdvancePayment`, `MileageRecord`), `Receipt` has no optimistic locking, which could cause issues with concurrent receipt operations.

8. **Missing `AND version=?` in `Receipt` soft-delete SQL**: `Receipt` has `@SQLDelete` but the SQL is `UPDATE receipts SET deleted = true, deleted_at = NOW() WHERE id=?` — missing `AND version=?` like the other entities. This means soft-delete doesn't check version and could overwrite concurrent changes.

9. **`ExpenseReport` has delegation email fields directly on the entity** (`Models.kt:158-169`): `kundenauftrag`, `auftragsart`, `positionstyp`, etc. are German-language domain fields mixed into the core entity. These should be in a separate `EmailImportMetadata` entity or JSON column.

10. **No input sanitization on free-text fields**: Fields like `description`, `merchant`, `notes` accept arbitrary strings. If displayed in HTML without escaping, could lead to XSS. The frontend likely handles this via React's default escaping, but the backend has no protection.

11. **`SignatureController` uses filesystem paths** (`SignatureController.kt:83-84`): Stores signatures as `File(dir, "${currentUser.id}.png")` and saves `file.absolutePath` to DB. This breaks if the app is moved to a different server or if the data directory changes. Should use relative paths through `StorageService`.

12. **`DashboardController` loads all expenses for count** (`DashboardController.kt:45`): `expenseRepository.findAllByUserId(currentUser.id!!).size.toLong()` loads all user expenses into memory just to count them. Should use a `COUNT` query.

### Low / Code Quality

13. **Mixed error handling patterns**: Some controllers return `ResponseEntity` with status codes, others throw `ResponseStatusException`. The `ValidationExceptionHandler` handles exceptions globally but the inconsistency makes the code harder to follow.

14. **`mapAdvanceToOut` is duplicated** in both `ReportController.kt:431-454` and `AdvanceController.kt:355-378`. Should be in `ExpenseMapper` or a shared utility.

15. **`calculateDailyAllowance` in `ReportController.kt:481-495`** queries `appSettingRepository` on every call. This is called per report in `mapReportToOut`, leading to N+1 queries when listing reports.

16. **`ExpenseMapper.toExpenseOut` always sets `comparisonId = null`** (`ExpenseMapper.kt:33`): The TODO comment suggests this was never implemented. If OCR comparison tracking is important, this is a missing feature.

17. **Frontend `API_BASE_URL` uses relative `/api` for browser** (`lib/api.ts:3-5`): This works with the Next.js rewrite in `next.config.ts`, but could be confusing. The SSR path `INTERNAL_API_URL` and browser path `/api` are different codepaths.

18. **No `application-test.yml`**: Tests use `@ActiveProfiles("test")` but there's no test-specific config file. Tests rely on `IntegrationTestBase` overriding properties via `@DynamicPropertySource`, which is fine but could be more explicit.

### Testing Gaps

19. **No tests for**: `CryptoService`, `StorageService`, `EmailSettingsService`, `EmailImportService`, `LdapService`, `ExportService`, `PdfService` (partially tested), `AppSettingsController`, `LdapSettingsController`.

20. **No integration test for the full auth flow**: Login -> access resource -> refresh -> access with new token -> logout -> verify access denied.

21. **No test for CSRF origin filter**: The `csrfOriginRefererFilter` is a security-critical component but has no dedicated test.

---

## Recommendations

1. **Extract business logic from controllers** into services — especially `saveReceiptLocal`, `validateMagicBytes`, and `mapAdvanceToOut`
2. **Add COUNT queries** for dashboard stats instead of loading all entities
3. **Implement DB-level pagination** for report listing instead of in-memory pagination
4. **Add `@Version` to `Receipt`** entity for consistency
5. **Enable `validate-on-migrate: true`** in non-dev profiles to catch schema drift
6. **Use relative paths in `SignatureController`** via `StorageService`
7. **Split `Models.kt`** into separate files per entity for maintainability
8. **Add missing test coverage** for `CryptoService`, `StorageService`, settings controllers
9. **Default `COOKIE_SECURE=true`** in `.env.example` for production safety
10. **Fix the `validateMagicBytes` duplication** by extracting to a shared utility
