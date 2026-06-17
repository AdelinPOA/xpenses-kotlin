## ADDED Requirements

### Requirement: GET /api/users reachable by manager and chef_finance roles
The `SecurityConfig` URL-level rule SHALL scope the `hasRole("mod")` restriction to `POST /api/users` only, so that `GET /api/users` reaches the controller-level role check which allows `manager` and `chef_finance`.

#### Scenario: manager can list users
- **WHEN** a user with role `manager` sends `GET /api/users` with a valid access token
- **THEN** the response is `200 OK` with the user list (not `403 Forbidden`)

#### Scenario: mod-only creation still enforced
- **WHEN** a user with role `manager` sends `POST /api/users`
- **THEN** the response is `403 Forbidden`

### Requirement: Manager role excluded from cross-user receipt and export downloads
The receipt-download, report-PDF, and receipts-ZIP endpoints SHALL apply the same privileged-roles list used by the corresponding read endpoints (`chef_finance`, `mod`, `manager`), so that a `manager` is not treated as an unauthorized cross-user reader on binary downloads.

#### Scenario: manager downloads a receipt from another user's expense
- **WHEN** a `manager` requests `GET /api/expenses/{id}/receipts/{receiptId}` for an expense they do not own
- **THEN** the response is `200 OK` with the receipt bytes (consistent with `GET /api/expenses/{id}` access)

### Requirement: Database row deleted before storage file on expense and receipt deletion
Deletion endpoints SHALL delete the database row first and the storage file second, so that a failure during DB deletion does not leave a dangling DB reference to a missing file.

#### Scenario: DB failure during expense delete preserves the file
- **WHEN** `DELETE /api/expenses/{id}` is called and `expenseRepository.delete` throws
- **THEN** the storage file is NOT deleted and the response is `500` with the original expense intact

#### Scenario: successful delete removes both row and file
- **WHEN** `DELETE /api/expenses/{id}` succeeds
- **THEN** the DB row is removed AND the storage file(s) are removed

### Requirement: PDF daily allowance uses the configured rate
`PdfService` SHALL read the daily-allowance rate from `app_settings` (via the same helper used by the JSON API) rather than hardcoding `50.0`.

#### Scenario: CFO updates the rate and regenerates the PDF
- **WHEN** `chef_finance` sets the daily-allowance rate to `65.0` via `PATCH /api/settings/daily-allowance-rate`
- **AND** the report PDF is generated
- **THEN** the PDF daily-allowance line shows `65.0 EUR/day` (not `50.0`)

### Requirement: @Transactional on @Version-protected report mutations
`PATCH /api/reports/{id}` and `POST /api/reports/{id}/sign` SHALL be annotated `@Transactional` so that Hibernate's `@Version` optimistic-lock check actually executes within a transaction.

#### Scenario: concurrent report edits trigger OptimisticLockException
- **WHEN** two requests concurrently `PATCH /api/reports/{id}`
- **THEN** one succeeds and the other receives `409 Conflict` (not a silent overwrite)
