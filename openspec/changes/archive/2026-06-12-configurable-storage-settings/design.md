## Context

Currently, all expense receipts and exported PDF reports are saved on the local filesystem of the backend container, configured via `settings.receipts_dir`. To allow administrators to mount external NAS systems (e.g. Synology) and scale the backend horizontally, we require a configurable storage mechanism. Administrators need to be able to switch between Local, SMB/CIFS, WebDAV, SFTP, and S3 protocols dynamically from the frontend web interface.

## Goals / Non-Goals

**Goals:**
- Implement a `BaseStorageProvider` abstract interface class.
- Create concrete providers: `LocalStorageProvider`, `S3StorageProvider`, `SMBStorageProvider`, `SFTPStorageProvider`, and `WebDAVStorageProvider`.
- Integrate a local caching directory (`/app/data/cache`) to pre-fetch files and provide compatibility with legacy PDF report generation and file serving.
- Securely store connection credentials in the `app_settings` PostgreSQL table (encrypted via Fernet).
- Create a Moderator UI on `/admin/storage` to test connections and save settings.
- Implement an async background task to migrate existing files between old and new storage locations.

**Non-Goals:**
- Migrating/modifying the local database setup to a cloud database.
- General server container orchestration settings.

## Decisions

### Decision 1: Caching Layer to Preserve Legacy Code
- **Option 1**: Direct in-memory buffer streaming across the app.
- **Option 2 (Chosen)**: File-based local cache under `/app/data/cache`.
- **Rationale**: Keeps existing ReportLab `Image` builders, `pypdf` readers, and FastAPI `FileResponse` serving endpoints completely unmodified. If a file is not in the cache, it is dynamically fetched from the active remote provider and cached locally before the legacy tool reads it.

### Decision 2: WebDAV Client Implementation
- **Option 1**: Third-party WebDAV library (`webdavclient3`).
- **Option 2 (Chosen)**: Custom HTTP client using standard `httpx` async client.
- **Rationale**: WebDAV is just HTTP. Creating a simple async WebDAV client using `httpx` reduces third-party dependencies, keeps the code async-native, and is easier to maintain.

### Decision 3: Sensitive Configuration Encryption
- **Option 1**: Plain text JSON strings.
- **Option 2 (Chosen)**: Fernet symmetric encryption.
- **Rationale**: Aligns with how existing OCR api keys and LDAP bind passwords are encrypted and decrypted in the database.

## Risks / Trade-offs

- **[Risk]**: Cache storage fills disk.
  - **Mitigation**: Implement a cleanup hook or limit the cache size, and exclude the cache directory from database orphan scans.
- **[Risk]**: Slow/broken connection to remote storage during file retrieval.
  - **Mitigation**: Add proper timeout handlers (e.g., 5s timeout on `httpx`/`smbprotocol`) and display a meaningful error to the user if the receipt download fails.
