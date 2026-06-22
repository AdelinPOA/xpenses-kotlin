> Source: `audit-consolidated.md` (verified 2026-06-22). Each task is tagged with its finding ID.
> References (do NOT duplicate): `production-readiness-hardening`, `performance-query-optimization`,
> `fix-codebase-bugs-and-debt`, `code-quality-gaps-round-2`.

## 1. Sprint 1 — Security & Ops Quick Wins

- [ ] 1.1 **C2** — Add catch-all `@ExceptionHandler(Exception::class)` to `ValidationExceptionHandler.kt` returning `500` with a generic message + `correlation_id`; log full exception at error level under the same id (keep existing specific handlers taking precedence)
- [ ] 1.2 **C4** — Harden CSRF in `SecurityConfig.kt:35`: set cookies `SameSite=Strict` and add server-side `Origin`/`Referer` verification for state-changing methods (or wire `CookieCsrfTokenRepository`); leave safe methods unaffected
- [ ] 1.3 **C11** — Sanitize upload filename in `InsuranceController.kt:104`: derive storage key from `File(originalName).name`; strip `/`, `\`, `..`, absolute prefixes
- [ ] 1.4 **H2** — Confine served path in `SignatureController.kt:31-48`: validate resolved absolute path is within the signatures base dir before `File(path)`; store filename only, not absolute path
- [ ] 1.5 **C12** — Move Gemini key from URL query param to `x-goog-api-key` header in `EmailImportService.kt:274` (mirror the already-fixed `OcrService.kt`)
- [ ] 1.6 **C6 / H11** — Add `.dockerignore` to all 4 build contexts (`backend-kotlin-jpa/`, `frontend/`, `mineru/`, `ocr-sidecar/`) excluding `node_modules/`, `.gradle/`, `build/`, `.next/`, `.turbo/`, `.env*`, `*.md`
- [ ] 1.7 **C7** — Add `JWT_SECRET` from a `secretKeyRef` in `backend-kotlin-jpa/deployment.yaml:51-62`
- [ ] 1.8 **C8** — In `deployment.yaml:37-50`, add a `startupProbe` (`initialDelaySeconds: 30`) and raise readiness `initialDelaySeconds` to ≥45
- [ ] 1.9 **C9** — Create `docker-compose.prod.yml` override setting `COOKIE_SECURE=true` (keep dev default `false`)
- [ ] 1.10 **H10** — Use `docker/build-push-action@v6` with `cache-from`/`cache-to` (GitHub Actions cache) in `.github/workflows/ci.yml:90-92`
- [ ] 1.11 **H13** — Remove the hardcoded `dns: [8.8.8.8, 1.1.1.1]` block from `docker-compose.yml:34-36`
- [ ] 1.12 **H29** — Replace hardcoded `xpenses`/`xpenses` DB creds in `docker-compose.yml:7,39-40` with `${POSTGRES_USER}`/`${POSTGRES_PASSWORD}` env refs
- [ ] 1.13 **H30** — Add `depends_on: backend: condition: service_healthy` + `restart: unless-stopped` to the frontend service (`docker-compose.yml:64-89`)
- [ ] 1.14 **H31** — Add `logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }` to all compose services
- [ ] 1.15 **H34** — Point MinerU healthcheck at `/health` instead of `/docs` (`docker-compose.yml:128`)
- [ ] 1.16 **H35** — Replace frontend healthcheck `wget` with `node -e "require('http').get(...)"` (`docker-compose.yml:82`)
- [ ] 1.17 **H41** — Add a rate-limit filter for `POST /api/auth/change-password` (`application.yml:56-80`)
- [ ] 1.18 **H40** — Add a `Content-Security-Policy` header via `SecurityConfig.kt:33`
- [ ] 1.19 **L1** — Replace `System.err.println("!!!!! EXCEPTION: ...")` with a logger in `ReportController.kt:492`
- [ ] 1.20 **L2** — Add `@Repository` to `OcrJobRepository` (`Repositories.kt:225`)
- [ ] 1.21 **L5** — Fix OCR status URL to `/api/ocr/status/{id}` in `OcrController.kt:84`
- [ ] 1.22 **Verify Sprint 1**: CI green; `make test-health`; forged cross-site POST → 403; insurance upload with `../` payload confined; unmapped exception → sanitized 500 with correlation id

## 2. Sprint 2 — Data Integrity & Performance

- [ ] 2.1 **C5** — Create `V17` migration: `ALTER TABLE ... ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC'` for all V13 soft-delete tables
- [ ] 2.2 **H8** — In `V17`: `CREATE INDEX IF NOT EXISTS idx_inventory_items_request_id ON inventory_items(request_id)`
- [ ] 2.3 **M14** — In `V17`: add `CHECK (amount_before_tax >= 0)` and `CHECK (amount_eur >= 0)` on `mileage_records`
- [ ] 2.4 **M7** — In `V17`: add `deleted boolean default false` + `deleted_at timestamptz` to `mileage_records`; add `@SQLDelete` + `@SQLRestriction("deleted = false")` to `MileageRecord` entity (`Models.kt:392-442`)
- [ ] 2.5 **H9** — In `V17`: add `version` column to `expenses` and `receipts`; add `@Version` to both entities and include `AND version = ?` in their `@SQLDelete` (`Models.kt:181,257`)
- [ ] 2.6 **M12** — Change `AdvancePayment.status` default to `"requested"` (`Models.kt:363`); add the data-fix/default in `V17`
- [ ] 2.7 **H3** — Replace `CompletableFuture.runAsync { ... }` with `runAsync(runnable, ocrTaskExecutor)` in `OcrService.kt:391-425`
- [ ] 2.8 **H4** — Add `@Transactional(readOnly = true)` (or JOIN FETCH) to `getReceiptCompat` (`ExpenseController.kt:304-339`)
- [ ] 2.9 **H6** — Verify `comp.expense.user == currentUser` before linking `OcrComparison` in `ExpenseService.kt:82-88`
- [ ] 2.10 **M1** — Make report-state + approver-notification atomic via `@TransactionalEventListener(AFTER_COMMIT)` (or outbox) and replace `userRepository.findAll()` approver scan with a role-scoped query (`ReportService.kt:125-141`)
- [ ] 2.11 **M2** — Build the request principal from JWT claims in `JwtAuthenticationFilter.kt:31`; drop the unconditional `userRepository.findById(...)` per request; load full `User` only where a controller needs it
- [ ] 2.12 **M9** — Remove dead `processAllReportsEagerly()` (`ReportService.kt:34-43`)
- [ ] 2.13 **M3 / M4** — *Extends `performance-query-optimization`*: push the remaining in-memory sorts (`ReportController:84`, `DashboardController:88`, `UserController:66`, `AdvanceController:56`) to DB `ORDER BY`, and batch the N+1 per-row saves in `ReportService.kt:99-280`
- [ ] 2.14 **Verify Sprint 2**: `V17` applies and Hibernate `validate` passes on startup; concurrent soft-delete of one expense → one success + one optimistic-lock failure; authenticated request issues no per-request user `findById`; rolled-back submission sends no notification

