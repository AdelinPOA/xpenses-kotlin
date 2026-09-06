# Test and Verification Plan

## Executive Verdict on Current Test Suite

The repository contains a substantial existing test suite (213 backend tests and 36 Playwright test definitions), but **the test suite does not currently pass in this checkout**, and **critical safety gates are either skipped in CI or structurally masked by artificial test fixtures**.

### Summary of Executed Commands

| Command | Working Directory | Exit Code | Result | Key Observation / Evidence |
|---|---|---|---|---|
| `docker compose config` | repository root | 0 | PASSED | Valid Compose syntax. Discovered hardcoded production secrets in `.env` and direct `0.0.0.0` port mappings (OPS-001, OPS-002). |
| `npm run lint` | `frontend/` | 0 | PASSED | Zero ESLint errors or warnings. |
| `npm run i18n:check` | `frontend/` | 0 | PASSED | 851 translation keys present in both `en.json` and `ro.json`. |
| `npm run build` | `frontend/` | 0 | PASSED | Next.js 16.3.1 Turbopack build succeeded. 21 static routes, 9 dynamic routes. Confirmed missing `/expenses/[id]` route (MUX-001). |
| `npx playwright test --list` | `frontend/` | 0 | PASSED | 36 test cases listed across `mobile-chromium`, `mobile-webkit`, `tablet`, and `desktop`. |
| `./gradlew test` | `backend-kotlin-jpa/` | 1 | **FAILED** | **213 tests completed, 2 failed**. `ExpenseControllerTest` failed in soft-delete audit and technician ownership isolation. |
| Playwright in CI check | `.github/workflows/ci.yml` | N/A | **SKIPPED** | CI explicitly passes `PLAYWRIGHT_AUTHENTICATED_UI="false"`. **35 out of 36 mobile tests are skipped in CI**. |

---

## Analysis of Existing Test Failures

### 1. ExpenseControllerTest Failures (Confirmed in Working Tree)
When running `./gradlew test`, the test runner halts with:
```
ExpenseControllerTest > DELETE expense soft deletes and is hidden from list but visible in audit() FAILED
    java.lang.AssertionError at ExpenseControllerTest.kt:157

ExpenseControllerTest > GET expenses returns only own expenses for technician() FAILED
    java.lang.AssertionError at ExpenseControllerTest.kt:39
```
- **Root Cause Analysis:** In `ExpenseControllerTest.kt:39`, the test asserts that `GET /api/expenses` returns status 200 and an array containing only the technician's own records. The failure indicates either a regression in status code / pagination shape (e.g. returning a `PagedResponse` object instead of a bare JSON array, or an unhandled query parameter), or a regression in tenant isolation.
- In `ExpenseControllerTest.kt:157`, the test deletes an expense and asserts that subsequent `GET /api/expenses` returns status 200 without the deleted ID. The failure demonstrates that soft-deleted items either remain visible in the active list or the query fails.
- **Production Impact:** These failures are active test breakages in the core financial domain (expense retrieval and deletion).

---

## Critical Test Gaps and Structural Masking

### Gap 1: Playwright CI Suite is 97% Ineffective
- **Evidence:** `.github/workflows/ci.yml:96` sets `PLAYWRIGHT_AUTHENTICATED_UI="false"`.
- In `frontend/tests/mobile-ui.spec.ts:53`:
  `test.skip(!authenticatedUiEnabled || !username || !password, ...)`
- **Impact:** 35 out of 36 tests are skipped on every single pull request and push to `main`. Mobile layout overflow at 412px, bottom navigation route changes, drawer focus management, expense form input addressing, and WCAG accessibility are **never evaluated in CI**. Developers and reviewers receive a false-green CI checkmark based solely on the single unauthenticated login page test.

### Gap 2: Backend Mockito Tests Mask Transactional and Concurrency Flaws
- **Evidence:**
  - In `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ocr/AsyncOcrTest.kt:25–40`, `AsyncOcrService` is instantiated directly as a plain Kotlin class using Mockito mocks (`AsyncOcrService(ocrJobRepository, ocrService, ...)`).
  - It does NOT run within the Spring application context.
  - Because it bypasses the Spring CGLIB/JDK proxy, the `@Transactional` annotation on `processOcr` and `REQUIRES_NEW` on `saveJobFailure` are never executed by Spring's transaction manager.
  - The critical flaw where external HTTP provider calls to Gemini are held inside an active database transaction (BE-005) is completely invisible to this unit test.
- **Impact:** Tests pass 100% while production suffers connection pool exhaustion and uncommitted status writes.

### Gap 3: PdfServiceTest Masks Mileage Omission from Reimbursement
- **Evidence:**
  - In `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/PdfServiceTest.kt:103,195`, all test fixtures for report PDF generation pass an empty list for mileage records:
    `mileage = emptyList()`
  - At `PdfService.kt:558–562`, `totalEur.add(allowance).subtract(totalAdv)` is calculated, completely omitting `totalMil`.
