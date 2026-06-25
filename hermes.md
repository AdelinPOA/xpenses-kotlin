# Audit: xpenses-kotlin — Consolidated Report

Generated: 24 Jun 2026 · Merged with deep-verified pass (Opus 4.8): 25 Jun 2026
**Merged with GLM-5.2 parallel-agent pass: 25 Jun 2026** — new findings tagged `[GLM]`; overlaps enriched inline.
Scope: Full codebase (backend Kotlin ~90 files, frontend TS/TSX ~50 files, 16 Flyway migrations, Docker infra)

Provenance tags: ✅ = proven by execution · 🔎 = verified by reading code/migrations · ⚠️ = reported, plausible, not independently executed.
`[GLM]` = reported by the GLM-5.2 pass; spot-checked but **not all independently verified** (8 of ~30 were re-checked against source; 2 were found wrong/overstated — see Review notes). Treat untagged-as-verified `[GLM]` items as plausible-pending-confirmation.

---

## Verification at a Glance

| Check | Result |
|-------|--------|
| Backend build (Docker) | PASS |
| Backend health endpoint | PASS |
| Frontend TypeScript (`tsc --noEmit`) | PASS (both passes) |
| Docker services up | ALL 4 running (backend, db, ocr-sidecar, mineru) |
| Kotlin build (host JDK 25) | BLOCKED — Kotlin 2.1.0 needs JDK 21/22; use Docker |
| `ReportStateMachineTest` (JDK21 + Testcontainers) | PASS — but masks C0 (see below) |

---

## CRITICAL — Fix Immediately

### C0. Paying any report with expenses fails in production ✅ (PROVEN)
**`ReportService.kt:278`** → `payReport()` sets each child expense to `status = "paid"`, but the V5
migration forbids that value:
```sql
-- V5__data_integrity_constraints.sql:5
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status
    CHECK (status IN ('draft','submitted','approved','rejected'));   -- no 'paid'
```
The sibling `expense_reports` constraint DOES allow `'paid'` — only the `expenses` one was missed.
In production `payReport` is `@Transactional` and **commits** → Hibernate flushes
`UPDATE expenses SET status='paid'` → PostgreSQL rejects it → payment 500s and rolls back. A report
can never reach `paid` once it has expenses.

Proven with a throwaway probe test that forces a flush against Testcontainers Postgres:
```
ConstraintViolationException → org.postgresql.util.PSQLException (chk_expenses_status)
```
**Why the existing test misses it:** `IntegrationTestBase` is class-level `@Transactional`, so every
test **rolls back and never commits**. `chef_finance pays approved report → status becomes paid`
asserts the *in-memory* object's status, but the offending UPDATE is never flushed-to-commit, so the
constraint never fires. False-green test masking a real production failure.

**Fix:** new migration mirroring V12 (which fixed advances the same way), plus harden the pay test to
force a flush/commit:
```sql
ALTER TABLE expenses DROP CONSTRAINT chk_expenses_status;
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status
    CHECK (status IN ('draft','submitted','approved','rejected','paid'));
```

---

### C1. `EmailImportService.pollAndProcessEmails` — `@Scheduled` without `@Transactional` 🔎
**`EmailImportService.kt:535`** → `@Scheduled` method calls `processIncomingEmail()` which does `expenseReportRepository.save()` (line 435) — each write is auto-committed. If the loop fails mid-way, earlier writes are NOT rolled back. Also lacks `@Async` — IMAP connections are blocking.
**Fix:** Add `@Transactional` (and consider `@Async`).

### C2. `ReportService.submitReport` — `.get()` throws raw `NoSuchElementException` 🔎
**`ReportService.kt:107`** → `reportRepository.findById(reportId).get()` throws `NoSuchElementException` (500) if the entity is deleted between outer fetch and inner re-fetch.
**Fix:** Replace `.get()` with `.orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, ...) }`.

### C3. `EmailImportService` — API key leaked in URL query parameter 🔎
**`EmailImportService.kt:274`** → `?key=$apiKey` in Gemini API URL. Keys leak in server logs, proxy logs, and browser history.
**Fix:** Move to `x-goog-api-key` header (as `OcrService.kt:167` already does).
*(GLM pass independently re-flagged this — same root cause.)*

