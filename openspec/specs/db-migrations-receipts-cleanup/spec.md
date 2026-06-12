# Specification: db-migrations-receipts-cleanup

## Purpose
Structured database schema migrations tracking and physical disk file cleanup utility.

## Requirements

### Requirement: Sequential SQL schema migrations execution
The system SHALL track database schema migrations through a `schema_migrations` table containing a `version` (integer) column. At startup, the server MUST scan the SQL migration files, compare them to the current version, and execute missing migrations sequentially in a transaction.

#### Scenario: Running database migrations on startup
- **WHEN** the backend application starts
- **THEN** it checks `schema_migrations`, reads all `.sql` migrations, and executes any missing versions sequentially.

### Requirement: Delete physical receipt files on expense deletion
When an expense is deleted, the backend system SHALL automatically locate the associated receipts on disk and delete the files to prevent disk leakages.

#### Scenario: User deletes expense with receipts
- **WHEN** user deletes expense ID `10` which has receipt file `/app/data/receipts/2026/06/receipt_10.png`
- **THEN** the record is deleted from database and the file `receipt_10.png` is permanently removed from filesystem.

### Requirement: Moderator receipt scanner utility
The system SHALL provide an API and UI page accessible to users with the `mod` role to scan the active storage location (which may be local or remote via SMB, WebDAV, SFTP, or S3), identify orphaned files (files in the active storage not indexed in the `receipts` database table), and allow them to be deleted.

#### Scenario: Scanning for orphans
- **WHEN** a moderator requests a storage scan
- **THEN** the system compares the database files with files present in the active storage provider and returns a list of orphan file paths.

#### Scenario: Cleaning up orphans
- **WHEN** a moderator requests deletion of orphans
- **THEN** the system deletes the matching orphan files from the active storage provider and returns the number of cleaned files.

