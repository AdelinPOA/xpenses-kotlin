## Context

The system initializes DB schemas by splitting the `CREATE_TABLES` query string directly in Python. We want to convert this into sequentially loaded `.sql` files. Additionally, the deletion of records (expenses/receipts) leaves files on disk. 

## Goals / Non-Goals

**Goals:**
- Create a folder `backend/xpenses/migrations` containing versioned SQL scripts.
- Implement an async migrations runner in `database.py` that reads the `schema_migrations` table and executes new migration scripts in order.
- Track down file paths from DB records before deletion, and delete files on disk synchronously or asynchronously when deleting an expense or chitanță.
- Create `/api/admin/receipts/scan` and `/api/admin/receipts/clean` endpoints for moderator role.

**Non-Goals:**
- External migration runner dependency (Alembic). Keep it lightweight inside `database.py`.

## Decisions

### Decision 1: Migrations Location & Parsing
- **Choice**: Embed SQL scripts in `backend/xpenses/migrations/` (e.g. `0001_init.sql`, `0002_add_notifications_enabled.sql`).
- **Rationale**: Keeps SQL files clean and easily readable/editable directly by SQL editors.

### Decision 2: Filesystem Scan for Orphans
- **Choice**: Recursively crawl `settings.receipts_dir` and collect file paths relative to the root. Compare this set with the `file_path` column in `receipts` table.
- **Rationale**: Simple set operations (`disk_files - db_files`) in Python will highlight exactly which files are orphaned.

## Risks / Trade-offs

- **Risk**: Deleting wrong files during cleanup.
  - **Mitigation**: Scan endpoint only reports files, does not touch them. Clean endpoint only deletes files explicitly resolved as orphans.
