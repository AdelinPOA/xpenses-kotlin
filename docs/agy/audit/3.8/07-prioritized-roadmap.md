# Prioritized Production-Hardening Roadmap

## Strategy and Release Gates

This roadmap organizes all audit findings across Mobile UX, Frontend, Backend, Security, and Operations into six sequential, risk-prioritized phases. Work must proceed strictly in order: financial calculations, data integrity, and security take precedence over mobile UI polish, which in turn precedes secondary styling and nonessential optimizations.



---

## Phase 0: Stop-Ship Critical Fixes

- **Goal:** Eliminate immediate financial underpayments, data corruption, active test regressions, production credential exposure, and executable document upload vulnerabilities.
- **Estimated Effort:** Medium (M)
- **Target Timeline:** Immediate blocker prior to any production traffic.

### Tasks
1. **[BE-001] Fix Report Reimbursement Calculation to Include Mileage in PDF & API:**
   - Modify `PdfService.kt` to include `totalMil` in `reimbursementAmount` calculation (`totalEur.add(allowance).add(totalMil).subtract(totalAdv)`).
   - Unify calculation formula between `ReportMapper.kt` and `PdfService.kt` into a single domain calculation method.
2. **[BE-003 / BE-002] Restrict Advances on Settled Reports & Freeze Allowance Rates:**
   - In `AdvanceController.kt`, reject advance creation, request, or payment if report status is `approved` or `paid`.
   - Snapshot allowance rates and component totals upon submission/approval so subsequent administrative settings changes do not mutate historical reports.
3. **[SEC-001] Neutralize Insurance File Upload Execution:**
   - In `InsuranceController.kt`, enforce strict content-type validation against binary magic bytes.
   - Set `Content-Disposition: attachment; filename="..."` and sandbox headers on file downloads.
   - Prohibit serving raw user-supplied HTML under `text/html` or `text/plain`.
4. **[SEC-002 / FE-001] Isolate Offline Queue by Authenticated User ID:**
   - Bind IndexedDB queued items in `offlineQueue.ts` to the current user ID.
   - At replay time in `OfflineSyncProvider.tsx`, verify current active user matches queue owner; do not replay other users' offline expenses.
   - Implement backend idempotency key in `ExpenseController` to prevent duplicate submissions on network reconnect.
5. **[OPS-001 / OPS-002 / OPS-003] Secure Production Secrets & Network Exposure:**
   - Update `docker-compose.yml` to require mandatory `DB_PASSWORD`, `JWT_SECRET`, and `ENCRYPTION_SECRET` without fallback to default passwords.
   - Bind backend and frontend published ports to `127.0.0.1` instead of `0.0.0.0`.
   - Set `SEED_DEMO_USERS=false` by default in production.
6. **[TST-001] Fix Current Backend Test Breakages:**
   - Resolve the two failing tests in `ExpenseControllerTest.kt` (technician expense isolation and soft-delete audit filtering).

### Files Likely to Change
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt`
- `frontend/lib/offlineQueue.ts`
- `frontend/components/OfflineSyncProvider.tsx`
- `docker-compose.yml`
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ExpenseControllerTest.kt`

### Risks
- Recalculating historical report reimbursement must not break existing closed accounting records without audited migration.
- Restricting advance payments might require an explicit manager adjustment override for edge cases.

### Acceptance Criteria
- Reimbursement totals on PDF, XLSX, and web details are 100% identical and include mileage.
- Insurance upload of an HTML file downloads as a forced attachment without executing script.
- Offline expense created by User A is never synced under User B.
- Backend test suite (`./gradlew test`) passes with 0 failures.

### Verification Commands
```bash
cd backend-kotlin-jpa && ./gradlew test --tests "*PdfServiceTest*" --tests "*ExpenseControllerTest*"
docker compose config
grep -E "0.0.0.0|xpenses:xpenses" docker-compose.yml || echo "Hardcoded exposure removed"
```

---

## Phase 1: Mobile Field-User Usability Fixes

