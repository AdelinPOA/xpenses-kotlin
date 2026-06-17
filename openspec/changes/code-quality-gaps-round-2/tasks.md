## Gap 1: UserController Response DTOs

- [x] 1.1 Create `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/UserResponse.kt` with extracted `UserResponse` data class from `AuthController.kt`, plus a constructor `UserResponse(user: User)` that maps all fields
- [x] 1.2 Update `AuthController.kt` — remove local `UserResponse` definition, import from `eu.nt.xpenses.models`
- [x] 1.3 Update `UserController.kt` — all 6 endpoints map `User` → `UserResponse` before returning

## Gap 2: Bean Validation

- [x] 2.1 Add `implementation("org.springframework.boot:spring-boot-starter-validation")` to `build.gradle.kts`
- [x] 2.2 Add `@NotBlank`, `@Size`, `@Pattern` annotations to request DTOs: `LoginRequest`, `ChangePasswordRequest`, `UserCreateRequest`, `RoleUpdateRequest`, `ActiveUpdateRequest`
- [x] 2.3 Add `@Valid` to request body parameters in `AuthController.login`, `AuthController.changePassword`, `UserController.createUser`, `UserController.updateRole`
- [x] 2.4 Create `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt` with `@RestControllerAdvice` handling `MethodArgumentNotValidException` → `400 {"detail": "..."}`

## Gap 3: S3 Storage Provider

- [x] 3.1 Add `implementation("software.amazon.awssdk:s3:2.30.0")` to `build.gradle.kts`
- [x] 3.2 Create `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/StorageProvider.kt` — interface with `upload`, `download`, `delete`, `testConnection`
- [x] 3.3 Create `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/S3StorageProvider.kt` — implements `StorageProvider` using AWS SDK v2
- [x] 3.4 Refactor `StorageService.kt` — add nullable `StorageProvider` field, construct it on init based on config, delegate remote operations to it, improve stub error messages for SFTP/SMB/WebDAV

## Gap 4: Local Dev Environment

- [x] 4.1 Create `.java-version` file at repo root with content `21`
- [x] 4.2 Add `check-java-version` target to `Makefile`
- [x] 4.3 Add `check-java-version` as prerequisite of `build` target
- [x] 4.4 Add "Local Development Requirements" section to `README.md`

## Verify

- [x] 5.1 Verify all 6 UserController endpoints return correct snake_case JSON without password_hash
- [x] 5.2 Verify `@Valid` rejects invalid input with consistent error format
- [x] 5.3 Verify `software.amazon.awssdk:s3` resolves in Gradle dependency resolution
- [x] 5.4 Verify `make check-java-version` detects JDK 25 mismatch and exits with code 1
- [x] 5.5 Update HANDOFF.md and push
