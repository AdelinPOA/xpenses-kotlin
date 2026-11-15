# Storage Providers & Migration

## Overview
Storage provider abstraction, local disk and AWS S3 implementations, path traversal validation, and resumable asynchronous storage migration engine in `eu.nt.xpenses.services.storage`.

## Interface
- `[StorageProvider.kt:StorageProvider]` — `interface` defining `upload(relativePath, content)`, `download(relativePath)`, `delete(relativePath)`, and `testConnection()`
- `[LocalStorageProvider.kt:LocalStorageProvider]` — `class LocalStorageProvider(basePath: String) : StorageProvider` backed by local filesystem
- `[S3StorageProvider.kt:S3StorageProvider]` — `class S3StorageProvider(region, bucket, accessKeyId, secretAccessKey, endpointOverride) : StorageProvider` backed by AWS S3 SDK
- `[StoragePathResolver.kt:StoragePathResolver]` — `object` providing `resolve(baseDir: File, relativePath: String): File`
- `[StorageMigrationStateStore.kt:StorageMigrationStateStore]` — `interface` defining `claim(jobId, path, maxAttempts)`, `markCompleted(jobId, path)`, and `markFailed(jobId, path, error)`
- `[JdbcStorageMigrationStateStore.kt:JdbcStorageMigrationStateStore]` — `@Repository` implementation backed by `JdbcTemplate` and `storage_migration_files`
- `[NoopStorageMigrationStateStore.kt:NoopStorageMigrationStateStore]` — `object` no-op `StorageMigrationStateStore` implementation
- `[StorageMigrationEngine.kt:StorageMigrationEngine]` — orchestrates async storage migrations via `executeMigrationAsync(...)`
- `[StorageMigrationEngine.kt:MigrationResult]` — `data class MigrationResult(totalFiles: Int, migratedFiles: Int, failedFiles: Int, errors: List<String>)`

## Invariants
- `[StoragePathResolver.kt:resolve]` — rejects absolute `relativePath` (`IllegalArgumentException`) and requires canonical resolved path to stay strictly inside canonical `baseDir` (preventing path traversal and symlink escapes)
- `[LocalStorageProvider.kt:resolveTargetFile]` — delegates all path resolution to `StoragePathResolver.resolve`; `[LocalStorageProvider.kt:download]` throws `NoSuchFileException` if missing; `[LocalStorageProvider.kt:testConnection]` returns `ok=true` only if `baseDir` exists and is writable
- `[S3StorageProvider.kt:download]` — translates `NoSuchKeyException` to `NoSuchFileException`; wraps other S3 errors in `IllegalStateException` across `upload`, `download`, and `delete`; configures static credentials only when both keys are non-null and `endpointOverride` only when non-blank
- `[JdbcStorageMigrationStateStore.kt:claim]` — claims a file only on initial insert (`status='CLAIMED', attempts=1`) or when existing row has `status='FAILED'` and `attempts < maxAttempts`; `[JdbcStorageMigrationStateStore.kt:markFailed]` truncates `last_error` to 500 characters
- `[StorageMigrationEngine.kt:executeMigrationAsync]` — deduplicates paths via `distinct()`, skips files where `stateStore.claim(...)` returns `false`, defaults `maxAttempts` to `5` (`DEFAULT_MAX_ATTEMPTS`), truncates individual errors to 500 chars, and caps `errors` list at `50` (`MAX_REPORTED_ERRORS`)

## Side Effects
- `[LocalStorageProvider.kt:upload]` / `[LocalStorageProvider.kt:download]` / `[LocalStorageProvider.kt:delete]` / `[LocalStorageProvider.kt:testConnection]` — filesystem reads, writes, directory creation (`mkdirs()`), and deletes; `[StoragePathResolver.kt:resolve]` resolves `File.canonicalFile`
- `[S3StorageProvider.kt:upload]` / `[S3StorageProvider.kt:download]` / `[S3StorageProvider.kt:delete]` / `[S3StorageProvider.kt:testConnection]` — AWS S3 network API calls (`PutObject`, `GetObject`, `DeleteObject`, `ListBuckets`)
- `[JdbcStorageMigrationStateStore.kt:claim]` / `[JdbcStorageMigrationStateStore.kt:markCompleted]` / `[JdbcStorageMigrationStateStore.kt:markFailed]` — SQL queries/updates on `storage_migration_files`
- `[StorageMigrationEngine.kt:executeMigrationAsync]` — submits async task to `Executor`, transfers objects between `oldProvider` and `newProvider`, updates state store, and invokes `onProgress` callbacks

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.services.storage.LocalStorageProviderTest' --tests 'eu.nt.xpenses.services.storage.StoragePathResolverTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
