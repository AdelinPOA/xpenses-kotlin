## Context

The Kotlin backend (`backend-kotlin-jpa/`) already had multiple code quality passes. These 4 gaps were identified but deferred. None touch frontend code — all changes are backend-only except for the README update.

Stack: Kotlin 2.1.0, Spring Boot 3.4.3, Spring Data JPA, Gradle. JDK 21 target (toolchain), host runs JDK 25.

## Goals / Non-Goals

**Goals:**
- UserController returns properly shaped response DTOs instead of raw JPA entities
- Request DTOs use declarative `@Valid` + annotation-based validation
- S3 provider works for receipt storage (upload, download, delete, test)
- Clear JDK version guidance for local development

**Non-Goals:**
- No JSON contract changes — all DTOs maintain existing snake_case JSON shapes
- No replacing business-rule validation — only structural/format constraints
- No SFTP/SMB/WebDAV implementation — only S3
- No frontend changes

## Decisions

### Decision 1: Standalone UserResponse model vs. inline per endpoint

**Choice**: Single `UserResponse` class in `eu.nt.xpenses.models` package, reused by all 6 endpoints.

**Rationale**: All 6 endpoints return the same User data shape. A single DTO avoids duplication and keeps the contract consistent. If future endpoints need different shapes (e.g., create response with created timestamp), the DTO can be extended or split then.

### Decision 2: Validation order — DTO annotations first, then business rules

**Choice**: Keep existing manual validation for business rules but add `@Valid` for structural checks.

**Rationale**: `@Valid` handles format/required-field constraints cleanly. Business rules (state machine transitions, duplicate detection, authorization) are too complex for annotations and remain manual. The `@RestControllerAdvice` handler ensures consistent error format.

### Decision 3: AWS SDK v2 for S3

**Choice**: `software.amazon.awssdk:s3` (AWS SDK v2).

**Rationale**: V2 is the current AWS SDK generation, actively maintained, supports non-blocking I/O via Netty, and has a stable API. The alternative (`aws-java-sdk-s3` v1) is in maintenance mode.

### Decision 4: Interface-based provider pattern

**Choice**: `StorageProvider` interface with `S3StorageProvider` implementation.

**Rationale**: Keeps `StorageService` clean — it handles config + routing + local caching, while providers handle only the remote transport. Adding new providers later follows the same contract.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| S3 SDK adds ~15MB to JAR | Only loaded at runtime when S3 is configured; acceptable for a deployment tool |
| Users on JDK 25 still can't compile locally | Docker build works; `make check-java-version` gives clear guidance |
| Bean validation annotations might conflict with existing manual validation | Keep manual validation as a second pass after `@Valid` passes; errors are additive, not conflicting |
