## ADDED Requirements

### Requirement: @Transactional on all mutating controller endpoints
Every controller endpoint that performs a write (INSERT/UPDATE/DELETE) against one or more repositories SHALL be annotated `@Transactional`. This includes all `POST`, `PATCH`, `PUT`, and `DELETE` endpoints across `ExpenseController`, `ReportController` (including `createReport`, `updateReport`, `signReport`), `AdvanceController`, `MileageController`, `CategoryController`, `UserController`, `SignatureController`, `AppSettingsController`, and `LdapSettingsController`.

#### Scenario: multi-write expense creation is atomic
- **WHEN** `POST /api/expenses` creates the expense row and then the OCR-link row, and the second write fails
- **THEN** the entire operation rolls back (no orphan expense row without OCR link)

#### Scenario: receipt upload loop is atomic
- **WHEN** `POST /api/expenses/{id}/receipts` saves 3 receipts and the 2nd save fails
- **THEN** all 3 saves roll back (no partial receipt set)

### Requirement: Bean validation annotations on all request DTOs
Every request DTO data class SHALL carry appropriate bean-validation annotations on its fields: `@NotBlank` for required strings, `@NotNull` for required objects, `@Min(0)` for non-negative numerics (amounts, distances), `@Size` for length bounds, and `@Pattern` for format-constrained strings (currency codes, enum-like values). This expands validation from the initial 4 DTOs (`LoginRequest`, `ChangePasswordRequest`, `UserCreateRequest`, `RoleUpdateRequest`) to ALL request DTOs.

#### Scenario: negative expense amount rejected
- **WHEN** `POST /api/expenses` is called with `amount_original: -50`
- **THEN** the response is `400 Bad Request` with `{"detail": "amount_original: must be greater than or equal to 0"}`

#### Scenario: blank report title rejected
- **WHEN** `POST /api/reports` is called with an empty `title` field
- **THEN** the response is `400 Bad Request` with a validation detail

#### Scenario: invalid currency code rejected
- **WHEN** `POST /api/expenses` is called with `currency_original: "XYZ123"`
- **THEN** the response is `400 Bad Request` (currency must match the 3-letter ISO pattern)

#### Scenario: negative mileage distance rejected
- **WHEN** `POST /api/reports/{id}/mileage` is called with `distance_km: -10`
- **THEN** the response is `400 Bad Request` with a validation detail

### Requirement: @Valid on all @RequestBody parameters
Every controller method accepting a `@RequestBody` SHALL annotate the parameter with `@Valid` to trigger bean validation before the method body executes.

#### Scenario: all mutating endpoints validate input
- **WHEN** any `@RequestBody` parameter across all controllers is inspected
- **THEN** it carries `@Valid`

### Requirement: Exception handler covers all 400-cause exception types
`ValidationExceptionHandler` SHALL handle `MethodArgumentNotValidException`, `ConstraintViolationException`, `HttpMessageNotReadableException`, `MissingServletRequestParameterException`, and `MethodArgumentTypeMismatchException`, returning `400 {"detail": "..."}` for each, so the frontend always sees a consistent error shape.

#### Scenario: malformed JSON returns consistent 400
- **WHEN** a request body is not valid JSON
- **THEN** the response is `400 {"detail": "Malformed request body"}` (not a 500 or stack trace)

#### Scenario: ConstraintViolationException returns 400
- **WHEN** a `@Pattern` annotation on a DTO field is violated
- **THEN** the response is `400 {"detail": "<field>: <message>"}` (not a 500)

#### Scenario: missing required query parameter returns 400
- **WHEN** a required `@RequestParam` is omitted
- **THEN** the response is `400 {"detail": "Missing required parameter: <name>"}` (not a 500)
