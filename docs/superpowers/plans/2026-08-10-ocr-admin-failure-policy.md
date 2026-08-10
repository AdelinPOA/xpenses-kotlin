# Admin-configurable OCR failure policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators choose globally whether OCR failures create editable draft expenses or reject the receipt, while keeping the existing bulk-upload API contract.

**Architecture:** Extend the existing global `ocr_config` application setting with `failure_mode`. `OcrService` owns the OCR failure decision and returns a normalized intake outcome; `BulkExpenseController` remains an HTTP adapter that creates expenses and delegates receipt persistence. The existing admin OCR screen edits the new field, so no database migration or new settings endpoint is needed.

**Tech Stack:** Kotlin, Spring Boot, JUnit/Mockito, PostgreSQL `app_settings`, Next.js, TypeScript, React Hook Form, Zod, next-intl.

## Global Constraints

- Supported values are exactly `CREATE_DRAFT` and `REJECT_RECEIPT`.
- The default for missing or invalid configuration is `CREATE_DRAFT`.
- The setting is global and is stored in the existing `ocr_config` application setting.
- Existing successful OCR behavior and bulk-upload response shape remain unchanged.
- Rejected files produce per-file errors and do not create expenses or receipts.
- No new database migration is required.
- No production code is written before a corresponding test fails.

---

### Task 1: Add the OCR failure policy model and failing service tests

**Files:**
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- Test: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/OcrServiceTest.kt`

**Interfaces:**
- Produces `OcrFailureMode.CREATE_DRAFT` and `OcrFailureMode.REJECT_RECEIPT`.
- Produces `OcrScanOutcome` with the normalized OCR result, success flag, failure reason, and configured failure mode.
- Keeps `scanReceipt(fileBytes, filename): Map<String, Any?>` available for the existing synchronous OCR endpoint.

- [ ] **Step 1: Write failing tests for configuration defaults and normalization**

Add tests to `OcrServiceTest.kt` covering:

```kotlin
@Test
fun `missing failure mode defaults to create draft`() {
    val config = ocrService.getOcrConfig()
    assertEquals(OcrFailureMode.CREATE_DRAFT, config.failureMode)
}

