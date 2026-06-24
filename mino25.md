# Codebase Audit — June 24, 2026

## CRITICAL (3)

| # | Location | Issue |
|---|----------|-------|
| 1 | `ReportService.kt:107` | `.get()` instead of `.orElseThrow()` — throws raw `NoSuchElementException` → 500 if report deleted between checks |
| 2 | `EmailImportService.kt:274` | API key passed as URL query param (`?key=$apiKey`) — leaks in server logs, proxy logs. Should use header like `OcrService.kt:738` does |
| 3 | `CryptoService.kt:29-58` | Hand-rolled Fernet-like encryption instead of vetted library — no replay protection, no version checks, CBC without AEAD |

## HIGH (12)

| # | Location | Issue |
|---|----------|-------|
| 4 | `ReportService.kt:128` | `userRepository.findAll()` — loads ALL users on every report submission to find approvers. N+1 on scale |
| 5 | `DashboardController.kt:38-56` | `expenseRepository.findAll()` + `expenseReportRepository.findAll()` — full table loads for `chef_finance`/`mod` users |
| 6 | `DashboardController.kt:87-90` | N+1 on expense mapping — `toExpenseOut` triggers LAZY loads for receipts, category, user per expense |
| 7 | `OcrService.kt:163,570` | **SSRF** — user-provided `baseUrl`/`mineruUrl` used directly in HTTP requests without URL allowlist validation |
| 8 | `StorageService.kt:145,322` | **Path traversal** — `relativePath` used without canonical traversal check. `File.absoluteFile` doesn't resolve `..`; need `canonicalFile` |
| 9 | `UserController.kt:96,121` | `request.getAttribute("currentUser") as User` — unsafe cast (all other controllers use `as?` with null check) |
| 10 | `ExpenseController.kt:322` | Receipt links use raw `<a href={API_BASE_URL}/...>` — cross-origin, won't send httpOnly cookies, silently fails |
| 11 | `reports/[id]/page.tsx:557` | Same cross-origin issue for PDF/receipts ZIP download links |
| 12 | `ExpenseForm.tsx:251` | OCR polling loop has no timeout/max retry — infinite loop if server never returns `completed`/`failed` |
| 13 | `ExpenseForm.tsx:515` | Array index as React key on receipt files — stale UI on file removal |
| 14 | `AuthController.kt:183` | `changePassword` doesn't invalidate current JWT — old token remains valid until expiry |
| 15 | `ReportService.kt:127-138` | Email sending inside `@Transactional` — if transport init throws before `@Async`, entire transaction rolls back |

## MEDIUM (17)

| # | Location | Issue |
|---|----------|-------|
| 16 | `JwtTokenProvider.kt:33` | Hardcoded PBKDF2 salt `"xpenses-jwt-salt"` — if secret is weak, derived key is compromised |
| 17 | `FxService.kt:60,77` | Currency code interpolated into URL without encoding — injection risk |
| 18 | `EmailImportService.kt:402,446` | `userRepository.findAll().firstOrNull` — loads ALL users to find one by email |
| 19 | `PdfService.kt:93-103` | `getResourceAsStream` InputStream never closed — resource leak |
| 20 | `AdvanceController.kt:357` / `MileageController.kt:187` | Force-unwrap `id!!` on entities — NPE risk on transient state |
| 21 | `ReportService.kt:232` | `report.totalAmount = 0.0` on rejection — inconsistent with `recallReport` which doesn't zero it |
| 22 | `DashboardController.kt:24` | Missing `@Transactional` — inconsistent snapshot across multiple queries |
| 23 | `MileageController.kt:210` | `@Min(0)` allows `distanceKm = 0.0` — meaningless trip record |
| 24 | `PdfService.kt:427,439` | Force-unwrap `byCurrency[c]!!` — fragile even though key comes from same map |
| 25 | `OcrService.kt:392` | `CompletableFuture.runAsync` uses default ForkJoinPool — long OCR tasks starve other async work |
| 26 | `OcrService.kt:153` | `expenseRepository.findAll()` to train classifier — OOM risk at scale |
| 27 | `StorageService.kt:163` | No file size limit on `file.writeBytes(content)` — OOM from large uploads |
| 28 | `StorageService.kt:304` | Migration lambda calls `appSettingRepository.save()` without `@Transactional` context |
| 29 | `lib/serverApi.ts:14-16` | Only forwards 2 cookies — loses any other state the backend depends on |
| 30 | `components/AuthProvider.tsx` | Triple-redirect race: middleware + AuthProvider + axios interceptor all redirect to `/login` on 401 |
| 31 | `ToastProvider.tsx:38` | `setTimeout` never cleaned up on unmount — setState on unmounted component |
| 32 | `formatEur` calls (5+ files) | `"en-EU"` is not a valid BCP 47 locale — browser falls back silently |

## LOW (10+)

| # | Location | Issue |
|---|----------|-------|
| 33 | `JwtTokenProvider.kt:68` | Generic `catch` swallows all errors including `SignatureException` |
| 34 | `ExportService.kt:17` | `isoDateTime` uses literal `Z` on `LocalDateTime` — misleading UTC implication |
| 35 | `DataInitializer.kt:134,159` | Report totals hardcoded instead of computed from expenses |
| 36 | `CategoryController.kt:22` | Returns raw JPA entity instead of DTO |
| 37 | `ExpenseForm.tsx:515` | Array index as React key |
| 38 | `reports/new/page.tsx:179` | Empty-whitespace title passes validation |
| 39 | `Sidebar.tsx:100` | `startsWith` nav matching can over-match similar routes |
| 40 | `ExpensesClient.tsx:230` | Delete expense has no confirmation dialog |
| 41 | `middleware.ts:6` | Skips auth for `.png` only — misses `.jpg`, `.svg`, etc. |
| 42 | `JwtAuthenticationFilter.kt:31` | DB roundtrip on every request even when token is valid — no user cache |

---

## Top 5 Fixes (Highest Impact)

1. **ReportService.kt:107** — Replace `.get()` with `.orElseThrow { ResponseStatusException(...) }`
2. **StorageService.kt:117** — Change `absoluteFile` to `canonicalFile` for path traversal prevention
3. **EmailImportService.kt:274** — Move API key from query param to `x-goog-api-key` header
4. **ReportService.kt:128** — Replace `userRepository.findAll()` with `findByRoleIn()` query
5. **DashboardController.kt:38** — Add DB-level WHERE filters instead of loading all records
