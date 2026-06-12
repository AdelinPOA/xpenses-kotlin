## Why

Currently, all expense receipts (images/PDFs) and exported company reports are saved to the local directory within the backend container. To support production deployment with high-availability, scalability, and integration with popular enterprise NAS configurations (like Synology), we need a configurable storage engine supporting Local, SMB/CIFS, WebDAV, SFTP, and S3 protocols, entirely configurable from the admin interface.

## What Changes

- Add a storage settings configuration UI under a new Moderator page `/admin/storage` to choose the active storage provider and define connection configurations (passwords/keys are encrypted on save).
- Expose a backend endpoint to validate settings by creating, reading, and deleting a temporary test file.
- Implement an automatic, background-safe file migration workflow when the Moderator saves a new storage configuration, permitting zero downtime.
- Adapt all receipt uploads, file downloads, and PDF/ZIP generation endpoints to route via the new Storage Manager, utilizing a local filesystem caching layer to minimize network overhead and maintain compatibility with existing ReportLab and pypdf operations.

## Capabilities

### New Capabilities
- `configurable-storage`: Support dynamically configured storage backends (Local, SMB, WebDAV, SFTP, S3) with connection testing, local cache management, and background migration.

### Modified Capabilities
- `db-migrations-receipts-cleanup`: Integrate storage cleanup logic with the new multi-protocol storage engine to scan and clean orphan files from remote/active backends rather than assuming only local storage.

## Impact

- **Backend**:
  - `xpenses/services/storage.py` and `xpenses/routers/expenses.py` will use the dynamic storage manager.
  - `xpenses/services/pdf_export.py` will use local cached paths pre-fetched before report PDF creation.
  - Dependencies: add `boto3`, `smbprotocol`, `paramiko` to `pyproject.toml`.
  - Migration status tracks file transfers in the background.
- **Frontend**:
  - Add page `frontend/app/admin/storage/page.tsx` for forms and migration monitoring.
  - Update `frontend/components/layout/Sidebar.tsx` to register "Storage Settings" for moderators.
