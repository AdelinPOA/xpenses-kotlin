# Test and verification plan

## Evidence provenance and safe execution

- Initial source baseline: `87bec5a15457c3c74ebec613f2459ac1306093a5`, checked 2026-09-06.
- Reconciled and retested source: `bdb6fcba9845be7053b0087253bb4a1c191d96e3`, checked 2026-09-07. Application fixes were made by another workstream; this audit changed only its Markdown reports.
- Environment: Node `v22.23.1`, npm `10.9.8`, OpenJDK `21.0.12.1`; local dependencies, Docker and Chromium/WebKit binaries were available. Build reports Next.js `16.3.1`.
- Existing ports 3000/3001/8001 belonged to running services. Browser checks used **3107**, with authenticated tests explicitly disabled, to avoid reusing or mutating the existing application. Public test intercepts `/api/auth/me`; no test credentials or live provider calls were used.
- Backend integration base (`backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt`) uses disposable PostgreSQL Testcontainers, temporary storage, mocked OCR/FX/email settings and transaction rollback; it disables application rate limiting. This is not equivalent to real production wiring.
- Raw audit command logs remain in `/tmp/xpenses-astra-audit/` and `/tmp/xpenses-astra-audit/current/` on this machine (temporary, not promised durable). The durable outcomes and diagnostic excerpts are recorded below. Generated Gradle and Playwright artifacts may be overwritten by subsequent runs. No application source change was made to unblock a check.

## Exact verification commands and outcomes

Commands below start at repository root unless their `cd` says otherwise. Shell wrappers redirected stdout/stderr to the temporary directories and recorded child exit codes; PASS/FAIL is the underlying command, not the wrapper's final echo.

| Exact command | Initial baseline | Reconciled HEAD | Meaning / diagnostic |
|---|---|---|---|
| `cd frontend && npm run lint` | **FAIL**, exit 1: 490 errors | **PASS**, exit 0 | Initial errors were generated JS under existing `playwright-report/trace`, not 490 application bugs. Later report generation changed ignored/untracked artifacts. Config still does not lint TSX; see explicit probe below. |
| `cd frontend && npm run i18n:check` | **PASS**, 851 keys in both locales | **PASS**, 851 keys | Parity does not prove used keys exist or no hardcoded English. |
| `cd frontend && npx tsc --noEmit --incremental false` | **PASS** | **PASS** | Incremental disabled to avoid modifying tracked TS build info. |
| `cd frontend && npm run build` | **PASS** | **PASS** | Current build includes new `/expenses/[id]`. Both warn middleware convention is deprecated; compilation does not validate route action contracts or rendered financial artifacts. |
| `cd frontend && PLAYWRIGHT_PORT=3107 PLAYWRIGHT_AUTHENTICATED_UI=false npm run test:e2e:mobile -- --workers=2` | **PASS**, 2 passed / 16 skipped | **PASS**, 2 passed / 16 skipped | Only mocked public login accessibility/overflow, one Chromium and one WebKit at 412×849. **Not authenticated mobile sign-off.** Service workers blocked by config. |
| `cd backend-kotlin-jpa && ./gradlew test --no-daemon` | **FAIL**, 213 tests, 2 failed | **PASS but UP-TO-DATE**, no fresh tests | Baseline `ExpenseControllerTest`: own-expense list and soft-delete/list behavior expected HTTP 200 but got 500. External work changed repository query/tests afterward. No root-cause fix by this audit. Cached success was not accepted as sufficient. |
| `cd backend-kotlin-jpa && ./gradlew test --rerun-tasks --no-daemon` | Not run | **PASS, fresh**, 223 tests, 0 failures/errors/skips | All five Gradle actionable tasks executed. XML totals summed from `build/test-results/test/TEST-*.xml`. 1m41s; RedisRateLimitStore nullable-Elvis compiler warning remains. This is strongest suite evidence, not closure of untested findings. |
| `docker compose config --quiet` | **PASS** | **PASS** | Quiet validation deliberately avoids printing expanded secret values. Valid YAML/interpolation is not startup, secure deployment or healthy dependencies. |
| `cd frontend && npx eslint app/login/page.tsx` | Not run | Exit 0 **but coverage probe fails its intent** | Exact warning: `File ignored because no matching configuration was supplied`. FE-012/OPS-009 confirmed. |
| `bash -n scripts/backup-db.sh` | **PASS** | Script unchanged | Shell syntax only; no backup or restoration executed. |
| `node --test scripts/check-i18n-parity.test.mjs` | **PASS**, one Node test file | Script unchanged | Internal assertions: parity pass, missing key fail/report, real catalogs pass. |