- **Goal:** Resolve all navigation dead-ends, touch target issues, keyboard traps, drawer overflows, and dark-mode signature bugs encountered by technicians on iOS Safari and Android Chrome.
- **Estimated Effort:** Large (L)
- **Target Timeline:** Required before pilot testing with mobile technicians.

### Tasks
1. **[MUX-001] Implement Missing Expense Detail Route (`/expenses/[id]`):**
   - Create `frontend/app/expenses/[id]/page.tsx` providing an authorized read-only expense detail view with receipt viewer, OCR confidence details, and an Edit button for draft items.
   - Route dashboard and search expense links to this page.
2. **[MUX-002] Fix Closed Sidebar Focus Trapping & Romanian Inertness:**
   - In `Sidebar.tsx`, add HTML `inert` attribute and `aria-hidden="true"` when closed on mobile.
   - Ensure open drawer traps Tab and Shift+Tab properly from initial focus.
   - Reference background navigation container via stable ID or data-attribute instead of English string `aria-label`.
3. **[MUX-004] Standardize 44x44 CSS px Mobile Touch Targets:**
   - Audit and adjust hitboxes in `PendingReportsTable.tsx`, `BulkReviewDrawer.tsx`, `ExpenseForm.tsx`, and `ToastProvider.tsx`.
   - Provide accessible names for icon-only buttons (e.g. receipt removal buttons).
4. **[MUX-011] Fix Dark-Mode Signature Export (Black Ink Normalization):**
   - In `SignaturePad.tsx`, normalize stroke colors to pure black on transparent/white background when generating the PNG data URL.
   - Verify signatures are clearly legible on white PDF pages regardless of client UI theme.
5. **[MUX-003 / MUX-005] Protect Unsaved Edits on Swipe-Back & Form Error Announcements:**
   - Implement dirty form guard across expense creation, report editing, and signature pad.
   - Add `role="alert"` and `aria-live` announcements to form error summaries and toast notifications.
   - Set 16px minimum font size on mobile inputs to prevent iOS Safari auto-zoom.
6. **[FE-002] Fix Misleading Expense Delete "Undo":**
   - Either implement true soft-restore retaining receipts and original FX snapshots, or remove the "Undo" toast action and replace with an explicit confirmation dialog warning that receipt deletion is permanent.

### Files Likely to Change
- `frontend/app/expenses/[id]/page.tsx` (new file)
- `frontend/components/layout/Sidebar.tsx`
- `frontend/components/layout/AppShell.tsx`
- `frontend/components/signature/SignaturePad.tsx`
- `frontend/components/expenses/ExpenseForm.tsx`
- `frontend/components/expenses/BulkReviewDrawer.tsx`
- `frontend/components/dashboard/PendingReportsTable.tsx`
- `frontend/components/ToastProvider.tsx`
- `frontend/app/expenses/ExpensesClient.tsx`

### Risks
- Adjusting touch targets on dense tables could increase vertical scrolling; requires stacked mobile card design for narrow screens.

### Acceptance Criteria
- Tapping any expense link on Dashboard or Search opens a valid detail page (no 404).
- Screen readers cannot navigate into closed sidebar; open drawer traps focus completely.
- Signature drawn in dark mode produces visible dark strokes on exported report PDF.
- All actionable buttons on mobile screens have at least 44x44px hitbox.

### Verification Commands
```bash
cd frontend && npm run build
cd frontend && npm run lint
cd frontend && npx playwright test tests/mobile-ui.spec.ts --project=mobile-chromium --project=mobile-webkit
```

---

## Phase 2: Security & Data Integrity Hardening

- **Goal:** Harden token lifecycles, prevent cache data leakage across sessions, enforce OCR quotas, and wire durable ingestion ledgers.
- **Estimated Effort:** Large (L)
- **Target Timeline:** Required before general company-wide rollout.