### C4. ~~`CryptoService` — hand-rolled encryption~~ → moved to MEDIUM **M23**
Downgraded on review: `JwtTokenProvider.@PostConstruct` already fails fast on a blank `jwt.secret`, so the original empty/predictable-key "trivially decryptable in production" severity was incorrect. The legitimate hardening concerns (no AEAD, hand-rolled crypto, no local fail-fast) live at **M23**. (C5–C10 labels kept stable to preserve cross-references.)

### C5. `OcrService` — SSRF via user-provided `mineruUrl` ⚠️
**`OcrService.kt:180,570`** → User-controlled `mineruUrl` and `baseUrl` are used directly in HTTP requests without URL allowlist validation.
**Fix:** Validate against an allowlist of allowed hosts/URLs, or store the mineru URL server-side-only.

### C6. `StorageService` — Path traversal via `absoluteFile` ⚠️  `[GLM]` mechanism proven 🔎
**`StorageService.kt:117,128,137`** → `File.absoluteFile` does NOT resolve `..` or follow symlinks. `File.canonicalFile` is required. Migration code at line 322 has NO traversal check at all (`File(localPath, path).readBytes()`).
**[GLM] why the existing `startsWith` guard is non-functional:** Kotlin's `File.startsWith(File)` (verified in `FilesKt__UtilsKt` bytecode) calls `toComponents`, which segments the **raw, un-normalized** path and does a prefix compare. `File("/app/data/receipts","../etc/passwd").absoluteFile` keeps `..` literal → segments `[app,data,receipts,..,etc,passwd]` whose prefix equals baseDir's `[app,data,receipts]` → guard passes, while the canonical target is outside the base. Receipt paths derive from user-supplied original filenames, so `relativePath` is attacker-influenced.
**Fix:** `val target = File(baseDir, relativePath).canonicalFile` then compare `target.canonicalPath.startsWith(baseDir.canonicalPath + File.separator)` (or `target.toPath().normalize().startsWith(baseDir.toPath().normalize())`).
**Exploitability caveat (review):** the guard is provably non-functional, but reaching it with a `..` payload requires `relativePath` to carry `..` — CLAUDE.md states filenames are sanitized before storage. Confirm `StorageService`/upload paths actually strip/reject `..` upstream; if they do, this is defense-in-depth rather than a live traversal. Fix the guard regardless.

### C7. `UserController` — Unsafe cast `as User` 🔎  `[GLM]` re-confirmed
**`UserController.kt:96,121`** → `request.getAttribute("currentUser") as User` throws `ClassCastException` if the attribute is missing or wrong type. Every other controller uses `as?` with a null check.
**Fix:** Change to `as? User` with `?: throw ResponseStatusException(...)`.

### C8. `EmailImportService` — Full table scan without transaction 🔎
**`EmailImportService.kt:402`** → `userRepository.findAll().firstOrNull { it.email?.lowercase() ... }` loads ALL users into memory. Also lacks `@Transactional` (see C1).
**Fix:** Add `findByEmailIgnoreCase()` to `UserRepository`.

### C9. `OcrService` — Unmanaged `CompletableFuture.runAsync` (3x) 🔎
**`OcrService.kt:392,404,416`** → Uses `ForkJoinPool.commonPool()` — unmanaged by Spring. OCR tasks can starve request threads in containers.
**Fix:** Replace with `@Async("ocrTaskExecutor")` or inject a `TaskExecutor`.

### C10. `ReportController` — `System.err.println` in production 🔎  `[GLM]` impact: silent zeroed allowance
**`ReportController.kt:481-495`** → `calculateDailyAllowance()` `catch { System.err.println("!!!!! ..."); 0.0 }`. Any parse/config error silently zeroes the daily allowance used in `totalReimbursable`, with no signal and debug-style logging.
**Fix:** Replace with `log.warn(...)`; either fail the request or surface the allowance as null so callers know it wasn't computed.

---

## HIGH — Fix Soon

### H0a. `payReport` permits role `mod` to pay 🔎
**`ReportService.kt:260`** → Guard is `role != "chef_finance" && role != "mod"`, contradicting the documented "Payment: chef_finance only" rule and the `approveReport` guard which excludes `mod`. Doc or guard is wrong.