An initial parallel logging wrapper for i18n/types failed to open its output directory **before executing either command**. Both were rerun successfully after directory creation. This was harness setup, not an application failure.

### Read-only diagnostic commands

- `java -version`, `node --version`, `npm --version`: versions above.
- `git status --short`, `git rev-parse HEAD`, `git log -7 --oneline`, `git diff --stat 87bec5a15457c3c74ebec613f2459ac1306093a5 HEAD`: identified external source changes; no reset/revert/commit performed by this audit.
- `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` and `ss -ltnp | grep -E ':(3001|3000|8080|8001|3107)\b'`: existing application containers healthy, initial frontend/backend all-interface binding; chose an unused test port.
- `docker inspect xpenses-backend xpenses-frontend xpenses-db xpenses-redis --format '{{.Name}} logging={{json .HostConfig.LogConfig}} memory={{.HostConfig.Memory}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}'`: all use json-file with empty log options; limits respectively 2 GiB, 1 GiB, 1 GiB, and unlimited Redis. No env/secret inspection.
- `git log -1 --format='%h %s' -- docs/agy/audit/3.8/05-deployment-ops-audit.md`: commit `e2b3f44` establishes tracked disclosure provenance (SEC-013). No values copied into this report.
- `npx --yes ctx7@latest library nextjs 'Next.js 16 NEXT_PUBLIC environment variables build time inlining rewrites Docker runtime environment'`: PASS, resolved `/websites/nextjs`.
- `npx --yes ctx7@latest docs /websites/nextjs 'NEXT_PUBLIC environment variables replaced at build time Docker images runtime rewrites environment variables next config'`: PASS, primary Next environment-variable docs. Confirms public build-time inlining; browser client here correctly uses `/api`.

Browser diagnostics also reported missing next-intl default `timeZone`, service-worker registration blocked by Playwright and logo LCP loading advice. These are warnings, not failed visual measurements. Repository inspections used `find`, `rg`, file reads and targeted diffs; they are not execution of application behavior.

## Test inventory and what the green suite does not prove

### Backend

`backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/` contains:

- `ContextLoadsTest`, `IntegrationTestBase`, `TestAuthHelper`.
- Controllers: `AdvanceControllerTest`, `AuthControllerTest`, `BulkExpenseControllerTest`, `CategoryControllerTest`, `DashboardControllerTest`, `ExpenseControllerTest`, `FxControllerTest`, `FxMarginsControllerTest`, `InsuranceControllerTest`, `MileageControllerTest`, `ReviewQueueControllerTest`, `SignatureControllerTest`, `UserControllerTest`.
- Ingestion: `ImapMessageKeyTest`, new `ImapIngestionLedgerTest`; migrations: `HistoricalFxMigrationRegressionTest`; OCR: `AsyncOcrTest`; lifecycle: `report/ReportStateMachineTest`, `report/lifecycle/ExpenseReportLifecycleTest`; repository: `OcrResultCacheRepositoryTest`.
- Security: `InMemoryRateLimitStoreTest`, `RateLimitingFilterTest`; services: authorization, Expense/Fx/MileageCalculation/Ocr/Pdf/Storage; `services/fx/FxRateProviderTest`; storage LocalStorageProvider/StoragePathResolver tests.

Many tests instantiate services directly or use mocked integrations; `@Transactional` test wrappers do not prove independent transaction races, Spring self-invocation propagation, provider deadlines or restart recovery. Existing PDF tests with empty mileage cannot detect BE-001. Added ledger tests do not exercise the full mail/report/SEEN crash window. Redis outages, legacy-key migration and actual storage fault outcomes need focused integration tests.

### Frontend

`frontend/tests/` has admin specs (email, IMAP, LDAP, OCR, receipts, settings, storage, users), auth guards/login, dashboard, expense list/FX, sidebar, offline queue, advances/approvals/bulk approvals/categories/i18n/insurance/payments/profile/signature, report create/detail/list and responsive overflow/screenshots, plus shared mocks. The mobile npm command selects **only `mobile-ui.spec.ts`**, not this complete inventory. Existing snapshots are historical, not freshly validated.

## Required verification matrix

