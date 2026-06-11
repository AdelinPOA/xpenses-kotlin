## 1. Sequential DB Migrations

- [x] 1.1 Create the migrations folder at `backend/xpenses/migrations` and seed it with `0001_init.sql` containing the core database schema setup.
- [x] 1.2 Implement the migrations runner in `backend/xpenses/database.py` that initializes the `schema_migrations` table and sequentially processes newer migration scripts at startup.

## 2. Receipt Deletion Cleanup

- [x] 2.1 Update the expense deletion route in `backend/xpenses/routers/expenses.py` to retrieve file paths of associated receipts and delete them from disk when deleting an expense.

## 3. Moderator Scan & Cleanup Utility

- [x] 3.1 Create a filesystem scanning utility in `backend/xpenses/services/storage.py` that compares files in `settings.receipts_dir` with the database `receipts` table to identify orphaned files.
- [x] 3.2 Add moderator-only endpoints `/api/admin/receipts/scan` (to return list of orphans) and `/api/admin/receipts/clean` (to delete orphans) in a new router or in `backend/xpenses/routers/users.py`.
- [x] 3.3 Create a Moderator UI page `/admin/receipts` in the Next.js frontend to allow scanning and one-click deletion of orphaned files.

## 4. Verification

- [x] 4.1 Write integration tests validating the DB migrations runner, physical receipt deletion upon expense removal, and the admin orphan scanning API.
