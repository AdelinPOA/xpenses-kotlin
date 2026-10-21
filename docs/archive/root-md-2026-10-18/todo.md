# Codebase Review — Bugs & Optimizations

Review date: 2026-08-03. Scope: Spring Boot/Kotlin backend + Next.js frontend.
Initial findings were checked against source. This backlog was re-reviewed on 2026-08-03
against the current working tree and is annotated below where findings are fixed, partial,
conditional, or still require reproduction. Severity: [critical] > [high] > [medium] > [low] > [info].

## Planning status / review rules

- `[ ]` Open: confirmed in the current source and suitable for implementation planning.
- `[~]` Partial: the original risk remains, but some related code has changed; verify the narrowed scope before implementing.
- `[?]` Verify: plausible or environment-dependent; reproduce or add a focused test before scheduling.
- `[x]` Fixed/stale: no longer matches the current source; retain the note for history but do not plan it as new work.
- The repository had uncommitted changes during this review. Confirm the intended diff before committing any fixes.
- Passing checks do not invalidate runtime, concurrency, security, or production-configuration findings. Backend tests and frontend lint passed on 2026-08-03.

### Findings changed since the initial review

- `[x]` Dashboard pay/reject-advance errors are no longer swallowed: `DashboardClient` now stores and renders `reviewActionError`.
- `[~]` Advance authorization is only partially fixed: pay/reject use `canManage`, but create/delete paid advances still use `canViewAll`, so the moderator-access finding remains open in narrowed form.
- `[~]` FX was migrated to BNR rates and configurable margins, but fallback rates are still saved under the requested date; the cache-date finding remains open.
- `[~]` Access-denied handling was added, but multipart oversize requests still have no `MaxUploadSizeExceededException` → 413 mapping.
- `[?]` Findings based on deployment policy or downstream behavior (OSIV, CSRF treatment of non-browser clients, CSV injection, spreadsheet rendering, and provider lifecycle) require environment-level confirmation before implementation.

## Security / Critical-Impact Backend

- [x] **[high] Rate limiter bypassable** (fixed: trusted-proxy gating + pruned store) — `backend-kotlin-jpa/.../security/RateLimitingFilter.kt:88-103`
  Trusts `X-Forwarded-For`/`X-Real-IP` directly; attacker sends a fake IP per request to bypass the 5/min login and 10/min scan limits. IPv6 never matches `isPrivateIp` (parts != 4 → treated as public → trusted). `requestTimes` map never prunes entries → memory-leak DoS.
  Fix: key on `remoteAddr` only when behind a known proxy; prune/expire map entries.

- [ ] [high] `@Async` is dead code (self-invocation) — `backend-kotlin-jpa/.../report/lifecycle/ReportLifecycleNotificationAdapter.kt:14-23`
  `dispatch()` calls its own `@Async` methods via `this`, bypassing the proxy; approver emails send synchronously on the HTTP thread. Fix: inject self-reference (`@Lazy`) and call through it.

- [x] [high] Stored XSS via insurance files (fixed: extension-based safe mime, attachment disposition, nosniff) — `backend-kotlin-jpa/.../controllers/InsuranceController.kt:126,160-165`
  Client-supplied `Content-Type` echoed on download with no magic-byte check, no `Content-Disposition: attachment`, no `nosniff`. A `.png` containing HTML is served inline as HTML under the app origin.
  Fix: server-side magic-byte → content-type mapping; force `application/octet-stream`; add `Content-Disposition` + `X-Content-Type-Options: nosniff`.

- [x] [high] DB connection held across Gemini OCR chain (fixed: advisory lock scoped to short tx) — `backend-kotlin-jpa/.../services/OcrService.kt:146-153` + `repositories/OcrResultCacheRepository.kt:22-23`
  `pg_advisory_xact_lock` lives for the entire 4-tier OCR chain (up to ~60s each) inside `@Transactional` → connection pool exhaustion. Fix: keep the lock only for the cache-fill phase (short tx / in-memory guard).

- [ ] [high] FX HTTP call inside open transactions — `services/ExpenseService.kt:191`, `controllers/AdvanceController.kt:106,172,264`
  DB connection held during up to 40s of external network I/O → pool exhaustion. Fix: resolve rate before starting the tx, pass it in.

- [ ] [medium] `CryptoService` token timestamp never validated — `services/CryptoService.kt:58`
  No TTL enforcement on encrypted values. Fix: validate `now - timestamp <= maxTtl` on decrypt.

