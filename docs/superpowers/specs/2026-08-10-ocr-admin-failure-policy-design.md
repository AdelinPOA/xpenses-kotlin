# Design: Admin-configurable OCR failure policy

Date: 2026-08-10  
Repository: `AdelinPOA/xpenses-kotlin`  
Branch: `agent/ocr-admin-failure-policy`

## Goal

Move the OCR failure decision into the OCR module and make it globally configurable by administrators.

The administrator chooses one of two modes:

- `CREATE_DRAFT` — create a draft expense with default or empty fields so the user can complete it manually.
- `REJECT_RECEIPT` — do not create an expense when OCR fails; return the file-level error to the caller.

The default remains `CREATE_DRAFT` to preserve the current behavior.

## Current friction

`BulkExpenseController` currently:

1. Calls `OcrService.scanReceipt()`.
2. Decides that an empty OCR result means failure.
3. Chooses default amount, currency, date, and description values.
4. Creates the expense.
5. Stores the receipt.
6. Formats the result for the bulk-upload response.

This makes the controller aware of OCR policy and means a future OCR entry point could implement a different failure decision.

## Design

### Ownership

`OcrService` owns OCR policy and returns a normalized scan outcome. The controller remains an HTTP adapter responsible for request handling and response construction.

The OCR module will:

- read the global `ocr_failure_mode` application setting;
- default missing or invalid configuration to `CREATE_DRAFT`;
- distinguish a successful OCR result from an OCR failure;
- normalize provider output into the fields needed by expense creation;
- apply the configured failure mode;
- keep provider, fallback, cache, rate-limit, and transaction details behind its module seam.

`BulkExpenseController` will:

- validate the multipart request;
- ask the OCR module to process each receipt;
- create an expense only when the OCR outcome permits it;
- delegate receipt persistence to `ExpenseService`;
- preserve the current `BulkUploadResult(created, errors)` response shape.

### Configuration

Use the existing `app_settings` table and application-setting access pattern.

Setting:

```text
key: ocr_failure_mode
values: CREATE_DRAFT | REJECT_RECEIPT
default: CREATE_DRAFT
```

The setting is global, not per user, role, or company.

Admin behavior:

- expose the setting through the existing admin configuration mechanism if one exists;
- validate values on write;
- show a clear label and explanation;
- never expose secrets or provider credentials through this setting;
- invalidate any relevant settings cache after an update.

If the admin UI is not part of this implementation slice, the backend setting and safe default must still be implemented so the behavior is deterministic.

### Failure semantics

An OCR failure includes provider failure, fallback failure, timeout, malformed provider output, or an empty result that cannot produce a usable OCR record.

`CREATE_DRAFT`:

- create the expense with the existing defaults;
- keep the receipt attached;
- include a clear manual-completion message;
- include the file in `created`, not `errors`, unless expense or receipt persistence itself fails.

`REJECT_RECEIPT`:

- do not create an expense;
- add a file-level error to `errors`;
- continue processing the other files in the same bulk request;
- do not leave an orphaned receipt or partially created expense.

Persistence failures remain persistence failures and are reported independently of the OCR policy.

### Compatibility

- Keep the existing endpoint and response DTOs unchanged.
- Keep the existing maximum batch size and file validation behavior.
- Keep successful OCR mapping behavior unchanged.
- Keep the default behavior as `CREATE_DRAFT`.
- Preserve the existing single-expense flow unless it already uses the OCR module.
- Preserve existing authorization and rate-limit behavior.

## Data flow

```text
+-------------------------+
| BulkExpenseController   |
| HTTP adapter             |
+------------+------------+
             |
             v
+-------------------------+
| OCR module              |
| provider/fallback/cache |
| failure policy          |
+------------+------------+
             |
             +--> CREATE_DRAFT --> normalized result --> ExpenseService
             |
             +--> REJECT_RECEIPT --> file error
```

The interface is the test surface. Tests should not need to know which provider, cache, or database setting lookup produced the OCR outcome.

## Testing strategy

### OCR module tests

Add tests for:

- successful OCR returns a normalized result;
- provider failure follows `CREATE_DRAFT`;
- provider failure follows `REJECT_RECEIPT`;
- invalid or missing setting defaults to `CREATE_DRAFT`;
- malformed provider output is treated as failure;
- fallback failure is treated as failure;
- provider calls remain outside long database transactions.

### Bulk endpoint tests

Add tests for:

- mixed batch with one successful file and one rejected file;
- rejected OCR file creates no expense and no receipt;
- draft mode creates a draft expense with the receipt attached;
- persistence failure remains a file-level error;
- response shape remains `created` plus `errors`;
- one failed file does not stop the rest of the batch.

### Admin configuration tests

Add tests for:

- admin can set `CREATE_DRAFT`;
- admin can set `REJECT_RECEIPT`;
- invalid values are rejected;
- non-admin users cannot change the setting;
- missing configuration uses the safe default.

## Non-goals

- Replacing OCR providers.
- Adding an asynchronous OCR queue.
- Changing the public bulk-upload endpoint.
- Redesigning expense creation.
- Adding per-user or per-company policy.
- Changing rate-limit thresholds.
- Changing storage-provider behavior.

## Acceptance criteria

- The administrator can choose the global OCR failure mode.
- The default remains `CREATE_DRAFT`.
- `BulkExpenseController` no longer decides the OCR failure policy.
- Both modes are covered by failing-first tests.
- Existing successful OCR and bulk-upload behavior remains compatible.
- CI backend tests pass.
