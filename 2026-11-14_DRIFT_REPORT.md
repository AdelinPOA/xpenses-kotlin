## README.md

- `README.md:217` (`## System Verification`) omits `python3 -m unittest scripts/test_verify_ocr_restart.py` (`scripts/test_verify_ocr_restart.py`) from the `- Run (Scripts unit tests):` command list, listing only the Node test suites (`scripts/check-i18n-parity.test.mjs`, `scripts/check-npm-audit.test.mjs`).

## backend-kotlin-jpa/README.md

- `backend-kotlin-jpa/README.md:4` enumerates build/packaging files (`build.gradle.kts`, `settings.gradle.kts`, `Dockerfile`, `Dockerfile.native`, `deployment.yaml`) but omits `backend-kotlin-jpa/gradle.properties` (which configures `org.gradle.caching=true`, `org.gradle.configuration-cache=true`, `org.gradle.daemon=false`, `org.gradle.workers.max=2`, `org.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m`, and `kotlin.compiler.execution.strategy=in-process`) and the Gradle wrapper (`backend-kotlin-jpa/gradlew`, `backend-kotlin-jpa/gradle/wrapper/gradle-wrapper.properties`).

## backend-kotlin-jpa/src/README.md

No drift detected.

## backend-kotlin-jpa/src/main/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/README.md

- **403 response format mismatch**: README Side Effects claims `[SecurityConfig.kt:filterChain]` & `[SecurityConfig.kt:csrfOriginRefererFilter]` "writes HTTP `401`/`403` JSON error responses", whereas `SecurityConfig.kt:csrfOriginRefererFilter` rejects missing or disallowed origins via `response.sendError(HttpServletResponse.SC_FORBIDDEN, ...)` (container error forwarding to `/error`), not a JSON body (only `AuthenticationEntryPoint` in `SecurityConfig.kt:filterChain` writes `{"detail":"Unauthorized"}` with `application/json;charset=UTF-8`).
- **Demo seeding guard detail**: README Invariants claims `[DataInitializer.kt:run]` seeds sample `ExpenseReport`/`Expense` rows only when `seed.demo.users=true` and "target tables are empty", whereas `DataInitializer.kt:run` checks `seedDemoUsers && expenseReportRepository.count() == 0L` (plus `tech1 != null`) and does not check `expenseRepository.count() == 0L`.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/README.md

- **Category delete behavior mismatch**: README Side Effects claims `[CategoryController.kt:CategoryController]` (grouped with financial controllers) "Persist and delete financial entities, reports, advances, mileage records, and categories in PostgreSQL", whereas `CategoryController.kt:deactivateCategory` (`DELETE /api/categories/{categoryId}`) only soft-deactivates categories (`category.isActive = false`) and never deletes rows from PostgreSQL (nor does it call `fxService` or `notificationAdapter`).
- **Advance request `type` vs `status` conflation**: README Invariants claims `[AdvanceController.kt:createAdvance]` validates "advance type/status (`requested`/`paid`)", whereas `AdvanceController.kt:createAdvance` validates request `body.type` against `listOf("request", "paid")` (setting `status = "requested"` only when `body.type == "request"`).
- **Omitted endpoint invariants and side effects**:
  - `BulkExpenseController.kt:bulkUploadExpenses` also enforces a maximum of 20 files per request (`400`) and a 200-character limit on bulk `Idempotency-Key` (`400`).
  - `OcrController.kt:scanReceipt` rejects `sync && (acceptanceKey != null || reportId != null)` (`400`), returns `503` when `!config.ocrEnabled` or source storage fails, and validates `reportId` ownership (`403`) and `"draft"` status (`400`); `OcrController.kt:cancelJob` returns `409 Conflict` when `!ocrJobPipeline.cancel(...)`.
  - `AuthController.kt:changePassword` also increments `currentUser.tokenVersion` and calls `refreshTokenRepository.deleteByUserId`, whereas `UserController.kt:updateActive` deletes refresh tokens on deactivation without incrementing `User.tokenVersion`; `ReportController.kt:bulkStatus` requires a non-blank `reason` for `"reject"` (`400`), unlike `ReportController.kt:rejectReport`; `UserController.kt:updateRole` and `UserController.kt:updateActive` forbid self-modification (`400`).
  - `ExpenseController.kt:getReceiptCompat` also sets `SafeMediaType.safeDisposition` and `X-Content-Type-Options: nosniff`, and `InsuranceController.kt:downloadFile` passes `forceAttachment = true` to `SafeMediaType.safeDisposition`.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/auth/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/dashboard/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/expense/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/ocr/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/search/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/settings/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/user/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ingestion/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/README.md