### H0b. Receipt-download IDOR inconsistency 🔎
**`ExpenseController.kt:278` & `:317`** → `getSingleReceipt`/`getReceiptCompat` allow `manager` to download any user's receipt file (`role !in listOf("chef_finance","mod","manager")`), but `getExpense` (`:109`) blocks managers from the same expense's metadata (`role !in listOf("chef_finance","mod")`). Make guards consistent.

### H0c. `[GLM]` Self-payment segregation-of-duties gap 🔎
**`ReportService.kt:259-270`** → `approveReport` and `rejectReport` both block self-action (`report.user?.id == currentUser.id` → 400), but `payReport` checks only role + status. A `chef_finance`/`mod` who owns an approved report can mark *their own* report paid.
**Fix:** mirror the self-ownership check from `approveReport`.

### H0d. `[GLM]` Non-deterministic pagination → duplicate/missing rows across pages 🔎
**`Repositories.kt:80`** + **`ExpenseController.kt:70`** → `findAllWithFiltersPaged` has no `ORDER BY` (the non-paged sibling at `:64` has `ORDER BY e.date DESC` but no tiebreaker). PostgreSQL returns rows in unspecified order, so offset/limit paging yields rows on multiple pages or none. Controller passes `Sort.unsorted()`.
**Fix:** `ORDER BY e.date DESC, e.id DESC` (or pass `Sort` in the controller).

### H0e. `[GLM]` Frontend: expense-save error swallowed → duplicate expenses 🔎
**`ExpenseForm.tsx:138,156,171`** → The mutation throws `new Error(...)` (which carries `.message`), but `onError` reads `e.response?.data?.detail` → always `undefined`. In the partial-success path (expense saved, receipts failed) the user sees the generic "Failed to save", clicks Save again, and creates a **duplicate expense**.
**Fix:** `onError: (e: any) => setError(e.message ?? e.response?.data?.detail ?? "Failed to save")`.

### H0f. `[GLM]` LDAP context leaked on every exception path 🔎
**`LdapService.kt:230-267`** → `ctx` opened at :230 is closed only on the happy paths (:242, :248). If `ctx.search`/`results.hasMore`/`results.next` throws, the catch at :263 rethrows WITHOUT closing `ctx`. Each leak holds an LDAP socket; `syncUsers` has the same shape with no try/finally around the search loop.
**Fix:** `ctx.use { ... }` (InitialDirContext is Closeable); close `results`/`userCtx` in finally.

### H0g. `[GLM]` S3 `ResponseInputStream` never closed 🔎
**`S3StorageProvider.kt:65`** → `s3Client.getObject(request).readAllBytes()` leaks the HTTP connection (must be closed to release it).
**Fix:** `s3Client.getObject(request).use { it.readAllBytes() }`.

### H1. Dashboard — Full table loads for org-wide users 🔎
**`DashboardController.kt:38-56`** → `expenseRepository.findAll()` + `expenseReportRepository.findAll()` for `chef_finance`/`mod` users. No `@Transactional` means inconsistent cross-query snapshots.
**Fix:** Add DB-level WHERE filters instead of loading all records.

### H2. Dashboard — N+1 on expense mapping 🔎
**`DashboardController.kt:87-90`** → `expenses.map { expenseMapper.toExpenseOut(it) }` triggers LAZY loads for receipts, category, and user per expense.
**Fix:** Use `JOIN FETCH` in queries or `@EntityGraph`.

### H3. Frontend — Receipt/ZIP download via `<a href={API_BASE_URL/...}>` 🔎  `[GLM]` expanded location list
**Locations:** `ExpenseForm.tsx:100,494,649,664,682`, `ExpensesClient.tsx:202`, `reports/[id]/page.tsx:201,210,555`, `profile/signature/page.tsx:92` → `href={API_BASE_URL/...}` (and signature `<img src=...>`) bypasses the Axios interceptor. The browser does NOT send httpOnly cookies cross-origin (ports 3001→8001), so downloads silently fail and 401 without token refresh.
**Fix:** Use an Axios `GET` with `responseType: 'blob'`, create an object URL, and trigger a synthetic click (`downloadBlob` already exists in `lib/api.ts:618`).

