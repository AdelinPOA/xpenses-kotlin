## 1. Infrastructure Configuration

- [x] 1.1 Replace hardcoded database credentials in `docker-compose.yml` with templated environment variables (`DB_USER`, `DB_PASSWORD`, `DB_NAME`) with default values.
- [x] 1.2 Map `SPRING_PROFILES_ACTIVE` environment variable to backend service in `docker-compose.yml` to allow profile switching.

## 2. Application Properties

- [x] 2.1 Add springdoc api-docs and swagger-ui enabling flags to `backend-kotlin-jpa/src/main/resources/application.yml` mapped to the `SWAGGER_ENABLED` environment variable.

## 3. Environment Documentation

- [x] 3.1 Document `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SPRING_PROFILES_ACTIVE`, and `SWAGGER_ENABLED` environment variables in `.env.example`.

## 4. Verification

- [x] 4.1 Verify Docker Compose syntactical correctness using `docker compose config`.
- [x] 4.2 Run backend gradle tests to verify that no regressions were introduced.
