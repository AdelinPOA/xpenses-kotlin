## Why

To replace the legacy Python FastAPI backend with a highly optimized, enterprise-ready, and type-safe Kotlin + Spring Boot 3.4.3 backend. This migration improves concurrency, raw performance, type safety, and standardizes our tech stack under a unified JVM environment that can compile to GraalVM Native Image for sub-second container startup times and a minimal memory footprint.

## What Changes

- **Complete Backend Rewrite**: All backend logic, models, controllers, routers, services, database queries, and scripts are ported from Python 3.12 (FastAPI) to Kotlin (Spring Boot 3.4.3 + JPA).
- **GraalVM Native Image Support**: The Spring Boot microservice will be configured for ahead-of-time (AOT) compilation to standalone native executables running in a minimal Alpine Linux container.
- **Unified Port Mapping**: The Kotlin backend will completely replace the FastAPI backend on host port `8001` to serve the Next.js frontend seamlessly.
- **Removal of FastAPI Service**: The `backend` service in `docker-compose.yml` will build from `backend-kotlin-jpa` instead of the Python context.

## Capabilities

### New Capabilities
- `kotlin-backend-migration`: Implementing all backend core domains (Authentication, Expenses CRUD, Report workflows/state machine, LDAP auth and sync, IMAP email ingestion, OCR receipt scanning, Mileage, and PDF export) in Kotlin with Spring Boot JPA.

### Modified Capabilities
<!-- No requirement changes to existing functional specifications, as they remain functionally identical. -->

## Impact

- **Backend**: Entirely replaces `/backend` with the Kotlin project under `/backend-kotlin-jpa`.
- **Database**: The database schema and migrations will now be managed by Hibernate DDL / Spring Data, and database access will use Spring Data JPA with Positional SQL placeholders.
- **Frontend**: Port `8001` will now point to the Kotlin backend. All frontend Axios requests will route directly to Spring Boot REST endpoints.
- **DevOps**: Docker Compose configuration will be updated, and the native image builder context will be established as the single source of truth for the backend service.
