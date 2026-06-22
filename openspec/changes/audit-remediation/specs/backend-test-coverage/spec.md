## ADDED Requirements

### Requirement: Every backend controller has integration-test coverage

The system's test suite SHALL include at least one MockMvc integration test exercising each backend controller, covering its primary success path and its principal authorization guard. This SHALL include the currently-untested controllers: `ReportController`, `AppSettingsController`, `OcrController`, `MileageController`, `InventoryController`, `InsuranceController`, `SignatureController`, `LdapSettingsController`, `CategoryController`, and `HealthController`.

#### Scenario: Each controller is reachable by a test

- **WHEN** the test suite runs
- **THEN** every controller listed above SHALL have at least one test asserting a successful response on its primary endpoint
- **AND** at least one test asserting its role/ownership guard rejects an unauthorized caller

### Requirement: Tests are hermetic and do not call live external services

The test suite SHALL NOT depend on live external HTTP services. Tests that exercise external integrations (e.g. FX rate lookup in `FxServiceTest`) SHALL stub or mock the outbound call so the suite is deterministic and offline-runnable.

#### Scenario: FX test runs offline

- **WHEN** the test suite runs without network access
- **THEN** `FxServiceTest` SHALL pass using a stubbed/mocked HTTP response and SHALL NOT make a real outbound request

### Requirement: Test configuration is explicit

The system SHALL provide an `application-test.yml` aligned with the `@ActiveProfiles("test")` declaration so test runs use an explicit, version-controlled configuration rather than inheriting production defaults implicitly.

#### Scenario: Test profile loads dedicated config

- **WHEN** the integration test base starts the Spring context with the `test` profile
- **THEN** it SHALL load `application-test.yml`