## 3. Sprint 3 — Memory Safety & Structural Refactor

- [ ] 3.1 **C1** — *Extends `performance-query-optimization`*: push privileged dashboard aggregation to SQL (`COUNT`/`SUM`/`GROUP BY`) in `DashboardController.kt:38-42,53-57`; add DB-level pagination to report listing in `ReportController.kt:70-100` (replace `findAll()` + in-memory slice)
- [ ] 3.2 **H5 / L12** — **BREAKING**: migrate all monetary entity fields from `Double` to `BigDecimal` with `@Column(precision=..., scale=2)` (`Models.kt:108,202,204,207,211,346,352,415-427`); retype DB columns `DOUBLE PRECISION`→`NUMERIC` in the `V17` series; convert FX/total/allowance arithmetic to `BigDecimal` + `RoundingMode`; ship as an isolated, revertible commit behind precision tests
- [ ] 3.3 **H14** — Split `Models.kt` (671 lines) by domain into `User.kt`, `Expense.kt`, `Report.kt`, `Category.kt`, etc.
- [ ] 3.4 **H15** — Extract `AdvanceService`, `MileageService`, `DashboardService`, `InventoryService`, `InsuranceService`; make controllers thin (resolve user, deserialize, delegate, map)
- [ ] 3.5 **M10** — Move the duplicated `calculateDailyAllowance()` (`ReportController.kt:481-495`, `PdfService.kt:635-647`) into the service layer as one shared method
- [ ] 3.6 **H16** — Set `spring.jpa.open-in-view: false` in `application.yml` *after* all lazy-load sites are fixed (H4 + performance-query JOIN FETCH); run the controller test set to confirm no `LazyInitializationException`
- [ ] 3.7 **H1** — Add stable id-based (or business-key) `equals()`/`hashCode()` to all JPA entities (`Models.kt`)
- [ ] 3.8 **H36** — Create `gradle/libs.versions.toml` version catalog; migrate inlined versions from `build.gradle.kts`
- [ ] 3.9 **H17** — Add ktlint or detekt plugin + a CI step in `.github/workflows/ci.yml`
- [ ] 3.10 **Verify Sprint 3**: monetary round-trip `0.1 + 0.2 == 0.3`; report totals exact; OSIV off with no lazy-init errors; dashboard/report list no longer call `findAll()`; ktlint/detekt passes in CI

