# eu.nt.xpenses

## Overview
Root Spring Boot application package for the Xpenses Kotlin/JPA backend. Bootstraps async execution, scheduling, and caching while excluding Spring Boot's default `UserDetailsServiceAutoConfiguration` in favor of stateless JWT authentication, and coordinates all backend subpackages across configuration, controllers, DTOs, ingestion, domain models, report workflows, repositories, security, and services.

## Interface
- `[XpensesApplication.kt:XpensesApplication]` — `@SpringBootApplication(exclude = [UserDetailsServiceAutoConfiguration::class])` annotated with `@EnableAsync`, `@EnableScheduling`, and `@EnableCaching`, exposing `@JvmStatic main(args: Array<String>)`
- [config](./config/README.md) — Async executors, Caffeine JCache, security filter chain, CSRF Origin/Referer check, media disposition, data seeding, and REST exception handling
- [controllers](./controllers/README.md) — `/api/**` REST endpoints for auth, expenses, reports, OCR, advances, mileage, search, review queue, dashboard, FX, categories, insurance, signatures, users, settings, and health
- [dto](./dto/README.md) — Bean-validated request/response DTO contracts grouped by domain
- [ingestion](./ingestion/README.md) — IMAP technician delegation email polling and durable PostgreSQL ingestion ledger
- [model](./model/README.md) — JPA entities, soft-delete filters, optimistic locking, idempotency records, and OCR job state machine
- [models](./models/README.md) — Shared `PagedResponse`, `RawUpload`, and `StorageConfigDto` types
- [report](./report/README.md) — Transactional report lifecycle state machine, async notifications, and review queue reader
- [repositories](./repositories/README.md) — Spring Data JPA repositories with PostgreSQL advisory/pessimistic locks and lease-fenced CAS updates
- [security](./security/README.md) — JWT cookie authentication provider/filter and in-memory or Redis rate limiting
- [services](./services/README.md) — Core business services, FX providers, entity-to-DTO mappers, and local/S3 storage abstractions

## Invariants
- `[XpensesApplication.kt:XpensesApplication]` serves as the single `@EnableAsync` enablement point alongside `@EnableScheduling` and `@EnableCaching`, and excludes `UserDetailsServiceAutoConfiguration` so `JwtAuthenticationFilter` governs request authentication.
- Cross-package state transitions, authorization boundaries, and persistence invariants are enforced by the child [config](./config/README.md), [security](./security/README.md), [model](./model/README.md), [report](./report/README.md), [repositories](./repositories/README.md), and [services](./services/README.md) contracts.

## Side Effects
- `[XpensesApplication.kt:XpensesApplication.main]` boots the Spring application context, initializes DataSource/Flyway/JPA/Cache/Redis/async pools, and starts scheduled IMAP ingestion and OCR recovery pollers.

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests '<ClassName>' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