| Gate | Deterministic scenario and expected result | Findings |
|---|---|---|
| Key incident response | Synthetic old/new key migration; old access/refresh rejected; encrypted settings readable after planned rotation; redacted history/artifact scan | SEC-013, OPS-004 |
| Financial parity | Nonzero expense + mileage + allowance − paid advance; exact API/PDF/Excel/dashboard parity; change global rates after approval/payment without changing history | BE-001/002/003/008/010/011 |
| Request atomicity | Commit create then lose response; fail each receipt attachment; concurrent tabs; report attach rejection; one operation produces one recoverable record | FE-001/003, BE-009 |
| Shared-device privacy | A queues receipt, logout, B login, switch identity mid-replay; automatic expiry; installed old SW upgrade; neither records nor counts/private payloads cross identity | SEC-002/003, FE-005 |
| Auth | Real expired JWT + valid refresh; invalid refresh; permission-denied 403 must not refresh; 60+ minutes polling; parallel tabs; offline foreground | SEC-004/007/008/011, FE-005 |
| File safety | Malicious content/extension/MIME combinations, cross-owner IDs, traversal/symlink, size boundary; new detail receipt download matches backend route; no mutation from preview button | SEC-001, FE-004, MUX-001 |
| Worker durability | Kill after report save/before ledger completion; SEEN failure after success; stale claim takeover; restart with accepted OCR job; never duplicate or strand evidence | BE-004/005/006, SEC-006 |
| Abuse | Bulk 20 files vs one-file request counts provider work equivalently; invalid magic never invokes OCR; Redis outage/expiry; caller budget enforced consistently | SEC-005, OPS-005 |
| Browser flows | Login/logout; dashboard; list/filter/back; manual/camera create/edit; OCR cancel/error; report create/detail/submit/reject/approve/pay; signature; role-gated admin | MUX and FE findings |
| Operations | Isolated prod boot/migration + authenticated read; DB/Redis outage readiness; backup/restore receipt hashes; log rotation and alerts; image promotion | OPS-001–010 |

### Mandatory mobile matrix

Run Chromium and WebKit at **360, 390, 412 and 430 CSS px**, EN and RO, light and dark, with populated/empty/loading/error/offline states and technician/manager/finance/mod fixtures. For all important routes listed in `01-mobile-ios-android-ux-audit.md`:

- Assert document overflow absent, controls ≥44×44, no overlap/occlusion, headings/labels/names, keyboard focus and modal background inert.
- Run axe serious/critical gates and explicit contrast/forced reduced-motion checks; assert no raw missing translation keys.
- Use actual iPhone Safari and Android Chrome for soft keyboards, decimal/date input, camera/HEIC, permissions, file-picker return, browser back gestures, rotation, safe areas, address-bar resize and installed-PWA offline resume.
- Use VoiceOver and TalkBack for error/loading/toast announcements and evidence review. Emulated WebKit/Chromium is not device certification.
- Capture new screenshots/traces with synthetic records only; redact receipt and identity data in artifacts.

## Owner commands to run after implementing missing fixtures/gates

```bash
cd frontend
npx tsc --noEmit --incremental false
npm run lint
npm run i18n:check
npm run build
# Only with an isolated backend and disposable fixture users, not the deployed stack:
PLAYWRIGHT_PORT=3107 PLAYWRIGHT_AUTHENTICATED_UI=true npm run test:e2e:mobile
npm run test:e2e
cd ../backend-kotlin-jpa
./gradlew test --rerun-tasks --no-daemon
./gradlew bootJar --no-daemon
cd ..
docker compose config --quiet
```

The existing Playwright config does not expose a ready-made four-width matrix and still blocks service workers; add dedicated projects before claiming those checks. CI Compose smoke needs unique project names, no fixed container-name/port collisions, temporary env/storage, stub providers and guaranteed teardown. Do not run `compose up/down` against this host's existing stack for an audit smoke test.

## Not verified

Authenticated browser workflows, all required widths beyond public 412 login, real devices, fresh screenshots, VoiceOver/TalkBack, actual installed SW migration, shared-account mid-flight replay, export/PDF visuals, two-transaction races, crash recovery, real OCR/S3/IMAP/LDAP transport, deployed TLS/proxy/IAM, exposed-secret validity, full-history/dependency/container scans, clean Docker image builds/startup, Kubernetes operation, production migration history, backup integrity and restore/RPO/RTO. Their acceptance scenarios above are explicit release work, not implied passes.
