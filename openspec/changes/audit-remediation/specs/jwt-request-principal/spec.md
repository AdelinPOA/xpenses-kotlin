## ADDED Requirements

### Requirement: Authenticated principal is derived from JWT claims without a per-request DB load

The system SHALL authenticate each request from the validated `access_token` claims (user id, username, role) without issuing a database query per request to load the full `User` entity. `JwtAuthenticationFilter` SHALL populate the security context and the `currentUser`-equivalent request principal from claims. Where a controller genuinely needs the full entity, it SHALL load it explicitly rather than the filter doing so unconditionally for every request.

#### Scenario: Authenticated request performs no user-lookup query in the filter

- **WHEN** a request carries a valid `access_token`
- **THEN** the filter SHALL establish the principal (id, username, role) from the token claims
- **AND** SHALL NOT execute `userRepository.findById(...)` as part of authenticating that request

#### Scenario: Role-based authorization still enforced

- **WHEN** an endpoint requires a specific role
- **THEN** the role drawn from the JWT claims SHALL be used for the authorization decision, preserving existing `@PreAuthorize` and inline role-check behavior

#### Scenario: Invalid or expired token rejected

- **WHEN** the `access_token` is missing, malformed, or expired
- **THEN** the system SHALL respond `401` and SHALL NOT establish an authenticated principal