- `ExpenseReportLifecycle.kt:ExpenseReportLifecycle.attach` (`attachDraftExpenses`): The README states expenses must have "no existing report attachment", whereas the code only rejects expenses attached to a *different* report (`expense.report?.id != null && expense.report?.id != report.id`), allowing re-attachment to the same report.
- `ExpenseReportLifecycle.kt:ExpenseReportLifecycle.sign`: The README states `actor.signaturePath` must be "non-blank", whereas the code checks `actor.signaturePath.isNullOrEmpty()`.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/review/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/README.md

- **Over-broad CAS lease-fencing claim**: README Invariants groups `claimEligible`, `completeOcrStage`, `completeExpenseStage`, `completeReceiptStage`, `completeClaimedStage`, `recordPermanentFailure`, `recordTransientFailure`, and `reclaimExpired` together as requiring "matching `stage`, `status = 'PROCESSING'`, `lease_token = :leaseToken`, and `lease_until > :now` (or `lease_until <= :now` for `reclaimExpired`)". In `OcrJobRepository.kt`:
  - `OcrJobRepository.kt:claimEligible` does **not** require `status = 'PROCESSING'`, `lease_token`, or `lease_until > :now`; it claims `stage = :stage` rows in `status = 'PENDING'` or due `status = 'RETRY_WAIT'`.
  - `OcrJobRepository.kt:recordPermanentFailure` and `OcrJobRepository.kt:recordTransientFailure` do **not** filter by `stage` in their `WHERE` clauses.
  - `OcrJobRepository.kt:completeClaimedStage` checks `stage IN ('OCR', 'EXPENSE', 'RECEIPT')` rather than a specific stage parameter.
  - `OcrJobRepository.kt:reclaimExpired` does **not** check `lease_token = :leaseToken` (it replaces an expired lease where `lease_until IS NOT NULL AND lease_until <= :now`).

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/README.md

- **`/api/reports/export` rate-limit mismatch**: README Invariants claims `[RateLimitingFilter.kt:RateLimitingFilter]` enforces a per-IP limit of `15` on `/api/reports/export` as well as `^/api/reports/\d+/(pdf|receipts-zip)$`. In `RateLimitingFilter.kt:limits` and `RateLimitingFilter.kt:doFilterInternal`, `"/api/reports/export"` is **not** in `limits` and is not matched against incoming request paths; it is only used as the synthetic `matchedLimitKey` (`rl:/api/reports/export:$clientIp`) for paths matching `EXPORT_REPORT_PATH` (`^/api/reports/\d+/(pdf|receipts-zip)$`), so `/api/reports/export` itself is not rate-limited.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/README.md

- `AppSettingsService.kt:AppSettingsService.updateStorageSettings`: Public `@Transactional` method `updateStorageSettings(body: StorageConfigDto, migrateExisting: Boolean)` (which restores stored secrets, saves storage config, and conditionally starts migration) is omitted from the `AppSettingsService` interface summary.
- `AppSettingsService.kt:AppSettingsService.getMileageRates` / `updateMileageRates`: The Side Effects `app_settings` key list omits the 8 mileage rate/tax keys (`mileage_rate_before_tax`, `mileage_rate_after_tax`, `mileage_fuel_consumption_l_per_100km`, `mileage_fuel_price_ron_per_liter`, `mileage_pension_rate`, `mileage_health_rate`, `mileage_income_tax_rate`, `mileage_tax_deduction_eur`), and omits `PdfService.kt:calculateDailyAllowance` reading `daily_allowance_rate`.
- `ExpenseService.kt:ExpenseService.doCreateExpense`: Grouped under the invariant "mutations require `canMutate`, `status == \"draft\"`, and active categories", whereas `doCreateExpense` creates an expense for `currentUser` and checks `canMutate`/`status == "draft"` only on the target `report` when `body.reportId` is supplied (while `uploadReceipts` and `deleteSingleReceipt` enforce `canMutate` and `status == "draft"` on the expense, and `duplicateExpense` enforces `canMutate` without requiring `status == "draft"`).
- `IdempotentExpenseSaving.kt:IdempotentExpenseSaving.upload` / `ExpenseService.kt:ExpenseService.requireReceiptUploadAllowed`: Omitted from Interface/Invariants is the replay authorization invariant that `upload` calls `requireReceiptUploadAllowed(expenseId, user)` on every idempotent replay so cached receipt responses cannot bypass ownership/draft checks.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/README.md

No drift detected.

## backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/README.md

No drift detected.

## backend-kotlin-jpa/src/main/resources/README.md

