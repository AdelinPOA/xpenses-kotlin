# backend-kotlin-jpa

## Overview
Spring Boot 4.1.1 / Kotlin 2.4.0 JPA backend module built with Gradle (`build.gradle.kts`, `settings.gradle.kts`, Java 21 toolchain) and packaged via `Dockerfile` / `Dockerfile.native` (GraalVM native metadata) and `deployment.yaml`. Provides REST APIs under `/api/**`, Flyway-managed PostgreSQL persistence, Redis-backed rate limiting, local/S3 storage, PDF/XLSX/CSV export, LDAP/JWT authentication, IMAP delegation ingestion, and asynchronous OCR processing.

## Subdirectories & Boundaries
- [src](./src/README.md) — Backend Kotlin source packages and Flyway SQL migrations under `src/main`
