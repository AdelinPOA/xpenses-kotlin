## ADDED Requirements

### Requirement: Unhandled exceptions return a safe generic error

The system SHALL register a catch-all `@ExceptionHandler(Exception::class)` on the global `@RestControllerAdvice` so that any runtime exception not matched by a more specific handler (NPE, `IllegalArgumentException`, `DataIntegrityViolationException`, `StaleObjectStateException`, etc.) is converted to an HTTP `500` response with a safe, generic message. The response body SHALL NOT contain stack traces, exception class names, SQL fragments, or other internal implementation detail.

#### Scenario: Unmapped runtime exception is sanitized

- **WHEN** a request triggers a runtime exception for which no specific handler is registered
- **THEN** the system SHALL return HTTP `500` with a generic body (e.g. `{"detail": "An unexpected error occurred", "correlation_id": "<uuid>"}`) and SHALL NOT leak a stack trace or exception type to the client

### Requirement: Server errors carry a correlation ID

The system SHALL include a unique correlation ID in every catch-all `500` response and SHALL log the full exception at error level against the same correlation ID, so an operator can match a user-reported failure to a server log entry.

#### Scenario: Correlation ID links response to log

- **WHEN** the catch-all handler produces a `500`
- **THEN** the response SHALL include a `correlation_id` field
- **AND** the server log SHALL contain one error entry tagged with the same `correlation_id` and the full exception detail

#### Scenario: Specific handlers still take precedence

- **WHEN** an exception matches an existing specific handler (e.g. validation → `400`, `ResponseStatusException` → its declared status)
- **THEN** the specific handler SHALL handle it and the catch-all SHALL NOT override the status or body