- `backend-kotlin-jpa/src/main/resources/README.md:4-8` omits `backend-kotlin-jpa/src/main/resources/META-INF/native-image/reflect-config.json`, which defines GraalVM native-image reflection metadata for `eu.nt.xpenses.XpensesApplication__ApplicationContextInitializer`, `org.flywaydb.core.internal.publishing.PublishingConfigurationExtension`, and `io.jsonwebtoken.impl.*` classes.
- `backend-kotlin-jpa/src/main/resources/README.md:7` summarizes `application-ci.yml` overrides without noting `backend-kotlin-jpa/src/main/resources/application-ci.yml:10-12` (`spring.data.redis.url: ${REDIS_URL}` without a fallback default).

## backend-kotlin-jpa/src/main/resources/db/README.md

No drift detected.

## backend-kotlin-jpa/src/main/resources/db/migration/README.md

No drift detected.

## frontend/README.md

- Missing config coverage: `postcss.config.js` (`module.exports`, configuring `@tailwindcss/postcss`) exists in `frontend/` and is only listed as an ESLint ignore pattern under `eslint.config.mjs:eslintConfig` rather than documented in `## Interface`.
- Missing config coverage: `next.config.ts:nextConfig` sets `turbopack: { root: __dirname }`, which is omitted from `## Interface`.
- Doc-to-code mismatch: `## Side Effects` states `proxy.ts:proxy` "issues 307/302 redirects to `/login`", whereas `proxy.ts:proxy` calls `NextResponse.redirect(loginUrl)` without an explicit status (always HTTP 307, never 302).

## frontend/app/README.md

- Doc-to-code mismatch (`frontend/app/globals.css:@layer base`): The Invariants section states `@layer base` enforces `box-sizing: border-box`, whereas `* { box-sizing: border-box; }` is defined as an unlayered rule outside `@layer base` in `frontend/app/globals.css`.
- Missing code coverage (`frontend/app/globals.css:@media (orientation: landscape) and (max-height: 500px)`): The Invariants section only mentions unsticking `.expense-form-actions` for short landscape viewports, omitting the `.app-main` `padding-top` and `.receipt-capture` `padding` overrides in the same media query.

## frontend/app/admin/README.md

No drift detected.

## frontend/app/admin/email/README.md

No drift detected.

## frontend/app/admin/imap/README.md

- Missing code coverage (`frontend/app/admin/imap/page.tsx:ImapAdminPage`): Renders `<DelegationParsingSettings />` (`@/components/admin/DelegationParsingSettings`) at the top of the `/admin/imap` page, which is omitted from the README.

## frontend/app/admin/ldap/README.md

No drift detected.

## frontend/app/admin/ocr/README.md

No drift detected.

## frontend/app/admin/receipts/README.md

No drift detected.

## frontend/app/admin/settings/README.md

No drift detected.

## frontend/app/admin/storage/README.md

No drift detected.

## frontend/app/admin/users/README.md

No drift detected.

## frontend/app/advances/README.md

No drift detected.

## frontend/app/approvals/README.md

No drift detected.

## frontend/app/categories/README.md

No drift detected.

## frontend/app/dashboard/README.md

No drift detected.

## frontend/app/expenses/README.md

No drift detected.

## frontend/app/expenses/[id]/README.md

No drift detected.

## frontend/app/expenses/[id]/edit/README.md

No drift detected.

## frontend/app/expenses/capture/README.md

No drift detected.

## frontend/app/expenses/new/README.md

No drift detected.

## frontend/app/insurance/README.md

No drift detected.

## frontend/app/login/README.md

No drift detected.

## frontend/app/payments/README.md

No drift detected.

## frontend/app/profile/README.md

No drift detected.

## frontend/app/profile/[id]/README.md

- Doc-to-code mismatch: README states a "loading spinner renders while `(!isSelf && loadingUser) || loadingReports`", whereas `ProfileDetailClient.tsx:ProfileDetailClient` renders plain loading text (`{t("loading_profile")}`) in a `<div>` with no spinner element.

## frontend/app/profile/signature/README.md

No drift detected.

## frontend/app/reports/README.md

No drift detected.

## frontend/app/reports/[id]/README.md

No drift detected.

## frontend/app/reports/[id]/advances/README.md

- Doc-to-code mismatch / missing coverage: README states "pay/reject actions render only when `a.status === "requested" && canManage && payingId !== a.id`", but in `page.tsx:AdvancesPage` the `reject` action (`rejectAdvance`) is only rendered in the desktop table view and is omitted from the mobile stacked-card view (where only the `pay` button renders).

## frontend/app/reports/[id]/edit/README.md

No drift detected.

## frontend/app/reports/[id]/mileage/README.md

No drift detected.

## frontend/app/reports/new/README.md

No drift detected.

## frontend/app/search/README.md

