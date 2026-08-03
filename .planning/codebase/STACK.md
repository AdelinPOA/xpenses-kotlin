# Technology Stack

**Analysis Date:** 2026-08-03

## Languages

- Kotlin on the backend (`backend-kotlin-jpa/src/main/kotlin/`), targeting Java 21.
- TypeScript/TSX on the frontend (`frontend/app/`, `frontend/components/`, `frontend/lib/`).
- SQL migrations in `backend-kotlin-jpa/src/main/resources/db/migration/`.
- JavaScript/Node scripts in `scripts/`.

## Runtime and Build

- Backend: Spring Boot 3.4.5, Kotlin 2.4.0, Gradle Kotlin DSL, Gradle wrapper in `backend-kotlin-jpa/`.
- Frontend: Next.js 16.2.12, React 19, Node package manager with `frontend/package-lock.json`.
- Java toolchain is explicitly Java 21 in `backend-kotlin-jpa/build.gradle.kts`.
- Native build support is configured through GraalVM Native Build Tools.

## Frameworks and Dependencies

- Spring MVC, Spring Security, Spring Data JPA, Actuator, Validation, Mail, Cache, and Flyway.
- PostgreSQL driver and PostgreSQL Flyway support.
- JWT authentication via `io.jsonwebtoken`.
- Caffeine/JCache and Bucket4j for caching and rate limiting.
- OpenPDF, PDFBox, Apache POI, AWS SDK S3, and Logstash Logback encoder.
- Frontend uses TanStack Query, Axios, React Hook Form, Zod, next-intl, Tailwind CSS 4, and Lucide icons.
- Browser tests use `@playwright/test`; linting uses ESLint 10 and Next configuration.

## Configuration

- Backend defaults and environment bindings are in `backend-kotlin-jpa/src/main/resources/application.yml`.
- Docker deployment is composed by `docker-compose.yml`; backend and frontend each have a Dockerfile.
- Database schema is validated by Hibernate and migrated by Flyway; `ddl-auto` is `validate`.
- Secrets are environment-driven (`JWT_SECRET`, `ENCRYPTION_SECRET`, database credentials); `.env` exists and was not read.
- Frontend runtime URLs are configured through Next environment variables and `frontend/next.config.ts`.

## Platform Requirements

- Development requires Java 21, Node/npm, Docker for PostgreSQL and integration tests, and a reachable PostgreSQL instance.
- Production is container-oriented: PostgreSQL, Spring Boot backend on port 8080, and Next.js frontend on port 3000.

*Mapped from current repository state on 2026-08-03.*
