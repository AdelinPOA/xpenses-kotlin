## ADDED Requirements

### Requirement: spring-boot-starter-validation dependency
The `spring-boot-starter-validation` dependency SHALL be added to `build.gradle.kts` to enable declarative validation via annotations.

#### Scenario: dependency resolves in Gradle
- **WHEN** `./gradlew dependencies --configuration compileClasspath` is run
- **THEN** `spring-boot-starter-validation:3.4.3` appears in the dependency tree

### Requirement: Validation error handler for consistent error responses
A `@RestControllerAdvice` handler SHALL catch `MethodArgumentNotValidException` and return `400 Bad Request` with `{"detail": "<field>: <message>"}` JSON, matching the existing error contract.

#### Scenario: blank username returns 400 with detail
- **WHEN** a POST to `/api/auth/login` has empty username
- **THEN** the response is `400 Bad Request` with `{"detail": "username: must not be blank"}`

### Requirement: @Valid on controller request body parameters
Controllers SHALL use `@Valid` on `@RequestBody` parameters to trigger annotation-based validation before the method body runs.

#### Scenario: AuthController.login validates request
- **WHEN** `@Valid @RequestBody request: LoginRequest` is used
- **THEN** blank username or password triggers validation errors before business logic

#### Scenario: AuthController.changePassword validates request
- **WHEN** `@Valid @RequestBody body: ChangePasswordRequest` is used
- **THEN** blank old_password or short new_password triggers validation errors

#### Scenario: UserController.createUser validates request
- **WHEN** `@Valid @RequestBody body: UserCreateRequest` is used
- **THEN** blank required fields or short password trigger validation errors

#### Scenario: UserController.updateRole validates request
- **WHEN** `@Valid @RequestBody body: RoleUpdateRequest` is used
- **THEN** blank role field triggers a validation error

### Requirement: Validation annotations on request DTOs
Request DTOs SHALL carry `@NotBlank`, `@Size(min=8)`, and `@Pattern` annotations on relevant fields.

#### Scenario: LoginRequest fields are @NotBlank
- **WHEN** `LoginRequest` is inspected
- **THEN** username and password carry `@field:NotBlank`

#### Scenario: ChangePasswordRequest has size constraint
- **WHEN** `ChangePasswordRequest` is inspected
- **THEN** oldPassword carries `@field:NotBlank` and newPassword carries `@field:NotBlank @field:Size(min=8)`

#### Scenario: UserCreateRequest validates all required fields
- **WHEN** `UserCreateRequest` is inspected
- **THEN** username, displayName, password carry `@field:NotBlank`; password carries `@field:Size(min=8)`; role carries `@field:Pattern(regexp="technician|manager|chef_finance|mod")`

#### Scenario: RoleUpdateRequest field is @NotBlank
- **WHEN** `RoleUpdateRequest` is inspected
- **THEN** role carries `@field:NotBlank`