### H4. ExpenseForm — OCR polling loop has no timeout/max retry 🔎
**`ExpenseForm.tsx:251-261`** → `while (!isCompleted) { await ...setTimeout(1500); }` — infinite loop if server never returns `completed`/`failed`; no `AbortController`, so it keeps polling after unmount.
**Fix:** Add a max retry count (e.g. 60 attempts ≈ 90s), a timeout, and tie to component lifecycle.

### H5. `AuthController.changePassword` — Doesn't invalidate current JWT 🔎
**`AuthController.kt:183-186`** → Passwords are hashed and refresh tokens are deleted, but existing JWT access tokens remain valid until expiry (up to 15 min).
**Fix:** Increment a `tokenVersion` on the user entity and check it during JWT validation.

### H6. `ReportService.submitReport` — Email sending inside `@Transactional` 🔎
**`ReportService.kt:127-138`** → SMTP email sending (which can hang on connection) runs inside `@Transactional`. If the transport throws, the entire transaction rolls back.
**Fix:** Extract email sending into a separate `@Async` method.

### H7. `InsuranceController` + `ExpenseController` — `transactionTemplate.execute { }!!` NPE 🔎
**`InsuranceController.kt:108,176`**, **`ExpenseController.kt:184,207,255`** → Force-unwrap with `!!`. If `execute()` returns null, this throws NPE instead of a proper HTTP error.
**Fix:** Replace `!!` with `?: throw ResponseStatusException(...)`.

### H8. `ReportService.rejectReport` — `totalAmount = 0.0`, inconsistent with recall 🔎
**`ReportService.kt:232`** → Rejection resets `totalAmount = 0.0`. `recallReport` does NOT zero it. The values diverge.
**Fix:** Either zero in both paths or keep the original total in both.

### H9. `PdfService` — InputStream never closed 🔎
**`PdfService.kt:93-103`** → `getResourceAsStream("/company_logo.png")` is opened but never closed in a `finally` block. If `readAllBytes()` throws, the stream leaks.
**Fix:** Use `use { }` (auto-close).

### H10. `AsyncOcrService` — failure status saved inside a possibly rollback-only transaction ⚠️
**`AsyncOcrService.kt:38-43`** → On OCR failure the `status="failed"` save happens inside the same `@Transactional` that may be marked rollback-only (if the failure was a persistence exception), so the failure status never persists → job stuck in `processing`, clients poll forever.
**Fix:** Persist the failure in a `REQUIRES_NEW` transaction.

### H11. `OcrService` — no HTTP connect/read timeout ⚠️  `[GLM]` confirmed across FxService + EmailImportService too 🔎
**`OcrService.kt:109-111`** → The shared `RestClient`/`HttpClient` has no connect/read timeout; a hung EasyOCR/MinerU/Gemini call ties up an OCR executor thread indefinitely, eventually exhausting the pool (which then orphans later jobs).
**[GLM]** Same pattern in `FxService.kt:14` and `EmailImportService.kt:32` (`RestClient.builder().build()` with no timeout).
**Fix:** Configure `HttpClient` connect timeout + per-request read timeout on all three clients.

---

## MEDIUM — Should Fix

