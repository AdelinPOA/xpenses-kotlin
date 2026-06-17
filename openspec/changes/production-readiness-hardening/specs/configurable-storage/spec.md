## ADDED Requirements

### Requirement: Orphan receipt scanning returns real results
The `POST /api/settings/receipts/scan` endpoint SHALL scan the configured storage location for receipt files that have no corresponding database row and SHALL return the actual list of orphaned file paths and a count. The endpoint SHALL NOT return a hardcoded empty result.

#### Scenario: orphan files detected
- **WHEN** a `mod` user requests `POST /api/settings/receipts/scan` and the storage contains 3 files with no matching `receipts` row
- **THEN** the response includes those 3 file paths and `count: 3`

#### Scenario: no orphan files
- **WHEN** a `mod` user requests `POST /api/settings/receipts/scan` and every stored file has a matching DB row
- **THEN** the response returns an empty list and `count: 0`

### Requirement: Orphan receipt cleanup deletes unmatched files
The `POST /api/settings/receipts/clean` endpoint SHALL delete the orphaned receipt files identified by a prior scan from the storage backend and SHALL return the count of files actually removed. The endpoint SHALL NOT be a no-op stub.

#### Scenario: cleanup removes orphaned files
- **WHEN** a `mod` user requests `POST /api/settings/receipts/clean` after a scan found 3 orphans
- **THEN** those 3 files are deleted from storage and the response reports `deleted: 3`

#### Scenario: cleanup is idempotent
- **WHEN** a `mod` user requests `POST /api/settings/receipts/clean` when no orphans exist
- **THEN** the response reports `deleted: 0` and no error occurs

### Requirement: Storage migration status reflects actual state
The `GET /api/settings/storage/migration-status` endpoint SHALL return the real migration status from the `storage_migration_status` app-settings key (including progress percentage and active/inactive state), not a hardcoded empty/stub response.

#### Scenario: migration in progress shows real progress
- **WHEN** a migration is running and has copied 50 of 100 files
- **THEN** the response shows `status: "in_progress"`, `progress: 50`, `total: 100`
