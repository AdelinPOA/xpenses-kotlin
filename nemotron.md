# Xpenses-Kotlin Codebase Audit Results

## Critical Bugs

### 1. Race Condition in OCR Comparison Caching (`OcrService.kt:212-303`)
When a cached OCR result is found, a new `OcrComparison` record is created with the cached data, but the original comparison record remains. This creates duplicate comparison records for the same receipt hash. The cached comparison should be returned directly, not duplicated.

### 2. Refresh Token Rotation Not Atomic (`AuthController.kt:94-141`)
The refresh token rotation deletes the old token first, then creates a new one. If the new token creation fails between these operations, the user is logged out permanently with no valid refresh token. Should use a transactional approach with save-then-delete.

### 3. N+1 Query in Expense Listing (`ExpenseController.kt:69-82`)
The paginated `findAllWithFiltersPaged` uses `@EntityGraph(attributePaths = ["user", "category"])` but the non-paginated `findAllWithFilters` doesn't. Both should use EntityGraph to avoid N+1 when mapping to DTOs.

### 4. JWT Filter Missing Security Context Clear (`JwtAuthenticationFilter.kt:30-38`)
When a token is invalid/expired, the filter doesn't clear the SecurityContext from previous requests, potentially leaking authentication state across requests.

### 5. Missing Refresh Token Cleanup on User Deactivation (`AuthController.kt:117-120`)
When a user is deactivated during token refresh, only the current token is deleted. Other valid refresh tokens for that user remain in the database.

## Data Integrity Issues

### 6. Soft Delete Not Applied to All Financial Entities (`Models.kt`)
`AdvancePayment`, `MileageRecord`, `InventoryItem`, `InventoryRequest`, `InsuranceFile`, `OcrComparison`, `OcrJob` lack `@SQLDelete` + `@SQLRestriction` annotations, unlike `ExpenseReport`, `Expense`, `Receipt`. This means they get hard-deleted.

### 7. Version Column Missing on Expense (`Models.kt:183-253`)
`Expense` entity lacks `@Version` field for optimistic locking, unlike `ExpenseReport` which has it. This can cause lost updates during concurrent edits.

### 8. AdvancePayment/MileageRecord Missing Deleted Flag (`Models.kt:329-442`)
These entities referenced from `ExpenseReport` don't have soft delete, so when a report is soft-deleted, orphaned advances/mileage records remain visible.

## Security Issues

### 9. Cookie SameSite=Lax Allows CSRF on POST (`AuthController.kt:198-212`)
`SameSite=Lax` allows cookies on top-level navigations. For auth endpoints, `SameSite=Strict` or CSRF tokens should be used.

### 10. Missing Rate Limiting on Password Change (`AuthController.kt:164-187`)
The `/change-password` endpoint has no rate limiting, unlike `/login` (10/min) and `/refresh` (5/min).

### 11. Refresh Token Hash Uses Simple SHA-256 (`JwtTokenProvider.kt:79-82`)
Uses unsalted SHA-256. Should use bcrypt or PBKDF2 like the password hashing for defense against rainbow tables if DB is compromised.

## Frontend Issues

### 12. AuthProvider Redirect Loop on 401 (`AuthProvider.tsx:33-44`)
If `getMe()` fails, it redirects to `/login`, but the middleware also redirects to `/login` if no tokens exist. This can cause redirect loops.

### 13. Missing Token Refresh on Window Focus (`api.ts:10-65`)
The axios interceptor only refreshes on 401 responses. If the access token expires while the user has the tab open, they'll get 401 on next request instead of proactive refresh.

### 14. Blob Download Memory Leak (`api.ts:618-632`)
`URL.createObjectURL()` is called but only revoked after click. If user navigates away before click, the object URL leaks.

## Performance Issues

### 15. In-Memory Pagination in ReportController (`ReportController.kt:86-100`)
`listReports` loads ALL reports into memory then paginates. Should use database-level pagination via `Pageable`.

### 16. Synchronous Email Sending in ReportService (`ReportService.kt:127-138`)
Email sending blocks the transaction. Should use `@Async` or a message queue.

### 17. Inefficient Category Lookup in OCR (`OcrService.kt:203-204`)
`categoryRepository.findAllByIsActiveTrue()` fetches all categories on every OCR call. Should be cached.

## Configuration/Operational Issues

### 18. IMAP Password in Logs (`EmailImportService.kt:554`)
`store.connect()` logs credentials on failure. Should redact passwords.

### 19. Async OCR Uses Default ForkJoinPool (`AsyncOcrService.kt:19`, `AsyncConfig.kt:30-41`)
`CompletableFuture.runAsync()` without executor uses common pool, blocking other async tasks. Should use the `ocrTaskExecutor`.

### 20. Hardcoded Daily Allowance Rate (`ReportController.kt:478-495`)
Default 50.0 is hardcoded. Should be configurable via AppSetting with proper default.

## Test Issues

### 21. Test Transaction Isolation Flaw (`IntegrationTestBase.kt:22-26`)
Comment correctly notes that data saved in one test method is NOT visible to a second controller dispatch in the same test (different transaction scope), but tests may rely on this incorrectly.

### 22. Mock FxService Returns Fixed Rate (`IntegrationTestBase.kt:66`)
`given(fxService.getRate(anyString(), anyString())).willReturn(1.0)` - tests currency conversion with 1:1 rate, missing real conversion logic.

---

## Priority Fix Order
1. **#1** (data duplication in OCR)
2. **#2** (auth token loss on refresh failure)
3. **#4** (security context leak)
4. **#6** (missing soft delete on financial entities)
5. **#15** (in-memory pagination performance)