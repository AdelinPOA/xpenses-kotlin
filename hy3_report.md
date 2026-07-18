# Codebase Review — xpenses-kotlin

Four parallel review passes (backend services, backend controllers/security, frontend, tests/infra)
plus manual verification. Findings below, prioritized by severity.

## 🔴 HIGH — data loss / corruption

**1. `ReportController.deleteReport` soft-deletes all child expenses (loses them)**
`ReportController.kt:210-219` + `Models.kt:171`

The loop sets `expense.report = null` but never clears the expense from the
`report.expenses` collection. With `cascade = [CascadeType.ALL], orphanRemoval = true`,
`delete(report)` cascades a soft-delete (`deleted = true`) to every expense still in
the collection. Deleting your own draft report silently destroys its expenses —
contradicting the code's explicit intent to detach them as standalone drafts.

Fix: clear the association before delete —
`report.expenses.clear(); expenseReportRepository.delete(report)` — or remove
`CascadeType.REMOVE` from the link and delete the report alone.

## 🟠 MEDIUM — security / correctness

**2. SHA-256 hex encoding wrong for high-bit bytes** — `OcrService.kt:134`
`"%02x".format(it)` sign-extends a `Byte` ≥ 0x80, emitting `ffffffff`. Half of all
hashes are invalid; breaks OCR caching/hash matching and stores garbage.
Fix: `"%02x".format(it.toUByte().toInt())` or `it.toInt() and 0xFF`.

**3. `FxService.convert()` divides instead of multiplies** — `FxService.kt:77`
`getRate` is a *multiply-to-EUR* rate (every caller multiplies). `convert()` divides
→ inverted money math. Latent today (unused) but will corrupt if wired in.
Fix: `.multiply(rate).setScale(2, RoundingMode.HALF_UP)`.