## 4. Sprint 4 — Frontend Quality & Test Coverage

### 4a. Frontend quality
- [ ] 4.1 **H18** — Remove `"react-hooks/exhaustive-deps": "off"` (`eslint.config.mjs:22`); fix the ~5 real dependency arrays
- [ ] 4.2 **H19** — Replace plain `"Loading..."` text with skeleton components on the 7 listed pages (`categories`, `expenses` client, expense edit, advances, mileage, report edit)
- [ ] 4.3 **H20** — Extract `formatEur`/`formatAmount` to `lib/format.ts`; replace the ~12 duplicated definitions
- [ ] 4.4 **H21** — Broaden the static-asset allowlist in `middleware.ts:6` to include `.jpg/.jpeg/.svg/.webp/.ico/.css/.js/.gif`
- [ ] 4.5 **H22** — Store the toast `setTimeout` handle and clear it on unmount (`ToastProvider.tsx:38`)
- [ ] 4.6 **H23 / M23** — Split `ExpenseForm.tsx` (706 lines) into sub-components (OCR, receipt preview, classifier, fields); migrate to `react-hook-form`
- [ ] 4.7 **H24** — Replace `catch (e: any)` with `unknown` + narrowing and fix `zodResolver as any` (`ExpenseForm.tsx` ×3, `storage/page.tsx` ×2)
- [ ] 4.8 **H25** — Replace `!!` force-unwraps (53× across 9 controllers; e.g. `currentUser!!`, `f.id!!`) with `?: throw ResponseStatusException(...)`
- [ ] 4.9 **H26** — Move `userKeys`/`profileKeys` (and any remaining inlined keys) into `lib/queryKeys.ts`
- [ ] 4.10 **H27** — Unify auth-guard handling on the redirect pattern across the inconsistent pages
- [ ] 4.11 **M15** — Add RSC prefetch (`serverFetch` + `dehydrate` + `HydrationBoundary`) to `app/reports/page.tsx`
- [ ] 4.12 **M16** — Extract shared `TextField`/`inputCls`, `ConfirmDialog` (delete modals), `ExportMenu` components
- [ ] 4.13 **M17** — Migrate `profile/[id]` from `useParams()` to the `use()` param pattern
- [ ] 4.14 **M18** — Append `?redirect_to=${pathname}` on the login redirect (`middleware.ts:13`)
- [ ] 4.15 **M19** — Introduce a consistent error-response DTO; align controllers that return `mapOf("detail" ...)` vs `ResponseStatusException`
- [ ] 4.16 **M20** — Unify (or document) the `@Transactional` vs `TransactionTemplate.execute{}` pattern across controllers
- [ ] 4.17 **M28/README** — Fix the two README inaccuracies: state-machine diagram (expenses stay attached on reject; add `rejected → draft` recall) and the "comprehensive test suite" overstatement

### 4b. Backend test coverage
- [ ] 4.18 Add MockMvc integration tests (success path + auth guard) for `ReportController`, `AppSettingsController`, `OcrController`, `MileageController`, `InventoryController`, `InsuranceController`, `SignatureController`, `LdapSettingsController`, `CategoryController`, `HealthController`
- [ ] 4.19 **FxServiceTest** — Stub/mock the outbound HTTP call so the test runs offline (`FxServiceTest.kt:54-66`)
- [ ] 4.20 **L26** — Add `application-test.yml` aligned with `@ActiveProfiles("test")`
- [ ] 4.21 **L25** — Add the missing `mod1` check (`ContextLoadsTest.kt:8-13`)
- [ ] 4.22 **Verify Sprint 4**: `tsc --noEmit` + `npm run lint` clean (exhaustive-deps on); each of the 10 controllers has a passing test; suite runs with no live external HTTP