- [ ] [medium] Legacy CBC/HMAC keys derived from `jwt.secret` — `services/CryptoService.kt:96-99`
  A leaked `jwt.secret` forges/decrypts legacy tokens. Fix: derive from a dedicated `encryption.secret` or migrate off CBC.

- [ ] [medium] CSRF origin check 403s all non-browser clients — `config/SecurityConfig.kt:100-104`
  State-changing requests without `Origin`/`Referer` (curl, integrations) get 403. Fix: exempt non-browser markers (`X-Requested-With`, `Authorization`).

- [~] [medium] Oversize uploads return 500 — access-denied handling was added, but `MaxUploadSizeExceededException` is still unmapped in `config/ValidationExceptionHandler.kt`; size checks run post-buffer (`InsuranceController.kt:64-93`, `SignatureController.kt:52-73`). Fix: map to 413; enforce limits before buffering.

- [ ] [medium] No email-uniqueness enforcement — `controllers/UserController.kt:37-58`
  Duplicate emails allowed → email-import `findByEmail` ambiguity. Fix: unique constraint + 409.

## Core Domain / Concurrency

- [x] [medium] Unvalidated manual `fxRate` (fixed: DTO DecimalMin>0 + FxService signum>0) — `services/ExpenseService.kt:91-98,187-204`, `dto/expense/ExpenseCreate.kt:21`
  0/negative rate → `amountEur` 0/negative persisted into report totals; `FxService.kt:47` only rejects 0, accepts negatives. Fix: validate `fxRate > 0`.

- [ ] [medium] `uploadReceipts` stores files before tx commit — `services/ExpenseService.kt:327-351`
  Failure on file N orphans earlier files on disk. Fix: stage files first, then tx; cleanup on failure.

- [~] [medium] mod can create/delete "paid" advances — pay/reject now use `canManage`, but create/delete still use `canViewAll` (`controllers/AdvanceController.kt:64,98,123,212,222`). Fix: use `canManage` for the remaining paid-advance paths.

- [~] [medium] FX fallback cached under wrong date — BNR/ECB fallback logic and margins were added, but the resulting fallback rate is still persisted with the requested date (`services/FxService.kt:62-80`). Fix: only cache date-specific successes, or store the actual source date.

- [ ] [medium] `OptimisticLockException` → 500 on double-submit — `report/lifecycle/ExpenseReportLifecycle.kt:25-127`
  Catch OLE → 409 with retry hint. Concurrent attach can link one expense into two reports; make the membership check atomic.

- [ ] [low] "requested" advances mutate into realized amounts — `controllers/AdvanceController.kt:161-181`
  `updateAdvance` sets `amountOriginal/amountEur` on `status=requested` without `paidBy/paidAt`. Fix: block amount/currency/date edits for requested.

- [ ] [low] `recall` keeps stale signature/rejection metadata — `report/lifecycle/ExpenseReportLifecycle.kt:77-93`
  Clear `signer`/`signedAt`/rejection fields on recall.

- [ ] [low] Rejected-report expenses are individually editable — `services/ExpenseService.kt:173`, `ReportLifecycle.kt:147`
  Gate expense edits on parent report state, not just expense state.

- [ ] [low] Unknown persisted report status → 500 on every read — `report/lifecycle/ExpenseReportLifecycleState.kt:14-20`

- [ ] [low] `!!` NPE risks → 500 — `controllers/AdvanceController.kt:115`, `controllers/ReportController.kt:91,412`

- [ ] [info] `currentUser.id!!`/`report.user!!` — return explicit 401/400.

## Performance / N+1

- [ ] [high] Server prefetch key mismatch → double fetch — `frontend/app/expenses/page.tsx:20` vs `frontend/app/expenses/ExpensesClient.tsx:90`
  Server seeds `["expenses","list",{status:"",category_id:""}]`; client queries `["expenses","list",statusFilter,categoryFilter]`. Fix: single factory shape on both sides.

- [ ] [medium] N+1 on expense list — `services/mapper/ExpenseMapper.kt:23`, `services/ExpenseService.kt:59,67`
  Per-row `expense.receipts` lazy load. Fix: add `receipts` to EntityGraph.

- [ ] [medium] N+1 on report list — `services/mapper/ReportMapper.kt:90-92`, `controllers/ReportController.kt:71-80`
  EntityGraph `["user"]` only; mapper loads 3 lazy collections/report. Fix: widen EntityGraph or read-only tx.

- [ ] [medium] N+1 on advance lists — `controllers/AdvanceController.kt:43-49,343-344`
  `paidBy`/`rejectedBy`/`user`/`report` per row outside tx. Fix: fetch graph + `@Transactional(readOnly = true)`.

