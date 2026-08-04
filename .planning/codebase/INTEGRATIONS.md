# Integrations

**Analysis Date:** 2026-08-04

## Database

- PostgreSQL 16 is the primary store, provisioned by `docker-compose.yml`.
- JPA repositories under `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/` access domain entities.
- Flyway migrations under `backend-kotlin-jpa/src/main/resources/db/migration/` are the schema source of truth.

## Authentication and Authorization

- JWT access and refresh tokens are handled by `security/JwtTokenProvider.kt`, `security/JwtAuthenticationFilter.kt`, and `controllers/AuthController.kt`.
- Spring Security policy and CORS/CSRF behavior are configured in `config/SecurityConfig.kt`.
- LDAP is an optional administrative integration through `services/LdapService.kt` and `controllers/LdapSettingsController.kt`.

## External Services

- FX rates are fetched and cached by `services/FxService.kt`, with provider selection in `services/fx/FxRateProvider.kt`; the current policy is documented in `docs/adr/0001-bnr-fx-rates-with-margin.md`.
- Email/IMAP integrations are implemented by `services/EmailImportService.kt`, `EmailSettingsService.kt`, and `AppSettingsController.kt`.
- SMTP is configured through Spring Mail settings.
- OCR is orchestrated by `services/OcrService.kt` and `AsyncOcrService.kt`, with provider settings exposed through the admin API.
- S3-compatible object storage is implemented by `services/storage/S3StorageProvider.kt`; local storage is `LocalStorageProvider.kt`.

## HTTP API

- Backend REST endpoints are grouped under `/api` in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/`.
- Frontend calls the backend through `frontend/lib/api.ts` and server-side requests through `frontend/lib/serverApi.ts`.
- The Next.js frontend uses `INTERNAL_API_URL` for container-to-container requests and `NEXT_PUBLIC_API_URL` for browser-visible API access.

## Operations

- Actuator exposes health, info, and Prometheus endpoints according to `application.yml`.
- Docker health checks call `/api/health` and the frontend root page.
- Scheduled jobs include IMAP polling and OCR cache cleanup; inspect `EmailImportService.kt` and `OcrResultCacheCleanupService.kt` before changing scheduling.

## Integration Boundaries

- Keep network calls outside long-running database transactions where possible.
- Treat uploaded files as untrusted; storage and download behavior crosses the application/browser trust boundary.
- Do not read or commit `.env`; use `.env.example` and deployment configuration as the safe configuration reference.

*Mapped from current repository state on 2026-08-04.*
