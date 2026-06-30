## Why

The application needs database credential isolation, production structured logging, and the ability to disable publicly exposed Swagger/OpenAPI endpoints before a wider deployment. Currently, default development passwords and settings are hardcoded in tracked files, and the Swagger UI is open to everyone on the internet.

## What Changes

- **Parameterize Database Credentials**: Modify the main `docker-compose.yml` to use environment variables (`DB_USER`, `DB_PASSWORD`, `DB_NAME`) for database configurations, defaulting to the development credentials (`xpenses`).
- **Configure Spring Profile**: Enable the `SPRING_PROFILES_ACTIVE` environment variable to be passed through Docker Compose to the backend, enabling structured JSON logging (`prod` profile) in production.
- **Toggle Swagger/OpenAPI Exposure**: Expose `SWAGGER_ENABLED` configuration in `application.yml` so that API docs and Swagger UI can be disabled in production via the environment.
- **Document variables**: Update `.env.example` to guide users on how to define these environment variables in their environments.

## Capabilities

### New Capabilities
- `deployment-hardening`: Configure and manage environment variables for database credentials, logging profiles, and Swagger/OpenAPI endpoints.

### Modified Capabilities
- None

## Impact

- **Backend Configuration**: `backend-kotlin-jpa/src/main/resources/application.yml` is updated to map Springdoc properties to the `SWAGGER_ENABLED` environment variable.
- **Docker Compose**: `docker-compose.yml` is updated to replace hardcoded PostgreSQL credentials with environment variables, and map the active Spring profile.
- **Environment Reference**: `.env.example` is updated to document the new environment variables (`DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SPRING_PROFILES_ACTIVE`, `SWAGGER_ENABLED`).
