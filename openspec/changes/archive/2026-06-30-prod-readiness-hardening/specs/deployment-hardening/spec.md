## ADDED Requirements

### Requirement: Parameterized Database Credentials
The system SHALL read database connection username, password, and database name from environment variables `DB_USER`, `DB_PASSWORD`, and `DB_NAME` respectively in `docker-compose.yml`, falling back to `xpenses` if not specified.

#### Scenario: Defaults used in development
- **WHEN** the application starts via Docker Compose without `DB_USER`, `DB_PASSWORD`, and `DB_NAME` environment variables
- **THEN** the backend SHALL successfully connect to the database using the username `xpenses`, password `xpenses`, and database `xpenses`

#### Scenario: Custom credentials in production
- **WHEN** the application starts with environment variables `DB_USER=prod_user`, `DB_PASSWORD=prod_secure_password`, and `DB_NAME=prod_db`
- **THEN** the backend and database containers SHALL be configured to use these values and establish a database connection successfully

### Requirement: Active Spring Logging Profile
The backend SHALL configure its active Spring profiles based on the environment variable `SPRING_PROFILES_ACTIVE`, defaulting to `dev` if not specified.

#### Scenario: Default development profile
- **WHEN** `SPRING_PROFILES_ACTIVE` is not set or set to `dev`
- **THEN** the backend SHALL start with default development configurations and console logging

#### Scenario: Production profile enabled
- **WHEN** `SPRING_PROFILES_ACTIVE` is set to `prod`
- **THEN** the backend SHALL output structured JSON logs per the production logback configuration

### Requirement: Conditional Swagger/OpenAPI Exposure
The backend SHALL conditionally enable or disable API documentation and the Swagger UI endpoints based on the `SWAGGER_ENABLED` environment variable, defaulting to `true` if not specified.

#### Scenario: Swagger enabled by default
- **WHEN** `SWAGGER_ENABLED` is not set or set to `true`
- **THEN** the endpoints `/swagger-ui/index.html` and `/v3/api-docs` SHALL be active and accessible

#### Scenario: Swagger disabled in production
- **WHEN** `SWAGGER_ENABLED` is set to `false`
- **THEN** the endpoints `/swagger-ui/index.html` and `/v3/api-docs` SHALL return 404 Not Found
