## ADDED Requirements

### Requirement: StorageProvider interface
A `StorageProvider` interface in `services/storage/StorageProvider.kt` SHALL define the contract: `upload(relativePath, content)`, `download(relativePath): ByteArray`, `delete(relativePath)`, `testConnection(): Map<String, Any?>`.

#### Scenario: StorageProvider is a Kotlin interface
- **WHEN** a class implements StorageProvider
- **THEN** it must provide all four operations

### Requirement: S3StorageProvider via AWS SDK v2
`S3StorageProvider` in `services/storage/S3StorageProvider.kt` SHALL implement StorageProvider using `software.amazon.awssdk:s3`. Regions, bucket, accessKeyId, secretAccessKey, and optional endpointOverride SHALL be configurable. A single S3Client instance SHALL be reused for thread safety.

#### Scenario: upload creates object in S3
- **WHEN** `upload("receipts/inv.pdf", content)` is called
- **THEN** a `PutObjectRequest` is sent to S3 with the given key

#### Scenario: download retrieves object from S3
- **WHEN** `download("receipts/inv.pdf")` is called on an existing object
- **THEN** the object bytes are returned from S3

#### Scenario: delete removes object from S3
- **WHEN** `delete("receipts/inv.pdf")` is called
- **THEN** a `DeleteObjectRequest` removes the object from the bucket

#### Scenario: testConnection verifies S3 access
- **WHEN** `testConnection()` is called
- **THEN** it lists buckets and returns `{ok: true}` on success, `{ok: false, error: "..."}` on failure

### Requirement: AWS SDK v2 dependency
`software.amazon.awssdk:s3:2.30.0` SHALL be added to `build.gradle.kts`.

#### Scenario: dependency resolves
- **WHEN** `./gradlew dependencies --configuration compileClasspath` is run
- **THEN** `software.amazon.awssdk:s3:2.30.0` appears in the dependency tree

## MODIFIED Requirements

### Requirement: StorageService uses provider pattern
StorageService SHALL delegate remote operations to a nullable `StorageProvider` initialized via `@PostConstruct`. An S3 provider SHALL be created when provider_type is "s3". Unsupported providers SHALL log warnings and return useful error messages instead of misleading success.

#### Scenario: uploadFile syncs to local cache and remote
- **WHEN** `uploadFile("receipts/inv.pdf", bytes)` is called with S3 configured
- **THEN** the file is written to local cache AND uploaded to S3 via the provider

#### Scenario: downloadFile fetches from remote if not cached
- **WHEN** `downloadFile("receipts/inv.pdf")` is called and the file is not in local cache
- **THEN** it downloads from S3 via the provider, caches locally, and returns the bytes

#### Scenario: deleteFile removes from local and remote
- **WHEN** `deleteFile("receipts/inv.pdf")` is called with S3 configured
- **THEN** the local cache is deleted and the S3 object is removed

#### Scenario: saveStorageConfig reinitializes provider
- **WHEN** `saveStorageConfig(newConfig)` is called with changed S3 credentials
- **THEN** a new S3StorageProvider is created with the updated credentials

#### Scenario: testConnection delegates to provider for non-local
- **WHEN** `testConnection(config)` is called with provider_type "s3"
- **THEN** it creates a provider instance and delegates to `testConnection()`
- **WHEN** provider_type is sftp, smb, or webdav
- **THEN** it returns `{ok: false, error: "not implemented"}` instead of the previous misleading `{ok: true}`