## 5. LOW Cleanup Batch (L3–L24)

- [ ] 5.1 **L3** — Dedupe `AdvancePaymentOut`/`MileageRecordOut` DTO mapping across `AdvanceController.kt:355-378`, `ReportController.kt:431-476`
- [ ] 5.2 **L4** — Remove the manual password-length check that duplicates `@Size(min=8)` (`AuthController.kt:179`)
- [ ] 5.3 **L6** — Make `ImapConfigIn.imapPass` a `val` (`AppSettingsController.kt:525-532`)
- [ ] 5.4 **L7** — Make the email "test" button not send a real email to the recipient (`EmailSettingsService.kt:109`)
- [ ] 5.5 **L8** — Add `@Column` to `app_settings.key` (SQL reserved word) (`Models.kt:566`)
- [ ] 5.6 **L9** — Align `insurance_files.file_path` length: entity vs `VARCHAR(500)` (`Models.kt:545-546`)
- [ ] 5.7 **L10** — Add length constraint to `ocr_comparisons.sha256` entity to match `VARCHAR(64)` (`Models.kt:635`)
- [ ] 5.8 **L11** — Fix CHECK constraint name mismatch `chk_advances_*` on `advance_payments` (`V5__data_integrity_constraints.sql`)
- [ ] 5.9 **L13** — Guard null `startTime`/`endTime` before `.isBefore()` (`MileageController.kt:76-78`)
- [ ] 5.10 **L14** — Add `start_period` to OCR sidecar healthcheck (`docker-compose.yml:150-154`)
- [ ] 5.11 **L15** — Remove unused `lib/themes.ts` (never imported)
- [ ] 5.12 **L16** — Add a `useDebounce` hook for search inputs
- [ ] 5.13 **L17** — Remove unused imports (`BigDecimal`, `RoundingMode`) from `ExpenseController.kt`, `ReportController.kt` (after H5)
- [ ] 5.14 **L18** — Standardize inline DTO mappers into dedicated mappers
- [ ] 5.15 **L19** — Fix frontend Dockerfile lockfile glob `package-lock.json*` (`frontend/Dockerfile:4`)
- [ ] 5.16 **L20** — Fix stale `make docker-build` reference in Makefile error message (`Makefile:21`)
- [ ] 5.17 **L21** — Add a `test-frontend` Makefile target
- [ ] 5.18 **L22** — Pin `apk add curl su-exec` versions (`backend-kotlin-jpa/Dockerfile:29`)
- [ ] 5.19 **L23** — Add `mineru/` artifacts, `.env.local`, `.env.production` to root `.gitignore`
- [ ] 5.20 **L24** — Replace `javax.cache:cache-api:1.1.1` with `jakarta.cache` for Spring Boot 3.x (`build.gradle.kts:39`)
- [ ] 5.21 **M8** — Reassign "Hotel stay (Motel One)" from `foodCategory` to an accommodation category (`DataInitializer.kt:120-127`)
- [ ] 5.22 **M27** — Align K8s probes (`/actuator/health/*`) and compose healthcheck (`/api/health`) on one pattern
- [ ] 5.23 **M24/M25/M26** — Add `SPRING_PROFILES_ACTIVE`, `IMAP_POLL_INTERVAL`, `LOGGING_LEVEL_ROOT=INFO` to `.env.example`
- [ ] 5.24 **M6** — Separate transactional logic from async execution in `AsyncOcrService.kt:20-21` (`@Transactional` + `@Async` on the same method)
- [ ] 5.25 **M11** — Generate a per-deployment random PBKDF2 salt instead of the hardcoded `"xpenses-jwt-salt"` (`JwtTokenProvider.kt:33`); store in config

## 6. Deferred / No-Fix (document only — do NOT implement)

- [ ] 6.1 **C3** (file ops before transaction) — by design (S66); add/keep a note in code/docs explaining the accepted orphan risk
- [ ] 6.2 **H12** (hot-swap mounts may fail silently) — by design (S64); ensure README documents running `make build` before `make up`
- [ ] 6.3 **M5** (login invalidates other sessions) — by design; documented
- [ ] 6.4 **H7** (V8 `DATE`→`VARCHAR` irreversible) — cannot fix without data loss; document as irreversible; optionally add a CHECK on existing data
- [ ] 6.5 **M13** (`orphanRemoval` + `@SQLDelete`) — non-issue on Hibernate 6.6.13; documented, no change
