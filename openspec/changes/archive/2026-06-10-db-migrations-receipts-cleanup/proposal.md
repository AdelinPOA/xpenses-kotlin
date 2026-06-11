## Why

As the application grows, DDL migrations in `database.py` are executed at every startup via direct statements with `IF NOT EXISTS` checks. This becomes unstructured and hard to verify. Additionally, deleting reports or expenses leaves orphan receipt files physically in storage, cluttering the host file system. Implementing sequential DB migrations and an orphan receipt cleanup service resolves these maintainability and operational efficiency issues.

## What Changes

- **Sequential DB Migrations**: 
  - Introduce a `schema_migrations` table tracking the database version schema.
  - Implement sequential migration loading from a dedicated migrations folder containing versioned sql scripts.
- **Orphan Receipts Cleanup**:
  - Automatically delete physical receipt files on disk when an expense is deleted.
  - Add a moderator-only admin utility to scan files on disk against the database `receipts` table, allowing manual or automatic cleanup of orphan files.

## Capabilities

### New Capabilities
- `db-migrations-receipts-cleanup`: Structured database schema migrations tracking and physical disk file cleanup utility.

### Modified Capabilities
<!-- None -->

## Impact

- **Database**: Adds a version tracking table `schema_migrations`.
- **Backend**:
  - `backend/xpenses/database.py`: Move initial schema setup DDLs to a dedicated folder and transition `init_db` to run sequential migrations.
  - `backend/xpenses/routers/expenses.py`: Clean up physical files when deleting an expense.
  - `backend/xpenses/services/storage.py` or new service: Implement filesystem verification to detect files not indexed in the DB.
  - `backend/xpenses/routers/app_settings.py` or `users.py`: Add an admin route to scan and remove orphaned receipts.