### Tasks
1. **[SEC-004] Reconcile 401 vs 403 Session Expiry Contract:**
   - In Spring `SecurityConfig.kt`, configure an `AuthenticationEntryPoint` returning JSON 401 on unauthenticated or expired token requests.
   - In `AuthProvider.tsx` and `api.ts`, trigger token refresh on 401; reserve 403 strictly for forbidden role/ownership denials.
2. **[SEC-003] Purge Authenticated RSC & HTML from Service Worker Cache:**
   - In `public/sw.js`, cache only static immutable assets (`_next/static`, icons, manifest).
   - Never cache dynamic Next.js RSC payloads or authenticated HTML pages (`/dashboard`, `/expenses`, `/reports`).
   - Clear query cache and service worker caches on logout in `AuthProvider.tsx`.
3. **[SEC-005] Enforce Quotas on Bulk Upload & Pre-Validate Magic Bytes:**
   - In `BulkExpenseController.kt`, apply rate limiting and per-user quota checks before calling OCR provider.
   - Validate magic bytes (JPEG/PNG/PDF) prior to invoking Gemini API.
4. **[BE-004 / SEC-006] Wire IMAP Ingestion Ledger and Authenticate Senders:**
   - Inject `ImapIngestionLedger` into `EmailImportService.kt`; claim messages atomically before processing.
   - Enforce SPF/DKIM verification or signed sender tokens before creating draft reports from incoming emails.
5. **[BE-007] Atomic Receipt Storage Deletion and S3 Error Handling:**
   - In `StorageService.kt`, delete local/S3 files only after database transaction successfully commits.
   - Throw explicit exception and rollback transaction if S3 upload fails.

