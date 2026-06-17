## ADDED Requirements

### Requirement: Shared UserResponse DTO in models package
A `UserResponse` data class with `fromUser(user: User)` companion factory SHALL exist in `eu.nt.xpenses.models` package, mapping fields: id, username, displayName, email, role, isActive, authSource, signaturePath, notificationsEnabled. JSON SHALL use snake_case via `@JsonProperty` annotations.

#### Scenario: UserResponse.fromUser maps User entity to DTO
- **WHEN** `UserResponse.fromUser(user)` is called on a persisted User
- **THEN** all fields are mapped 1:1 and a new UserResponse instance is returned

### Requirement: UserController returns UserResponse on all endpoints
All 6 UserController endpoints (`createUser`, `listUsers`, `getUser`, `updateRole`, `updateActive`, `updateMe`) SHALL return `UserResponse` via `UserResponse.fromUser(...)` instead of the raw User JPA entity.

#### Scenario: createUser returns UserResponse
- **WHEN** `POST /api/users` succeeds
- **THEN** the response body is `UserResponse.fromUser(saved)`

#### Scenario: listUsers returns List<UserResponse>
- **WHEN** `GET /api/users` is called
- **THEN** the response body is a list of `UserResponse.fromUser(user)` for each user

#### Scenario: getUser, updateRole, updateActive, updateMe return UserResponse
- **WHEN** any UserController endpoint resolves a User entity
- **THEN** the response body wraps it in `UserResponse.fromUser(...)`

## MODIFIED Requirements

### Requirement: AuthController uses shared UserResponse
The local `UserResponse` data class definition SHALL be removed from `AuthController.kt`. The class SHALL import and use `eu.nt.xpenses.models.UserResponse` with the `fromUser()` factory.

#### Scenario: login and getMe use fromUser factory
- **WHEN** `POST /api/auth/login` or `GET /api/auth/me` is called
- **THEN** the response uses `UserResponse.fromUser(user)` instead of the inline constructor
