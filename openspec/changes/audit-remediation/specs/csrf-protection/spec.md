## ADDED Requirements

### Requirement: State-changing requests are protected against CSRF

Because the system authenticates with cookies (`access_token` + `refresh_token`), it SHALL protect all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) against cross-site request forgery. Protection SHALL be implemented by at least one of: a CSRF token bound to the session/cookie that the client must echo, or `SameSite=Strict` cookies combined with server-side `Origin`/`Referer` verification. `SameSite=Lax` alone SHALL NOT be relied upon.

#### Scenario: Forged cross-origin state change is rejected

- **WHEN** a state-changing request arrives without a valid CSRF token (or with a disallowed `Origin` under the SameSite+Origin approach)
- **THEN** the system SHALL reject it with HTTP `403` and SHALL NOT mutate any persisted state

#### Scenario: Legitimate same-origin request succeeds

- **WHEN** the first-party frontend issues a state-changing request carrying the expected CSRF token / allowed `Origin`
- **THEN** the system SHALL process it normally

#### Scenario: Safe methods are unaffected

- **WHEN** a `GET` or other safe, idempotent request is made
- **THEN** CSRF protection SHALL NOT block it