- **Impact:** The test asserts that reimbursement matches expectation, but only because `totalMil` happens to be zero in the test. If any mileage record were present, the assertion would fail. This masked bug (BE-001) directly leads to financial underpayment of technicians in production.

### Gap 4: Zero Concurrency and Refresh Token Rotation Tests
- **Evidence:** No test exercises concurrent requests with an expired access token and valid refresh token.
- No test validates that when two simultaneous API requests receive 401/403, only one refresh request is dispatched while the second request queues and replays safely without triggering token reuse detection.

### Gap 5: Zero Test Coverage for IMAP Ingestion Polling
- **Evidence:** `ImapMessageKeyTest.kt` tests only string formatting of IMAP keys. No test verifies `pollAndProcessEmails` or the ledger claim flow. As discovered in BE-004, `ImapIngestionLedger` is not even injected into `EmailImportService`.

---

## Phase-by-Phase Verification Plan

### Phase 0: Stop-Ship Gate Verification
Before any deployment, the following manual and automated checks must pass:
1. **Financial Reimbursement Parity:**
   - Command: `./gradlew test --tests "*PdfServiceTest*" --tests "*ReportMapperTest*"`
   - Verification: Create report with €100 expenses, €40 mileage, €50 daily allowance, €20 advances. Verify PDF text extraction contains `170.00` and API response contains `reimbursement_amount: 170.00`.
2. **Insurance Upload Sandbox:**
   - Upload file named `exploit.html` with MIME `text/html` containing `<script>alert(1)</script>`.
   - Send GET to `/api/insurance/{id}/download`. Verify response header contains `Content-Disposition: attachment; filename="..."` and `Content-Type: application/octet-stream` (or safe sandboxed type). Verify script does not execute in browser.
3. **Cross-Account Offline Isolation:**
   - In Chromium DevTools: Log in as User A. Turn on Network Offline. Capture expense and receipt. Log out. Log in as User B. Turn on Network Online.
   - Verify IndexedDB queue does not replay User A's expense under User B's account. Verify zero expenses created for User B.
4. **Secrets and Network Exposure:**
   - Execute `grep -E "password|secret" docker-compose.yml` and confirm no default fallback credentials exist.
   - Run `netstat -tlpn` on deployment host and verify ports 8001 and 3001 are bound to `127.0.0.1` or unmapped.

### Phase 1: Mobile Usability Gate Verification
1. **Sidebar Focus Trapping and Inertness:**
   - Viewport: 390x844 (iPhone 13).
   - In VoiceOver / keyboard mode: open sidebar. Press Tab / Shift+Tab. Verify focus never leaves the sidebar drawer.
   - Close sidebar. Verify no elements in the closed sidebar receive focus.
   - Switch language to Romanian (`ro`). Verify primary navigation is inert and background cannot be clicked.
2. **Missing Expense Route Fix:**
   - Navigate to `/dashboard`. Tap any expense in the recent activity stream.
   - Verify browser opens `/expenses/{id}` (read-only detail view with Edit action for drafts) and does NOT show 404 Not Found.
3. **Touch Targets:**
   - Run Playwright test measuring bounding box of every button and anchor on `/expenses`, `/reports`, `/approvals`, and `/dashboard`.
   - Verify all interactive elements have `width >= 44px` and `height >= 44px`.
4. **Dark Mode Signature Legibility:**
   - Toggle theme to Dark. Draw signature on `/profile/signature`. Click Save.
   - Export report PDF containing this signature. Open PDF on white page. Verify signature lines are dark/black and clearly legible.

### Phase 2: Data Integrity & Durability Verification
1. **IMAP Ledger Deduplication:**
   - Configure mock IMAP server with 1 unread message.
   - Launch two instances of backend. Trigger simultaneous poll.
   - Verify exactly one database row in `imap_ingestion_ledger` has status `PROCESSED`, and exactly one expense report is created.
2. **Async OCR Crash Recovery:**
   - Submit receipt image for OCR scan. Note job ID.
   - While job status is `processing`, kill backend process (`kill -9`). Restart backend.
   - Verify job does not hang indefinitely; verify worker recovers job or marks it with actionable error.

### Phase 3: CI Hardening & Automation
1. **Unskip Playwright in CI:**
   - Update `.github/workflows/ci.yml` to spin up ephemeral Postgres and Redis containers.
   - Start backend Spring Boot app.
   - Set `PLAYWRIGHT_AUTHENTICATED_UI="true"`.
   - Run `npm run test:e2e:mobile`. Assert 36 passed, 0 skipped.
2. **Dependency Security Scan:**
   - Add `npm audit --audit-level=high` to frontend CI job.
   - Add OWASP Dependency-Check or Trivy scan to backend CI job.