- [ ] [medium] Unbounded pagination params — `controllers/ExpenseController.kt:33-34`, `ReportController.kt:57,72`, `services/ExpenseService.kt:56,66`
  Negative page → 500; huge size → full-table load; un-paged path loads everything. Fix: clamp size, validate page.

- [ ] [medium] Dashboard manager aggregation unbounded — `controllers/DashboardController.kt:179-199`
  `findAllWithExpenses().take(10)` pulls whole table. Fix: SQL aggregation + Pageable.

- [ ] [medium] Search unbounded — `controllers/SearchController.kt:45-47`
  Fix: top-N / Pageable.

- [ ] [info] OSIV left on (`application.yml`) — masks all lazy-load issues, holds connections for whole requests. Fix: `open-in-view: false` + explicit read-only tx + fetch graphs.

## Storage / PDF / OCR / Email

- [ ] [medium] Path-traversal guard missing in local branch — `services/storage/StorageService.kt:207-209`
  Remote branch canonicalizes + containment-checks; local branch doesn't. Fix: same `startsWith(canonicalBase+sep)` check.

- [ ] [medium] Cache-download returns non-existent path on fetch failure — `services/storage/StorageService.kt:228-240`
  Swallowed exception; receipts silently vanish from exports. Fix: rethrow or explicit missing return.

- [ ] [medium] Storage migration non-idempotent — `services/storage/StorageMigrationEngine.kt:30-57`, `StorageService.kt:310-317`
  Exception leaves status `running` forever; retry re-copies everything; reads point at new provider mid-migration. Fix: per-file progress + reaper.

- [ ] [medium] Unsupported provider types silently fall back to local — `services/storage/StorageService.kt:86-129`
  `smb`/`webdav`/`sftp` → local provider; secrets stored but never used; data moves where not intended. Fix: reject or implement.

- [ ] [low] Non-atomic file writes / shared cache race — `services/storage/LocalStorageProvider.kt:23-43`, `StorageService.kt:227-240`

- [ ] [low] S3: no path-style for MinIO/self-hosted; no ContentType; `ListBuckets` test (IAM-denied → false negatives); client never closed — `services/storage/S3StorageProvider.kt:27-44,86-92`

- [ ] [medium] PDF merge unbounded memory — `services/PdfService.kt:702-717,47-59`

- [ ] [info] Internal storage paths leaked into PDF error cells — `services/PdfService.kt:665-683`

- [x] [high] OCR advisory lock held across external calls — see Security section above (fixed)

- [ ] [low] Cache hits write `OcrComparison` + update `lastUsedAt` (write amplification) — `services/OcrService.kt:164-187`

- [ ] [low] Base64 re-encoded per fallback tier; MIME from extension not magic bytes — `services/OcrService.kt:192-204,251-266`

- [ ] [low] OCR amount double-roundtrip precision loss — `services/OcrService.kt:380,417-422`

- [ ] [low] No reaper for stuck OCR jobs — `services/AsyncOcrService.kt:35-37`

- [ ] [low] OCR cache cleanup ignores never-reused entries — `services/OcrResultCacheCleanupService.kt:22-28`

- [ ] [medium] `/scan` unbounded concurrency — `controllers/OcrController.kt:32-85`
  Sync path can block HTTP threads ~60s+; no magic-byte validation; queue-capped only on async. Fix: throttle + semaphore + validate bytes.

- [ ] [medium] Email import duplicates + spoofing — `services/EmailImportService.kt:406-448,587-612`
  No message-id dedup (duplicate drafts on crash/retry); spoofable `From:`. Fix: unique messageId + sender-domain allowlist.

- [ ] [low] `@Scheduled` + `@Async` overlapping IMAP polls — `services/EmailImportService.kt:546-547`

## Controllers / Config

- [ ] [medium] Bulk upload: no per-file size/type precheck; OCR runs sync in loop — `controllers/BulkExpenseController.kt:48-103`

- [ ] [info] `BigDecimal(it)` on corrupt settings → 500 — `controllers/AppSettingsController.kt:70-88`

- [ ] [info] Racy category unique-constraint → 500 — `controllers/CategoryController.kt:31-43`

- [ ] [info] DataInitializer demo users/sample data — keep gated on `seed.demo.users`; refuse in prod.

- [ ] [medium] CSV injection — `services/ExpenseService.kt:457-475`, `ReportController.kt:422-436` (`=`, `+`, `-`, `@` prefixes)

