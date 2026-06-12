## 1. Setup & Dependencies

- [x] 1.1 Add `smbprotocol`, `paramiko`, and `boto3` to backend dependencies in `pyproject.toml`
- [x] 1.2 Rebuild / update backend virtual environment to pull new dependencies

## 2. Core Storage Abstraction

- [x] 2.1 Create `backend/xpenses/services/storage/base.py` defining `BaseStorageProvider`
- [x] 2.2 Create `backend/xpenses/services/storage/local.py` implementing `LocalStorageProvider`
- [x] 2.3 Create `backend/xpenses/services/storage/smb.py` implementing `SMBStorageProvider`
- [x] 2.4 Create `backend/xpenses/services/storage/webdav.py` implementing `WebDAVStorageProvider`
- [x] 2.5 Create `backend/xpenses/services/storage/sftp.py` implementing `SFTPStorageProvider`
- [x] 2.6 Create `backend/xpenses/services/storage/s3.py` implementing `S3StorageProvider`
- [x] 2.7 Create `backend/xpenses/services/storage/manager.py` with `StorageManager` to handle configuration, active provider selection, and caching folder `/app/data/cache`

## 3. Configuration & API Endpoints

- [x] 3.1 Expose `GET /api/settings/storage` endpoint with credential masking
- [x] 3.2 Expose `PATCH /api/settings/storage` to save configuration settings (passwords Fernet-encrypted)
- [x] 3.3 Expose `POST /api/settings/storage/test` to test connections live
- [x] 3.4 Expose `GET /api/settings/storage/migration-status` to query active background migration progress

## 4. Background Migration Task & Read Fallback

- [x] 4.1 Implement background migration runner worker in backend settings manager
- [x] 4.2 Add read fallback capability to Storage Manager so old files are fetched from the previous provider on cache misses during active migration
- [x] 4.3 Update migration status updates in the PostgreSQL database under `storage_migration_status` key in `app_settings`

## 5. Endpoints & PDF Integration

- [x] 5.1 Adapt receipt upload in `routers/expenses.py` to route through Storage Manager
- [x] 5.2 Adapt receipt serving route in `routers/expenses.py` to resolve via `get_local_path` caching helper
- [x] 5.3 Integrate `generate_report_pdf` in `routers/reports.py` to pre-cache files in async router before worker thread execution
- [x] 5.4 Update reports ZIP compilation in `routers/reports.py` to use Storage Manager's caching path helper
- [x] 5.5 Update storage cleanup scans (`scan_orphan_receipts`) to run on the active storage provider instead of assuming local folder only

## 6. Frontend Admin UI

- [x] 6.1 Create `frontend/app/admin/storage/page.tsx` settings panel with connection testing form
- [x] 6.2 Implement migration trigger confirmation dialog inside settings save handler
- [x] 6.3 Implement progress monitoring panel with status polling (every 2 seconds) on the storage admin settings page
- [x] 6.4 Register storage settings route in the moderator section of `frontend/components/layout/Sidebar.tsx`

## 7. Testing & Verification

- [x] 7.1 Write backend unit and integration tests in `backend/tests/test_storage_settings.py`
- [x] 7.2 Run the test suite and verify linting checks pass using `make check`