| # | Location | Issue | Tag |
|---|----------|-------|-----|
| M1 | `ReportService.kt:128` | `userRepository.findAll().filter { it.role in ... }` — loads all users for approver notification | 🔎 |
| M2 | `OcrService.kt:153` | `expenseRepository.findAll().filter { ... }` to train NaiveBayes — OOM risk at scale | 🔎 |
| M3 | `Models.kt:107,202,211` + schema `V1__init.sql` | `[GLM]` `Double`/`DOUBLE PRECISION` for `totalAmount`/`amountOriginal`/`amountEur`/`fxRate`/`limitAmount` — IEEE-754 can't represent decimal currency; summations/FX/totals drift. Tax fields already use `BigDecimal`/`NUMERIC` (inconsistent). Migrate to `NUMERIC(12,2)` + `BigDecimal`. | 🔎 |
| M4 | `JwtTokenProvider.kt:33` | Hardcoded PBKDF2 salt `"xpenses-jwt-salt"` | 🔎 |
| M5 | `FxService.kt:60,77` | Currency codes interpolated into URL without encoding | 🔎 |
| M6 | `AdvanceController.kt:357` / `MileageController.kt:187` | Force-unwrap `id!!` on transient entities | 🔎 |
| M7 | `MileageController.kt:210` | `@Min(0)` allows `distanceKm = 0.0` — validates but meaningless | 🔎 |
| M8 | `PdfService.kt:427,439` | Force-unwrap `byCurrency[c]!!` — fragile | 🔎 |
| M9 | `StorageService.kt:163` | No file size limit on `file.writeBytes(content)` — OOM | 🔎 |
| M10 | `StorageService.kt:304` | Migration lambda calls `appSettingRepository.save()` without `@Transactional` | 🔎 |
| M11 | `EmailImportService.kt:42` | Silent empty `catch (e: Exception) { continue }` in date parser — add debug logging | 🔎 |
| M12 | `serverApi.ts:14-16` | Only forwards 2 cookies — loses any other state | 🔎 |
| M13 | `AuthProvider.tsx:45` | Stale closure on `pathname`/`router` (lint-disabled empty deps) | 🔎 |
| M14 | `ToastProvider.tsx:38` | `setTimeout` never cleaned up on unmount | 🔎 |
| M15 | `formatEur` in 7 files | `"en-EU"` is not a valid BCP 47 locale — browser falls back silently | 🔎 |
| M16 | `ExpenseOut` DTO | Missing `comparisonId` field (present in `ExpenseCreate`) | 🔎 |
| M17 | `ExpenseForm.tsx:515` | Array index `key={i}` on receipt files — stale UI on removal | 🔎 |
| M18 | `FxService.kt:48-53` | Duplicate-save `catch` swallows genuine persistence errors; cached rates not re-validated `> 0` before use | ⚠️ |
| M19 | `Expense`/`ExpenseReport` `@SQLDelete` | Soft-delete `UPDATE deleted=true` never cascades to child `receipts` (FK `ON DELETE CASCADE` + own `@SQLRestriction`) → orphaned-but-visible rows. `[GLM]` DB-level CASCADE is dead under soft delete: real DELETEs never occur, so a future JPQL bulk soft-delete would orphan children. | ⚠️ |
| M20 | `V13` `deleted_at TIMESTAMP` | No time zone, vs `Instant` fields and `TIMESTAMPTZ` everywhere else → possible offset drift | ⚠️ |
| M21 | `ReportService.submitReport` / `attachExpenses` | Silently reparents an expense already attached to another draft report; `submitReport` silently drops invalid IDs (inconsistent with `attachExpenses`) | ⚠️ |
| M22 | `AuthController` login | No dummy bcrypt on missing user → username-enumeration timing oracle | ⚠️ |
| M23 | `CryptoService.kt:29-94` | **Hardening (was C4):** hand-rolled AES-CBC + HMAC (encrypt-then-MAC, random 16-byte IV, HMAC-verified-before-decrypt — construction is otherwise sound) with no AEAD/version negotiation. `@Value("\${jwt.secret:}")` defaults to `""` and this service has no local fail-fast. **Severity tempered:** `JwtTokenProvider.validateSecret()` (`@PostConstruct`, lines 24-29) refuses to start on a blank secret using the *same* property, so the empty/predictable-key state is unreachable at runtime — the original "trivially decryptable in production" framing was incorrect. Still worth: migrate to JCA/JCE GCM (or a vetted lib), add a local `@PostConstruct` guard, and prefer a dedicated `encryption.secret` so the guard can't be lost in a future JWT refactor. *(Earlier "Python interop" concern is moot — Python backend removed.)* | 🔎 |
| M-G1 `[GLM]` | `EmailImportService.kt:574-581` | IMAP marks emails SEEN on parse failure — both `if/else` branches call `setFlag(SEEN,true)`. A transient Gemini outage → email dropped, never retried. Mark SEEN only on success. | 🔎 |
| M-G2 `[GLM]` | `ExpenseController.kt:172-207`, `InsuranceController.kt:105-128` | Files written to storage *before* `transactionTemplate.execute{}` → orphan files on DB rollback. Register `afterCommit` write or clean up on failure. | 🔎 |
| M-G3 `[GLM]` | `PdfService.kt:29` | Shared `DecimalFormat` in a `@Service` singleton — not thread-safe; concurrent exports corrupt/throw. Make local / `ThreadLocal`. | 🔎 |
| M-G4 `[GLM]` | `ExportService.kt:42` | **Cosmetic/convention only (corrected):** Excel date format `"yyyy-mm-dd"`. `mm` denotes minutes in Excel *only* when adjacent to a time token (`h`/`hh`/`ss`); in a date-only pattern Excel renders it as month, so exported dates are correct. Optionally use `"yyyy-MM-dd"` for clarity. NOT a wrong-month bug. | 🔎 corrected |
| M-G5 `[GLM]` | `Models.kt:183,331,394` | No `@Version` on `Expense`/`AdvancePayment`/`MileageRecord` (only `ExpenseReport` has it). Concurrent manual + OCR edits to one expense silently lose updates on money. Add `@Version` + migration. | 🔎 |
| M-G6 `[GLM]` | `OcrService.kt:214-303` | OCR cache returns stored provider *errors* forever (no TTL/retry) — a transient rate-limit is replayed on every subsequent identical-receipt scan. Key cache hits on success-only. | 🔎 |
| M-G7 `[GLM]` | `EmailImportService.kt:546-554`, `EmailSettingsService.kt:166-169` | IMAP never uses STARTTLS on non-993 ports → credentials sent in cleartext. Set `mail.imap.starttls.enable=true`. | 🔎 |
| M-G8 `[GLM]` | `OcrController.kt:151-196` | OCR accuracy stats use the wrong denominator: per-provider count includes rows with *any* field, but the numerator counts only rows with that field → accuracy systematically underreported. Use per-field denominators. | 🔎 |

