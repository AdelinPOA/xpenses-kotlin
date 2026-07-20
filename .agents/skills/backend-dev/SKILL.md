---
name: backend-dev
description: Specialized context and gotchas for developing the Spring Boot/Kotlin backend. Activate this skill when working on the backend codebase.
---

# Backend Developer Skill

You are working on the Kotlin + Spring Boot 3.4 backend for xpenses-kotlin.

## Dev Environment Requirements
- **JDK 21+ required** for local builds. Use Docker-based build if host JDK mismatches.
- **Backend tests require Docker** (Testcontainers + PostgreSQL). Testcontainers API version is pinned to `1.45` in `build.gradle.kts` — do not change.
- **Hot-swapping**: Rename `docker-compose.override.yml.example` to `docker-compose.override.yml` to enable backend hot-swapping via `spring-boot-devtools`.

## Critical Gotchas & Landmines
- **Flyway**: `ddl-auto: validate`. All schema changes must be new migrations. **Never edit existing migrations**. Add V17+.
- **Soft delete**: Uses `@SQLDelete` + `@SQLRestriction("deleted = false")`. `delete()` actually does an UPDATE.
- **List Filtering**: Use SQL-level WHERE clauses via Spring Data `@Query` or method names. Do not use in-memory filtering (`findAll().filter`) for large datasets.
- **SNAKE_CASE**: Jackson global property naming is configured to SNAKE_CASE.
- **Type errors**: Never suppress type errors (`as any`/`@Suppress` equivalent) in Kotlin.
- **Controllers**: No business logic in controllers. Keep them thin and delegate to services.

## Testing Rules
- Use `IntegrationTestBase` → `@SpringBootTest(MOCK)`, `@Transactional`, `@AutoConfigureMockMvc`. 
- Use `TestAuthHelper.loginAs()` for auth.

## Commands
- **Build**: `./gradlew bootJar --no-daemon`
- **Run all tests**: `./gradlew test --no-daemon`
- **Run single test class**: `./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'`
- **Hot-swap**: `./gradlew classes processResources`