No drift detected.

## frontend/components/README.md

No drift detected.

## frontend/components/admin/README.md

No drift detected.

## frontend/components/dashboard/README.md

No drift detected.

## frontend/components/expenses/README.md

No drift detected.

## frontend/components/layout/README.md

No drift detected.

## frontend/components/reports/README.md

No drift detected.

## frontend/components/signature/README.md

No drift detected.

## frontend/components/ui/README.md

No drift detected.

## frontend/i18n/README.md

No drift detected.

## frontend/lib/README.md

- Doc-to-code mismatch: `## Invariants` states `authSession.ts:classifyAuthEndpointFailure` classifies `/auth/me` 401 and `/auth/refresh` 401|403 as `"terminal"`, and network/408/425/429/>=500 as `"transient"`. In `authSession.ts:classifyAuthEndpointFailure`, the `408 | 425 | 429 | >= 500` check applies only to `/auth/me`; for `/auth/refresh`, any status other than `401` or `403` returns `"transient"`.
- Invariant nuance omitted: `## Invariants` groups `ocrSourceQueue.ts:enqueueOcrSource` under enforcing `MAX_QUEUE_SIZE` (20) without noting that `ocrSourceQueue.ts:enqueueOcrSource` enforces `items.length >= MAX_QUEUE_SIZE` globally across all users, whereas `ocrSourceQueue.ts:createRecoveredOcrReview` enforces `MAX_QUEUE_SIZE` per user (`items.filter((item) => item.userId === recovered.userId).length >= MAX_QUEUE_SIZE`).
- Missing behavior coverage: `reviewQueueActions.ts:useReviewQueueActions` (`handleError`) also calls `refreshReviewSurfaces()` to invalidate `reviewQueueKeys.all`, `dashboardKeys.manager()`, `dashboardKeys.all`, and `reportKeys.all` when a mutation fails, not only on success.
- Missing side effect coverage: `api.ts:api` response interceptor (`api.ts:api.interceptors.response`) mutates `error.response.data.detail = data.message ?? data.error` when `detail` is `undefined` or `null`, which is omitted from `frontend/lib/README.md`.

## frontend/lib/api/README.md

No drift detected.

## frontend/lib/types/README.md

- Missing field coverage: `## Interface` lists fields of `user.ts:User` (`id`, `username`, `display_name`, `email`, `role`, `is_active`, `auth_source`, `notifications_enabled`, `language`, timestamps) but omits `has_signature?: boolean` (`user.ts:User`).

## frontend/public/README.md

- Missing asset coverage: `## Interface` lists the `./offline/README.md` shell files as `(/offline/index.v9.html, /offline/workspace.v9.js, /offline/messages.v9.json)`, omitting `/offline/workspace.v9.css` (`public/offline/workspace.v9.css`, required in `sw.js:OFFLINE_ASSETS`).

## frontend/public/offline/README.md

- Doc-to-code mismatch: `## Interface` states `messages.v9.json:en` and `messages.v9.json:ro` contain `52` message keys; each dictionary actually contains `51` keys (`messages.v9.json:en`, `messages.v9.json:ro`).
- Missing file coverage: `workspace.v9.css` (`xpenses-offline-asset:v9` stylesheet in `frontend/public/offline/`) is omitted from `## Interface` (only referenced indirectly under `## Side Effects` as `[index.v9.html:workspace.v9.js]`).
- Missing fallback behavior: `## Invariants` states `workspace.v9.js:verifyCurrentOwner` requires `/api/auth/me` HTTP 2xx with `user.id === ownerId` when online before unlocking verified access, omitting that if `fetch` throws (`!navigator.onLine || error instanceof TypeError`), `workspace.v9.js:verifyCurrentOwner` clears `state.verifiedOwnerId = null` and falls back to `loadLocal(ownerId, false, generation)`.

## scripts/README.md

- `scripts/README.md:62` cites `[check-format-currency.mjs:console.log]` for writing results to stdout/stderr, whereas `scripts/check-format-currency.mjs:23,26` uses `console.error` on assertion failure and `console.log` on pass.
- `scripts/README.md:64` cites `[check-i18n-parity.mjs:console.error]` for status/diagnostics, whereas `scripts/check-i18n-parity.mjs:47` uses `console.log` on pass and `console.error` on mismatch/error.
- `scripts/README.md:66` cites `[check-npm-audit.mjs:console.error]` for pass/failure/error diagnostics, whereas `scripts/check-npm-audit.mjs:31` uses `console.log` on pass and `console.error` on failure/error.
- `scripts/README.md:78-80` (`## Verification`) omits `node scripts/check-format-currency.mjs` for running the currency formatting check script.