### Files Likely to Change
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/JwtAuthenticationFilter.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt`
- `frontend/public/sw.js`
- `frontend/components/AuthProvider.tsx`
- `frontend/lib/api.ts`

### Risks
- Modifying service worker caching requires robust cache invalidation logic (`skipWaiting`, `clients.claim`) to prevent stale caches on existing installed PWAs.

### Acceptance Criteria
- Expired session automatically refreshes without logging the technician out.
- Logging out completely erases cached financial data from browser memory and CacheStorage.
- Sending 20 non-image files to bulk upload is rejected immediately with 0 external OCR calls.
- Duplicate IMAP polls never create duplicate expense reports.

### Verification Commands
```bash
cd backend-kotlin-jpa && ./gradlew test --tests "*Auth*" --tests "*Security*"
```

---

## Phase 3: Test Coverage & CI Gates

- **Goal:** Eliminate test gaps, unskip Playwright mobile tests in CI, and establish automated security and container quality gates.
- **Estimated Effort:** Medium (M)
- **Target Timeline:** Concurrent with Phase 2.

### Tasks
1. **[OPS-010 / TST-002] Enable Authenticated Mobile Tests in CI Pipeline:**
   - Update `.github/workflows/ci.yml` to spin up ephemeral Postgres and Redis containers.
   - Set `PLAYWRIGHT_AUTHENTICATED_UI="true"` and run all 36 Playwright mobile tests on both Chromium and WebKit.
2. **[TST-003] Add Spring-Context Transactional Tests for Async OCR:**
   - Replace or complement Mockito-based `AsyncOcrTest.kt` with an `@SpringBootTest` integration test validating that provider calls happen outside active DB transactions.
3. **[TST-004] Add Milestone-Correct Reimbursement & Allowance Snapshot Tests:**
   - Add integration tests verifying report reimbursement calculation with positive mileage, allowances, and advance deductions.
4. **[OPS-010] Add Automated Dependency & Container Smoke Scans:**
   - Add `npm audit --audit-level=high` in frontend workflow.
   - Add container healthcheck verification in `build-docker` job before image push.

### Files Likely to Change
- `.github/workflows/ci.yml`
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ocr/AsyncOcrIntegrationTest.kt` (new file)
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/PdfServiceTest.kt`

### Acceptance Criteria
- CI runs 100% of the 36 Playwright mobile tests; zero tests skipped.
- Pull requests fail if backend unit/integration tests fail or high-severity vulnerabilities are detected.

---

## Phase 4: Performance, Observability & Ops Hardening

- **Goal:** Provide disaster recovery automation, request correlation tracing, container resource safety, and log rotation.
- **Estimated Effort:** Medium (M)
- **Target Timeline:** Required before multi-department production deployment.

### Tasks
1. **[OPS-004] Implement Full Backup and Disaster Recovery (DB + Files):**
   - Update `scripts/backup-db.sh` to create a unified snapshot containing the Postgres database dump and a compressed archive of `/app/data` (receipts and signatures).
   - Author `scripts/restore-db.sh` with integrity verification.
2. **[OPS-007] Implement Request Correlation ID & MDC Tracing:**
   - Add `CorrelationIdFilter` in Spring Boot injecting `X-Request-ID` into SLF4J MDC.
   - Include `requestId` in production JSON logs in `logback-spring.xml`.
   - Propagate `X-Request-ID` in Axios client and return it in HTTP response headers.
3. **[OPS-006] Configure Docker Compose Log Rotation:**
   - Add `json-file` logging limits (max-size: 50m, max-file: 5) to all services in `docker-compose.yml`.
4. **[OPS-005] Require Redis Password Authentication:**
   - Set `--requirepass` in Redis service; update backend connection URL.
5. **[OPS-009] Tune JVM Container Ergonomics:**
   - Set `-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError` in backend container options.
6. **[BE-005 / BE-006] Nontransactional Async OCR & Persistent Job Inputs:**
   - Refactor `AsyncOcrService` to decouple network calls from database transactions.
   - Save OCR receipt inputs to persistent storage before enqueuing to survive process restarts.

### Files Likely to Change
- `scripts/backup-db.sh`
- `scripts/restore-db.sh` (new file)
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/CorrelationIdFilter.kt` (new file)
- `backend-kotlin-jpa/src/main/resources/logback-spring.xml`
- `docker-compose.yml`
- `backend-kotlin-jpa/Dockerfile`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt`

### Acceptance Criteria
- Full restore from backup recovers all database entities and makes receipts downloadable.
- Every log line contains `requestId` matching client failure reports.
- Container logs never exceed 250MB per service on host disk.

---

## Phase 5: Visual Polish & Design System Cleanup

- **Goal:** Unify UI primitives, clean up lingering JSX text bugs, optimize typography contrast for outdoor use, and refine internationalization formatting.
- **Estimated Effort:** Small to Medium (S-M)
- **Target Timeline:** Post-production launch iteration.

### Tasks
1. **[MUX-012] Remove Stray Implementation Text:**
   - Remove `return (` literal text node in `PendingReportsTable.tsx:347`.
2. **[MUX-008] Fix Contrast Ratios & Respect Reduced Motion:**
   - Adjust `muted-foreground` token in `globals.css` to achieve >= 4.5:1 contrast against light (#ffffff) and dark (#151b2b) card surfaces.
   - Wrap CSS animations with `@media (prefers-reduced-motion: reduce)`.
3. **[MUX-009] Localize Missing Romanian Messages & Dynamic Dates:**
   - Replace missing keys in `ReportDetailClient.tsx` (`t("common:approve")` / `t("common:reject")`).
   - Standardize date formatting according to active user locale and timezone.
4. **[MUX-010] Narrow Viewport Header & Banner Spacing:**
   - Ensure offline banner reserves layout space and does not overlap fixed headers or safe areas at 360px width.

### Files Likely to Change
- `frontend/components/dashboard/PendingReportsTable.tsx`
- `frontend/app/globals.css`
- `frontend/app/reports/[id]/ReportDetailClient.tsx`
- `frontend/messages/ro.json`
- `frontend/components/OfflineSyncProvider.tsx`

### Acceptance Criteria
- Zero stray JSX text in manager review queues.
- Contrast ratio >= 4.5:1 on all secondary financial metadata.
- All action buttons and decision badges properly translated in Romanian.