---

## LOW — Track

| # | Location | Issue |
|---|----------|-------|
| L1 | `JwtTokenProvider.kt:68` | Generic `catch` swallows all exceptions including `SignatureException` |
| L2 | `ExportService.kt:17` | `isoDateTime` uses literal `Z` on `LocalDateTime` — misleading UTC implication |
| L3 | `DataInitializer.kt:134,159` | Report totals hardcoded instead of computed from expenses |
| L4 | `CategoryController.kt:22` | Returns raw JPA entity instead of DTO |
| L5 | `reports/new/page.tsx:179` | Empty-whitespace title passes `if (title)` check |
| L6 | `Sidebar.tsx:100` | `startsWith` nav matching over-matches similar routes |
| L7 | `ExpensesClient.tsx:230` | Delete expense has no confirmation dialog |
| L8 | `middleware.ts:6` | Skips auth for `.png` only — misses `.jpg`, `.svg`, etc. |
| L9 | `JwtAuthenticationFilter.kt:31` | DB roundtrip on every request — no user cache |
| L10 | Docker base image SHAs | Should be periodically refreshed for security patches |
| L11 | `inventory_items.request_id` | V10 added the FK but no index (PostgreSQL doesn't auto-index FKs) |
| L12 | `OcrService.kt:355` | Compiler warning "Condition is always 'true'" — dead branch |
| L-G1 `[GLM]` | `CategoryController.kt:19-29` | `listCategories` never reads `currentUser` — verify global security requires auth on `/api/categories` |
| L-G2 `[GLM]` | `ReportService.kt:152-167` | `recallReport` accepts `rejected → draft` but never clears `rejectedBy/rejectedAt/rejectedReason`; after recall→resubmit→approve the report shows both approver and stale rejector |
| L-G3 `[GLM]` | `ReportController.kt:382-420` | `downloadReceiptsZip` empty-check (`zipBytes.isEmpty()`) is dead — `ZipOutputStream` always emits EOCD; when all receipt files are missing/corrupt the client gets a valid-but-empty ZIP instead of 404 |
| L-G4 `[GLM]` | `ExpenseController.kt:357` | Receipt filename `${expenseId}_${rawFilename}` collides — two uploads with same original name overwrite one file |
| L-G5 `[GLM]` | `DataInitializer.kt:62-84` | Demo accounts where `password == username` if `SEED_DEMO_USERS=true` in prod |
| L-G6 `[GLM]` | `app/layout.tsx:14-24` vs `ThemeProvider.tsx` | Theme flash for "system" users: no-flash script sets `isDark=false` when `stored==="system"` |
| L-G7 `[GLM]` | `InsuranceController.kt:122,156` | `upload.contentType` stored verbatim and reused on download with no magic-byte validation → content-sniffing/stored-XSS risk |
| L-G8 `[GLM]` | `DashboardController.kt:35-66` | `pendingApprovalCount` is 0 for managers unless `all=true` |
| L-G9 `[GLM]` | `ExportService.kt` (cache-hit path) | Every OCR cache-hit inserts a new `OcrComparison` row rather than reusing → table bloat |
| L-G10 `[GLM]` | `app/inventory/page.tsx:62-71` | Managers' "My Requests" fetches `status:"pending"` then filters to own id → their approved/rejected history never appears |
| L-G11 `[GLM]` | `app/insurance/page.tsx:82-84` | `downloadBlob(...)` not awaited/caught → unhandled rejection, no toast on failure |
| L-G12 `[GLM]` | `app/reports/new/page.tsx:68-191` | No `<form>` element, so `required` on date inputs is inert; onClick only checks title |
| L-G13 `[GLM]` | `ExpenseForm.tsx:283` | Scanned file re-uploaded uncompressed (OCR compresses for scan; original `file` pushed into `receiptFiles`) |

---

## Checked and NOT bugs

- Suspected `updateExpense` "silent detach via null reportId" is NOT present — `ExpenseService`
  correctly treats null `reportId`/`categoryId` as "leave unchanged".
- `password_hash` is correctly hidden (`@JsonIgnore` + `UserResponse` DTOs).
- Token signature/expiry validation, refresh-token rotation, and `hasRole("mod")` URL guards are correct.
- `FxService` (current `main`) correctly short-circuits `EUR → 1.0` before any repo/HTTP call;
  `FxServiceTest` passes on current code (the 2-day-old CI failures were a different/older commit).
- `[GLM]` Concurrent background `updateEasyOcrResult`/`updateMineruResult`/`updateGeminiResult` are **not** lost updates — each is a column-disjoint `@Modifying` UPDATE (`Repositories.kt:167-201`).
- `[GLM]` `ExpenseReport` has `@Version` (`Models.kt:137`) → concurrent double-approve/double-pay on the report itself is mitigated (C0's CHECK-constraint bug is separate).
- `[GLM]` LDAP username in `authenticateLdap:237` **is** escaped (`escapeFilterChars`); jjwt uses `verifyWith(SecretKey)` → blocks `alg:none`/asymmetric confusion; CSV/Excel formula injection is mitigated (`ExportService.sanitizeFormula:90-91`).

---

## STRUCTURAL CONCERNS

| File | Lines | Issue |
|------|-------|-------|
| `OcrService.kt` | 991 | Too large, mixed concerns (scanning, classification, comparison, Gemini, MinerU) |
| `EmailImportService.kt` | 633 | Parsing logic + IMAP connectivity — split candidate |
| `PdfService.kt` | 648 | Monolithic PDF generation with all layout inline |
| `ExpenseController.kt` | 514 | TransactionTemplate pattern repeated 3× with force-unwrap |
| `ReportController.kt` | 758 | Reports CRUD + export + zip + PDF — large file |

---

## Top Fix Priority (by risk × impact)

1. **C0** `ReportService.kt:278` + new V17 migration — report payment is broken for any report with expenses (PROVEN)
2. **C6** `StorageService.kt:117` — change `absoluteFile` to `canonicalFile` (path traversal; `[GLM]` proved the guard is non-functional; confirm upstream filename sanitization too)
3. `EmailImportService.kt:535` — Add `@Transactional` to scheduled IMAP polling
4. `EmailImportService.kt:274` — Move API key from query param to header
5. `ReportService.kt:107` — Replace `.get()` with `.orElseThrow()`
6. `OcrService.kt:180,570` — URL allowlist validation for mineruUrl/baseUrl
7. `UserController.kt:96` — Fix unsafe `as User` cast
8. `OcrService.kt:109` (+ `FxService.kt:14`, `EmailImportService.kt:32`) — HTTP connect/read timeouts (`[GLM]`)
9. **H0e** `ExpenseForm.tsx:171` — fix error swallowing to prevent duplicate expenses (`[GLM]`)
10. **H0c** `ReportService.kt:259` — block self-payment (`[GLM]`)
11. **H0f/H0g** `LdapService.kt:230` / `S3StorageProvider.kt:65` — resource leaks (`[GLM]`)
12. Frontend (9 files) — Replace `<a href={API_BASE_URL/...}>` with Axios blob download
13. `OcrService.kt:392,404,416` — Replace unmanaged ForkJoinPool with `@Async`
14. `ReportService.kt:260` + `ExpenseController.kt:278,317` — Fix `mod`-pay and receipt-IDOR guards
15. `ExpenseForm.tsx:251` — Add max retry count to OCR polling
16. `ReportController.kt:492` — Remove `System.err.println`
17. **H0d** `Repositories.kt:80` — add deterministic `ORDER BY` to paging (`[GLM]`)
18. **M-G1** `EmailImportService.kt:574` — don't mark SEEN on parse failure (`[GLM]`)
19. **M23** `CryptoService.kt:29` — crypto hardening: JCA/JCE GCM + local secret fail-fast (was C4; severity tempered)

---

## Environment Notes

- Host JDK: 25.0.3 (unsupported by Kotlin 2.1.0 — fails with `IllegalArgumentException: 25.0.3` in the compiler). Build/test in Docker.
- To run tests locally: `eclipse-temurin:21-jdk` with the Docker socket mounted for Testcontainers
  (`--network host -v /var/run/docker.sock:/var/run/docker.sock`, `TESTCONTAINERS_HOST_OVERRIDE=localhost`).
  Prior runs may leave `build/` owned by root — clear it via a throwaway container if Gradle can't write.
- Docker services: backend (Spring Boot 3.4.5), PostgreSQL 16, ocr-sidecar (FastAPI + EasyOCR), MinerU
- Frontend: Next.js 15 + React 19, TanStack Query 5, Zod 4, Tailwind v4, Axios
- Auth: JWT in httpOnly cookies, bucket4j rate limiting (10/min login, 5/min refresh)
- DB: Flyway (16 migrations), `ddl-auto: validate`, soft delete via `@SQLDelete`
- Test-suite caveat: `IntegrationTestBase` is class-level `@Transactional` (rollback-per-test), so
  bugs that only surface at commit/flush (CHECK/FK/NOT-NULL constraints) are invisible to it — this is
  exactly why C0 slipped past a test that supposedly covers it.

---

## Merge changelog
- 24 Jun 2026 — initial Hermes/Opus 4.8 deep-verified pass.
- 25 Jun 2026 — merged GLM-5.2 parallel-agent pass. Added `[GLM]` entries: H0c, H0d, H0e, H0f, H0g, M-G1..M-G8, L-G1..L-G14. Enriched C4 (empty-secret), C6 (File.startsWith mechanism), H3 (expanded locations), H11 (FxService/EmailImportService), M3 (schema-wide Double), M19 (dead CASCADE). Deduplicated overlaps (path traversal, HTTP timeout, API-key-in-URL, `<a href>` downloads, OCR polling, System.err.println, unsafe cast, JWT salt) — counted once. Full GLM-5.2 standalone findings preserved in `glm52.md`.
- 25 Jun 2026 — Opus 4.8 review pass: spot-checked 8 of ~30 `[GLM]` claims against source. Verified accurate: C6 (guard non-functional), H0c, H0d, M-G3, M-G5. Corrections applied: **C4 downgraded CRITICAL→MEDIUM (M23)** — `JwtTokenProvider.@PostConstruct` already fails fast on blank `jwt.secret`, so the "trivially decryptable in production" framing was wrong; **L-G14 removed** — an `effDate.isEmpty()` guard precedes the `getRate` call, so the described `BAD_GATEWAY` crash can't occur; **M-G4 reclassified to cosmetic** — Excel renders `mm` as month in a date-only pattern. Softened the `[GLM]` tag definition and added an exploitability caveat to C6 (gated by upstream filename sanitization). Remaining ~22 `[GLM]` items are not yet independently verified.
