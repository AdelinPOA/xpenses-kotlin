## Context

The application needs basic production security and configuration hygiene:
1. Hardcoded database credentials in git-tracked `docker-compose.yml` (`POSTGRES_PASSWORD=xpenses`).
2. Spring Boot running without a production profile (`SPRING_PROFILES_ACTIVE` not set, defaulting to standard dev console logging).
3. Swagger/OpenAPI endpoints publicly reachable, exposing API details.

We need to resolve these issues by introducing environment variable configurations.

## Goals / Non-Goals

**Goals:**
- Enable environment-controlled database credentials in `docker-compose.yml` with backward-compatible defaults.
- Enable `SPRING_PROFILES_ACTIVE` configuration via environment variables in the compose setup to allow the `prod` profile.
- Enable conditional toggling of Swagger/OpenAPI endpoints in `application.yml` via the environment.
- Document all environment variables in `.env.example`.

**Non-Goals:**
- Setting up HTTPS/TLS (explicitly excluded by user).
- Modifying production secrets/passwords (user operational task).
- Creating or executing cron backup schedules (user operational task, though documented).

## Decisions

### Decision 1: Use variable substitution with defaults in `docker-compose.yml`
- **Choice:** Replace hardcoded strings with `${DB_USER:-xpenses}`, `${DB_PASSWORD:-xpenses}`, and `${DB_NAME:-xpenses}`.
- **Rationale:** Ensures developers do not need to change anything to run locally, while keeping the main compose file clean of secrets and allowing production overrides in `.env`.

### Decision 2: Inject `SPRING_PROFILES_ACTIVE` in `docker-compose.yml`
- **Choice:** Add `SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-dev}` under backend environment mapping.
- **Rationale:** Exposes the active profile configuration to Spring Boot from the host's environment/`.env` file.

### Decision 3: Use Springdoc configuration flags in `application.yml`
- **Choice:** Map `springdoc.api-docs.enabled` and `springdoc.swagger-ui.enabled` to `${SWAGGER_ENABLED:true}`.
- **Rationale:** Standard, non-code mechanism to disable OpenAPI documentation generation and UI display in production. If set to `false`, endpoints simply return `404 Not Found`.

## Risks / Trade-offs

- **[Risk]** Misaligned database credentials between `db` and `backend` services.
  - *Mitigation:* Both services use the same environment variables (`DB_USER`, `DB_PASSWORD`, `DB_NAME`) for their credentials in `docker-compose.yml`.
- **[Risk]** Disabling Swagger in production hides API documentation from legitimate developers.
  - *Mitigation:* Default to `true` so development remains unaffected, requiring an explicit `false` setting in the production-specific `.env`.