- [ ] [low] `HttpMessageNotReadableException` leaks Jackson internals — `config/ValidationExceptionHandler.kt:38-42`

- [ ] [info] `OcrController.kt:121` `findAllOrdered().take(100)` loads full history; `ReviewQueueReader.kt:33` `toInt()` truncation; `ExportService.isoDateTime` hardcodes `Z` on `LocalDateTime`.

## Frontend UX / Money

- [ ] [high] Stuck drag-drop overlay after drop on portalled overlay — `frontend/components/expenses/BulkUploadZone.tsx:31-35`, `frontend/app/expenses/ExpensesClient.tsx:61-70`
  `dragCounterRef` only reset by wrapper `onDrop`, which never fires when dropping on the portalled overlay. Fix: reset in `handleFilesDropped` and on overlay dragleave.

- [ ] [high] Bulk upload failure silent — `frontend/components/expenses/BulkReviewDrawer.tsx:38-44`
  No `onError` on mutation → "No expenses created" with no error. Fix: error banner + distinct state.

- [ ] [medium] `parseFloat(e.target.value) || 0` writes amount 0 on cleared field — `BulkReviewDrawer.tsx:264`

- [ ] [medium] `expense.receipts[0]` crash when undefined — `BulkReviewDrawer.tsx:214`

- [ ] [medium] ExpenseForm Enter-key double submit — `frontend/components/expenses/ExpenseForm.tsx:320` (no `save.isPending` guard)

- [ ] [medium] Default date uses UTC `toISOString()` — `ExpenseForm.tsx:56,276`

- [ ] [medium] Manual FX rate persists after switch back to EUR — `ExpenseForm.tsx:152`

- [ ] [medium] Bulk upload limits ("10 MB / max 20") not enforced — `frontend/components/expenses/BulkUploadZone.tsx:15-26`

- [x] [medium] Dashboard pay/reject-advance errors swallowed — fixed in the current source; `DashboardClient` now stores and renders `reviewActionError` (`frontend/app/dashboard/DashboardClient.tsx:70-99`).

- [ ] [medium] `en-EU` invalid locale → US dates — `frontend/i18n/config.ts:5`, `frontend/lib/format.ts:9-11`

- [ ] [medium] `formatDate` UTC-parse → off-by-one in negative-offset zones; no `timeZone` → SSR hydration mismatch — `frontend/lib/format.ts:57-64`

- [ ] [medium] Axios has no timeout; interceptor mutates non-object error bodies → `TypeError`; refresh failure logs out on any error incl. network-down — `frontend/lib/api.ts:7,30-61`

- [ ] [medium] `checkAuth` logs out on transient network errors — `frontend/components/AuthProvider.tsx:63-77`

- [ ] [high] Proactive refresh bypasses `isRefreshing` guard — `frontend/lib/auth.ts` + `AuthProvider.tsx:43` — dedupe it.

- [ ] [low] `serverApi.ts` throws generic `Error` (no status/detail); no AbortSignal/timeout; GET sends `Content-Type` — `frontend/lib/serverApi.ts:20-40`

- [ ] [low] Inconsistent base-URL defaults (`localhost:8080` vs `backend:8080`) — `lib/api.ts:5`, `lib/serverApi.ts:11`, `next.config.ts:16`

- [ ] [low] `queryKeys.list(filters?)` unnormalized — `list()` vs `list({})` and object vs positional keys → duplicate cache entries — `frontend/lib/queryKeys.ts:8-9`

- [ ] [low] `no_report:true` declared in key but never sent — `frontend/app/reports/[id]/ReportDetailClient.tsx:51-55`

- [ ] [low] Total-sort `||` fallback breaks 0 totals → `NaN` — `frontend/app/reports/ReportsClient.tsx:140-141`

- [ ] [low] Delete confirm buttons not disabled during delete — double-click → duplicate deletes — `frontend/app/reports/ReportsClient.tsx:483-514`

- [ ] [low] SortIcon component defined inside render → remount per render — `ReportsClient.tsx:116-121`

- [ ] [low] `SearchDropdown` page result counts exclude some sections — `frontend/app/search/page.tsx:44-46`

- [ ] [info] Dead code — `BulkUploadZone.tsx:45` (`count = isDragging ? null : null`); `PdfService.formatAmount`; unused `HttpServletResponse`.

## Verification notes

- Backend tests: `backend-kotlin-jpa` has controller/service/security tests (`RateLimitingFilterTest`, `ExpenseServiceTest`, etc.).
- Frontend: Playwright specs in `frontend/tests/`.