@Test
fun `configured reject receipt mode is preserved`() {
    val setting = AppSetting(
        key = "ocr_config",
        value = """{"provider":"gemini-3.1-flash-lite","ocr_enabled":true,"gemini_api_key":"test-key","failure_mode":"REJECT_RECEIPT"}""",
        updatedAt = Instant.now()
    )
    `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))

    assertEquals(OcrFailureMode.REJECT_RECEIPT, ocrService.getOcrConfig().failureMode)
}

@Test
fun `invalid failure mode falls back to create draft`() {
    val setting = AppSetting(
        key = "ocr_config",
        value = """{"provider":"gemini-3.1-flash-lite","ocr_enabled":true,"gemini_api_key":"test-key","failure_mode":"INVALID"}""",
        updatedAt = Instant.now()
    )
    `when`(appSettingRepository.findById("ocr_config")).thenReturn(Optional.of(setting))

    assertEquals(OcrFailureMode.CREATE_DRAFT, ocrService.getOcrConfig().failureMode)
}
```

Add one test for a failed scan outcome in each mode. Stub the existing provider path to return the current error result and assert that the outcome says whether the caller may create a draft.

- [ ] **Step 2: Run the focused tests and verify they fail for the missing policy model**

Run:

```bash
cd backend-kotlin-jpa
./gradlew test --tests eu.nt.xpenses.services.OcrServiceTest
```

Expected: compilation/test failure because `failureMode`, `OcrFailureMode`, and `OcrScanOutcome` do not exist yet.

- [ ] **Step 3: Implement the minimal policy model**

In `OcrService.kt`:

```kotlin
enum class OcrFailureMode {
    CREATE_DRAFT,
    REJECT_RECEIPT
}

data class OcrScanOutcome(
    val result: Map<String, Any?>,
    val succeeded: Boolean,
    val failureReason: String?,
    val failureMode: OcrFailureMode
)
```

Extend `OCRConfig` with:

```kotlin
@JsonProperty("failure_mode")
var failureMode: OcrFailureMode = OcrFailureMode.CREATE_DRAFT
```

Normalize invalid values to `CREATE_DRAFT` when reading configuration. Preserve the existing encrypted API-key handling.

Add a method that calls the existing scan path and applies policy:

```kotlin
fun scanReceiptForExpense(fileBytes: ByteArray, filename: String): OcrScanOutcome
```

Treat a result with a non-null `amount` and no provider failure as successful. For failures, derive the message from `provider_error` or the first warning. Do not change the existing `scanReceipt` return map.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
cd backend-kotlin-jpa
./gradlew test --tests eu.nt.xpenses.services.OcrServiceTest
```

Expected: PASS.

- [ ] **Step 5: Commit the service model and tests**

```bash
git add backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/OcrServiceTest.kt
git commit -m "feat: model configurable OCR failure policy"
```

---

### Task 2: Make bulk upload consume the OCR outcome

**Files:**
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt`
- Create or modify: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/BulkExpenseControllerTest.kt`

**Interfaces:**
- Consumes `OcrService.scanReceiptForExpense(fileBytes, filename): OcrScanOutcome`.
- Produces the existing `BulkUploadResult(created, errors)` response.

- [ ] **Step 1: Write failing controller tests**

Add endpoint-level tests for:

```kotlin
@Test
fun `reject mode returns OCR error without creating expense`() {
    // Configure the OCR service outcome as failed with REJECT_RECEIPT.
    // POST one valid receipt to /api/expenses/bulk-upload.
    // Assert 200, created is empty, errors contains the filename,
    // and ExpenseService.createExpense was never called.
}

@Test
fun `create draft mode preserves failed OCR behavior`() {
    // Configure the OCR service outcome as failed with CREATE_DRAFT.
    // POST one valid receipt.
    // Assert ExpenseService.createExpense is called with zero/default OCR fields
    // and the receipt is delegated through uploadReceipts.
}

@Test
fun `one rejected file does not stop successful files`() {
    // POST a two-file batch with one rejected OCR outcome and one successful outcome.
    // Assert one created expense and one file-level error.
}
```

Use real request/response behavior at the controller seam. Mock only the OCR and ExpenseService collaborators needed to isolate the adapter.

- [ ] **Step 2: Run the focused controller tests and verify they fail**

Run:

```bash
cd backend-kotlin-jpa
./gradlew test --tests '*BulkExpenseControllerTest'
```

Expected: failure because the controller still calls `scanReceipt` and always creates a draft after OCR failure.

- [ ] **Step 3: Implement the minimal controller change**

Replace the direct `scanReceipt` call with `scanReceiptForExpense`.

For `REJECT_RECEIPT` failures:

- append `BulkUploadError(filename, failureReason)`;
- skip expense creation and receipt upload;
- continue to the next file.

For `CREATE_DRAFT` failures:

- use the same existing defaults: amount zero, EUR currency, today’s date, empty OCR text, and manual-completion description;
- create the draft and delegate receipt persistence exactly as today.

Do not move authorization, file-size limits, or storage validation into the controller.

- [ ] **Step 4: Run the focused controller tests and verify they pass**

Run:

```bash
cd backend-kotlin-jpa
./gradlew test --tests '*BulkExpenseControllerTest'
```

Expected: PASS.

- [ ] **Step 5: Commit the bulk-upload change**

```bash
git add backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/BulkExpenseControllerTest.kt
git commit -m "feat: apply OCR failure policy to bulk upload"
```

---

### Task 3: Expose the policy in the existing admin OCR screen

**Files:**
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
- Modify: `frontend/lib/types/admin.ts`
- Modify: `frontend/app/admin/ocr/page.tsx`
- Modify: relevant `frontend/messages/*.json` admin locale files

**Interfaces:**
- The existing `GET /settings/ocr` and `PATCH /settings/ocr` endpoints serialize `failure_mode` as part of `OcrConfig`.
- The frontend sends either `CREATE_DRAFT` or `REJECT_RECEIPT`.

- [ ] **Step 1: Write failing frontend tests or type assertions**

Update the frontend type contract and add the page-level test coverage used by the repository’s existing test setup. Assert that:

- the loaded OCR configuration selects the returned `failure_mode`;
- the form defaults to `CREATE_DRAFT`;
- saving `REJECT_RECEIPT` sends `failure_mode: "REJECT_RECEIPT"`;
- the UI explains that rejected receipts do not create expenses.

- [ ] **Step 2: Run the relevant frontend check and verify the new contract fails**

Run:

```bash
cd frontend
npx tsc --noEmit
```

Expected: failure until `OcrConfig.failure_mode` and the form field are defined.

- [ ] **Step 3: Add the admin field**

In `frontend/lib/types/admin.ts`, add:

```ts
failure_mode: "CREATE_DRAFT" | "REJECT_RECEIPT";
```

In `frontend/app/admin/ocr/page.tsx`:

- add `failure_mode: "CREATE_DRAFT"` to the default form;
- include it in the Zod schema;
- populate it from `getOcrConfig()`;
- render an accessible select/radio control with the two choices;
- include the explanation and labels in all locale files;
- submit it through the existing `updateOcrConfig` mutation.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run i18n:check
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit the admin configuration UI**

```bash
git add frontend/lib/types/admin.ts frontend/app/admin/ocr/page.tsx frontend/messages
git commit -m "feat: add admin OCR failure mode setting"
```

---

### Task 4: Full verification and code review

**Files:**
- No new production files.
- Review all files changed by Tasks 1–3.

- [ ] **Step 1: Run backend verification**

```bash
cd backend-kotlin-jpa
./gradlew test bootJar --no-daemon
```

Expected: PASS with no new warnings.

- [ ] **Step 2: Run frontend verification**

```bash
cd frontend
npx tsc --noEmit
npm run i18n:check
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 3: Review the diff**

Check that:

- `BulkExpenseController` no longer decides OCR failure policy;
- `scanReceipt` remains compatible for `OcrController`;
- invalid/missing config safely uses `CREATE_DRAFT`;
- rejected files cannot create orphan expenses or receipts;
- existing successful OCR behavior is unchanged;
- only the existing global OCR configuration is used;
- no secrets or credentials were introduced.

- [ ] **Step 4: Commit verification fixes if required**

```bash
git status --short
git diff --check
```

Fix only issues introduced by this feature, rerun the affected tests, and commit each focused correction separately.

- [ ] **Step 5: Request code review before merge**

Review the branch against `main), then open a pull request targeting `main`. Do not merge until backend, frontend, translation, and security checks are green.

## Verification matrix

| Behavior | Backend unit | Controller | Frontend |
|---|---:|---:|---:|
| Missing/invalid mode defaults to draft | ✓ |  |  |
| OCR failure creates draft | ✓ | ✓ |  |
| OCR failure rejects receipt | ✓ | ✓ | ✓ |
| Successful OCR unchanged | ✓ | ✓ |  |
| Mixed bulk batch continues |  | ✓ |  |
| Admin can select mode |  |  | ✓ |
| Existing settings API remains compatible | ✓ | ✓ | ✓ |
