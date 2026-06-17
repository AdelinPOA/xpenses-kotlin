## Why

The Kotlin backend has 4 documented quality gaps that were noted during prior audit passes but left as "not blockers":

1. **UserController returns raw JPA entities** — 6 endpoints return `User` entities directly. Only `@JsonIgnore` on `passwordHash` prevents credential leaks, which is brittle.
2. **No Bean Validation** — Every controller does manual validation inline with if-else checks. Adding `spring-boot-starter-validation` would enable declarative `@Valid` + annotation-based validation.
3. **Remote storage is stubbed** — `StorageService` has config for S3/SFTP/SMB/WebDAV with encrypted credentials, but the actual upload/download/delete/test operations silently skip remote sync.
4. **JDK 25 incompatibility** — Kotlin 2.1.0 requires ≤ JDK 22, but the host runs JDK 25.0.3. No local dev workflow guidance exists.

## What Changes

- **Gap 1 (DTOs)**: Move `UserResponse` from `AuthController.kt` to a shared model file. Wire all 6 UserController endpoints to return `UserResponse` instead of raw `User` entities.
- **Gap 2 (Validation)**: Add `spring-boot-starter-validation` dependency. Add `@Valid` and field-level annotations (`@NotBlank`, `@Size`, `@Pattern`) to request DTOs across the most critical controllers.
- **Gap 3 (Storage)**: Implement real AWS S3 provider. Add `software.amazon.awssdk:s3` dependency. Create pluggable `StorageProvider` interface. Implement `S3StorageProvider`. Keep SFTP/SMB/WebDAV as stubs with actionable error messages.
- **Gap 4 (JDK 25)**: Add `.java-version` file pinned to JDK 21. Add a `make check-java-version` target. Document the workaround in README.

## Capabilities

### New Capabilities
- `user-response-dtos`: Rest API returns properly shaped DTOs for User endpoints instead of raw entities.
- `s3-storage-provider`: Backend can store/retrieve/delete receipts on AWS S3.
- `bean-validation`: Request DTOs are validated declaratively via annotations.

### Modified Capabilities
- `remote-storage`: StorageProvider interface with S3 implementation and stubs for others.
- `local-dev-workflow`: JDK version check and guidance.

## Impact

- **Backend**: `UserController.kt` refactored; `spring-boot-starter-validation` added to build; `StorageProvider` interface created; `S3StorageProvider` added; `StorageService` refactored to delegate to providers.
- **Frontend**: No changes — user DTOs maintain the same JSON shape.
- **No breaking changes**: All existing API contracts preserved.
