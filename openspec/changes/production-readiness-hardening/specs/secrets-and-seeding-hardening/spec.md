## ADDED Requirements

### Requirement: JWT secret has no default and fails fast when unset
The application SHALL NOT provide a default value for `JWT_SECRET`. If the environment variable is unset at startup, the application SHALL fail to boot with a clear error message.

#### Scenario: startup without JWT_SECRET
- **WHEN** the application starts without `JWT_SECRET` set
- **THEN** startup aborts with an error mentioning `JWT_SECRET` is required

#### Scenario: startup with JWT_SECRET set
- **WHEN** the application starts with `JWT_SECRET` set to a non-empty value
- **THEN** the application boots normally and signs tokens with the provided secret

### Requirement: Demo admin users seeded only when explicitly enabled
`DataInitializer` SHALL seed test user accounts (`tech1`, `manager1`, `cfo1`, `mod1`) only when the `SEED_DEMO_USERS` property is `true`. When unset or `false`, no demo users are created. Categories and mileage-rate reference data SHALL continue to seed unconditionally.

#### Scenario: empty production database gets no demo users
- **WHEN** the application starts against an empty database with `SEED_DEMO_USERS` unset (or `false`)
- **THEN** no `tech1`, `manager1`, `cfo1`, or `mod1` accounts are created

#### Scenario: development setup seeds demo users
- **WHEN** the application starts with `SEED_DEMO_USERS=true`
- **AND** the user table is empty
- **THEN** the four demo accounts are created with their default passwords

### Requirement: UserResponse does not leak signature filesystem path
`UserResponse` SHALL expose a `has_signature: Boolean` field instead of the absolute `signature_path` string. The frontend SHALL determine signature presence from `has_signature`.

#### Scenario: login response has_signature boolean
- **WHEN** a user logs in via `POST /api/auth/login`
- **THEN** the response JSON includes `has_signature` (boolean) and does NOT include `signature_path`

#### Scenario: user with a signature reports true
- **WHEN** a user has uploaded a signature
- **THEN** their `UserResponse.has_signature` is `true`

### Requirement: Gemini API key sent via header, not URL query string
`OcrService` SHALL transmit the Gemini API key via the `x-goog-api-key` HTTP header on all Gemini requests, never as a URL query parameter.

#### Scenario: Gemini request uses header auth
- **WHEN** `OcrService` calls the Gemini endpoint
- **THEN** the HTTP request includes header `x-goog-api-key: <key>` and the URL contains no `key=` query parameter