**4. ZIP Slip in `downloadReceiptsZip`** — `ReportController.kt:391-407`
Entry names from user-controlled `merchant`/`description` only replace `/`. A `..` or
`\` segment lets a crafted merchant write outside the extract dir when a manager
extracts (Windows). Fix: strip `..`/`\`, or name entries `${id}_${i}.${ext}`.

**5. Public Swagger/actuator in prod** — `SecurityConfig.kt:47-49`, `application.yml`, `docker-compose.yml`
`/v3/api-docs/**`, `/swagger-ui/**`, `/actuator/info` are `permitAll`; `SWAGGER_ENABLED`
defaults `true` and compose never sets it. Full API surface disclosed.
Fix: gate behind `mod` (or `SWAGGER_ENABLED=false` in compose).

**6. JWT cookies not `Secure` in prod** — `AuthController.kt:36`, `docker-compose.yml`, `.env`
`cookie.secure` defaults `false`, never overridden. Behind TLS the `Secure` flag is
never set. Fix: `COOKIE_SECURE=true` in compose.

**7. Weak demo credentials** — `DataInitializer.kt:56-89`
`SEED_DEMO_USERS` seeds `mod1/mod1`, `cfo1/cfo1` (admin/finance) with
`password == username`. A left-on flag anywhere non-dev = trivial admin login.
Fix: dev-profile-only / strong generated passwords.

**8. `cleanOrphans` path containment bypass** — `AppSettingsController.kt:432-438`
`file.startsWith(baseDir)` is a *prefix* match, not directory containment. A sibling
`…/receipts2` passes the check → delete outside tree.
Fix: canonical `Path` relativize, reject `..`.

**9. HTML email bodies not stripped before parsing** — `EmailImportService.kt:617`
`text/html` content is fed raw to `parseDelegationEmailLocal`; tags/`<style>` corrupt
parsed fields. Fix: strip HTML (jsoup/Tika) first.

**10. S3 `S3Client` leaked / never closed** — `S3StorageProvider.kt:27`, `StorageService`
New `S3Client` per config change/test; old pool never released.
Fix: `AutoCloseable`, close previous before reassigning.

**11. False-positive test assertions** — `ExpenseControllerTest.kt:41`, `DashboardControllerTest.kt:37`
`[?(@.user_id != X)].isEmpty` passes even if the endpoint returns `[]`. Doesn't prove
"own data only". Fix: also assert non-empty + own row present.

**12. `FxServiceTest` hits live external APIs** — `FxServiceTest.kt:56-68`
Stubbed repo but real `RestClient` to frankfurter/jsdelivr. Non-hermetic, network-dependent.
Fix: mock the HTTP client (or WireMock).

**13. Frontend: `downloadBlob` revokes URL immediately** — `lib/api.ts:615-629`
`URL.revokeObjectURL` after `click()` can truncate large PDF/zip downloads.
Fix: defer revoke (`setTimeout` ~1s) and check for non-blob error responses.

## 🟡 LOW — robustness / hygiene

- **Dashboard double-fetch** — `app/dashboard/page.tsx:12` vs `DashboardClient.tsx:38`:
  RSC prefetch query-key never matches client key (extra `user?.id` element); prefetch wasted.
- **Infinite dashboard skeleton** for edge auth states — `DashboardClient.tsx:43`.
- **CSV locale formatting** — `ExportService.kt:84-85`: `"%.2f".format` uses default
  locale (comma in DE/RO). Use `Locale.ROOT`.
- **AsyncOcr `REQUIRES_NEW` no-op** — `AsyncOcrService.kt:45` self-invocation bypasses proxy.
- **Soft-delete orphans receipts** — `ExpenseService.kt:236`: deleting expense leaves
  dangling `Receipt` rows.
- **Client-only role gating** — `Sidebar.tsx`/`middleware.ts`: admin pages reachable by
  URL (backend rejects, but flash).
- **OCR date/currency prefill** — `ExpenseForm.tsx:284-287`: fragile "date still == today"
  logic overwrites edits.
- **`cleanOrphans`/migration path-traversal** inconsistencies, **unvalidated pagination**
  (negative `page`→500), **validation error message leak** (`ValidationExceptionHandler.kt:40`),
  **CSRF filter double-registered** (`SecurityConfig.kt` `@Bean`+`addFilterBefore`),
  **hardcoded Gemini crypto password** (`OcrService.kt`), **`eslint-config-next` 15.1.0 vs
  next 15.5** mismatch, **`.env` DS host `xpenses-db`** vs compose `db`, **missing `deleted`
  index** (soft-delete full scans), **`expense_reports.user_id` NOT NULL vs nullable entity**.

## 🟠 ADDITIONAL MEDIUM — discovered during full review

**28. SHA-256 hex encoding bug in test** — `OcrServiceTest.kt:48`
Same `"%02x".format(it)` sign-extension bug on signed `Byte` in test setup; produces invalid cache hashes.

**29. SHA-256 hex encoding bug in JWT refresh token hashing** — `JwtTokenProvider.kt:85`
`hashRefreshToken()` uses same broken format; corrupts refresh token hashes stored in DB.

**30. No rate limiting on `/api/auth/me`** — `SecurityConfig.kt`
Token validation endpoint unprotected; bucket4j only guards `/auth/login` and `/auth/refresh`.

**31. Role change doesn't invalidate existing JWTs** — `AuthController.kt:188`, `JwtTokenProvider.kt:50,70`
`tokenVersion` only incremented on password change. Role escalation via mod panel leaves old tokens valid.

**32. Missing authorization on `/api/reports/export`** — `ReportController.kt:497-564`
Exports ALL reports for privileged users without per-report access checks.

**33. Unvalidated pagination `page` parameter** — `ReportController.kt:88`
Negative `page` → negative `fromIndex` → `IndexOutOfBoundsException` / 500.

---

## 🟡 ADDITIONAL LOW — infra / hygiene

**34. No pre-commit hooks for Kotlin/TypeScript** — `.pre-commit-config.yaml`
Only Ruff (Python). Missing `ktlint`, `detekt`, `eslint`, `prettier`.

**35. No CI security scanning** — `.github/workflows/ci.yml`
Missing SAST (CodeQL/SpotBugs), dependency vulnerability scan (OWASP/Grype), container scan (Trivy).

**36. Caddyfile uses HTTP (port 3001) not HTTPS** — `Caddyfile:1`
Conflicts with `COOKIE_SECURE=true` requirement; cookies won't be sent over HTTP.

**37. Docker healthcheck references non-existent `/api/health`** — `docker-compose.yml:56`
Spring Security permits `/api/health` but no controller defines it → healthcheck fails.

**38. Frontend middleware doesn't validate tokens** — `middleware.ts:10-15`
Only checks cookie existence; expired/invalid tokens pass through to backend.

**39. No Content-Security-Policy headers** — `SecurityConfig.kt`, `Caddyfile`
No CSP, X-Frame-Options, Referrer-Policy, etc. configured.

**40. `@JsonManagedReference` on soft-deleted collections may leak entities** — `Models.kt:171,175,179,260`
Deleted (but not purged) expenses/advances/mileage still serialized in report JSON.

## Recommended fix order

1. **#1** (HIGH data loss) — must fix before anything else.
2. Security defaults: **#5, #6, #7** (Swagger, Secure cookies, demo creds).
3. Correctness: **#2, #3, #4, #8, #9, #10**.
4. Test integrity: **#11, #12**.
5. Frontend: **#13** + dashboard double-fetch.

## 🔴 ADDENDUM — full-codebase review (2026-07-10)

**41. Stored XSS through insurance-document download** — `InsuranceController.kt:124,158-162`

The upload preserves the client-controlled multipart `contentType` and the download
endpoint serves the file inline with that value. A privileged uploader can submit HTML
as an allowed `.txt` file with `Content-Type: text/html`; opening it executes script at
the application origin for the assigned employee. This defeats the cookie's `HttpOnly`
protection because same-origin script can make authenticated requests.

Fix: derive a safe MIME type server-side from a validated file signature, force
`Content-Disposition: attachment`, and set `X-Content-Type-Options: nosniff`. Do not
return the multipart MIME value to the browser.

**42. Submitting a report silently reparents expenses** — `ReportService.kt:105-112`

`attachExpenses()` correctly rejects an expense already attached to another draft
report, but `submitReport(expenseIds)` does not. A submitted expense list can therefore
move a user's expense from one draft report to another without warning.

Fix: share one atomic attachment validator between attach and submit. It must reject
missing IDs, non-draft/not-owned expenses, and expenses attached to another report.

**43. Rejection behaviour contradicts the documented workflow** — `ReportService.kt:248-253`, `README.md`

On rejection the implementation resets expenses to `draft` but keeps them attached.
The documented state machine says they are detached. Since attachment rejects expenses
already attached to another report, the user cannot reuse a rejected expense in a new
report.

Fix: detach on rejection, or explicitly make retaining/reusing the same report the
product rule and update the state-machine documentation and UI accordingly.

## 🟠 ADDITIONAL MEDIUM — security / resilience

**44. Deactivation does not fully revoke access tokens** — `UserController.kt:131-136`, `JwtAuthenticationFilter.kt:33-43`

Deactivation removes refresh tokens but leaves `tokenVersion` unchanged. If the account
is reactivated within the 15-minute access-token lifetime, a previously stolen access
cookie becomes valid again.

Fix: increment `tokenVersion` when deactivating (and add a deactivate/reactivate token
revocation test).

**45. OCR has no per-user cost or concurrency control** — `OcrController.kt:32-85`, `BulkExpenseController.kt:64-142`, `application.yml:59-84`

Any authenticated user can enqueue expensive Gemini work; the bulk endpoint performs
it synchronously. Existing Bucket4j limits cover only login and refresh, so a user can
exhaust worker capacity and third-party OCR quota/cost.

Fix: add per-user rate/concurrency quotas, a bounded durable queue, request deadlines,
and metrics/alerts for queue depth and provider failures.

**46. Invalid business dates can be persisted** — `ExpenseController.kt:496,510`, `ReportController.kt:690-700`

Expense and report dates are unvalidated strings even though FX lookup, filtering, PDF
generation, and daily-allowance calculation assume `yyyy-MM-dd`. Invalid values produce
bad data or downstream 5xx/zero totals.

Fix: accept `LocalDate` in request DTOs, persist PostgreSQL `DATE`, and validate
`date_from <= date_to`.

**47. Storage migration is one long transaction and cannot reliably report progress** — `StorageService.kt:313-385`

All file copies and progress writes occur in one transaction. Progress polling cannot
observe intermediate updates; a restart leaves an ambiguous `running` status and can
hold database resources for the whole migration.

Fix: copy each object in a short independent transaction, persist checkpoints, and make
migrations resumable/idempotent.

**48. Production traffic remains plaintext and bypasses the proxy** — `docker-compose.yml:31-32,69-70,90-103`, `Caddyfile:1`

This extends #6/#36: Compose publishes the backend and frontend directly, while Caddy
publishes only port 80 and is not the public entry point for the configured `:3001`
site. Session cookies and application traffic are exposed if deployed as-is.

Fix: expose only Caddy on 80/443, configure a real TLS hostname/certificate, remove the
direct backend/frontend port mappings in production, and require `COOKIE_SECURE=true`.

## Test / maintenance gaps added by this pass

- No frontend test files exist. Add component/E2E coverage for authentication refresh,
  role restrictions, report state transitions, and authenticated file downloads.
- Backend coverage misses insurance MIME/header handling, report reparenting/rejection,
  OCR quota/failure behaviour, storage migration recovery, pagination bounds, and
  deactivate/reactivate token revocation.
- Documentation is out of sync: `backend-kotlin-jpa/AGENTS.md` says Kotlin 2.1 although
  Gradle uses Kotlin 2.4.0; README's Caddy/public-port description differs from Compose.
- Keep generated review artifacts out of source control: `graphify-out/`,
  `report_6_adjusted.pdf`, and similar local outputs should be ignored or removed.

## Revised immediate fix order

1. **#41 and #48** — eliminate stored XSS and plaintext/direct production exposure.
2. **#1, #42, #43** — prevent loss or silent reassignment of financial records.
3. **#44, #45, #46** — harden session revocation, OCR resource controls, and input data.
4. **#47 plus test gaps** — make migrations recoverable and protect the repaired paths.
