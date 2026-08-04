# Repository Structure

**Analysis Date:** 2026-08-04

## Top-Level Areas

- `backend-kotlin-jpa/` — Spring Boot/Kotlin application, Gradle build, Docker packaging, and migrations.
- `frontend/` — Next.js application, UI routes, components, API clients, translations, and Playwright tests.
- `scripts/` — repository-level validation and maintenance scripts.
- `docs/adr/` — architecture decisions; current FX decision is `0001-bnr-fx-rates-with-margin.md`.
- `openspec/` — change proposals/specifications, including FX margin work.
- `.agents/`, `.codex/`, `.opencode/`, and `.pi/` — local GSD/runtime integrations; these are tooling artifacts, not application runtime code.
- `docker-compose.yml` — local/production-like service topology.

## Backend Layout

- `src/main/kotlin/eu/nt/xpenses/controllers/` — REST endpoints.
- `.../services/` — use cases and external-provider orchestration.
- `.../model/` — JPA entities.
- `.../dto/` — request/response contracts grouped by domain.
- `.../repositories/` — persistence interfaces.
- `.../config/` and `.../security/` — application/security infrastructure.
- `src/main/resources/db/migration/` — ordered Flyway SQL migrations.
- `src/main/kotlin/eu/nt/xpenses/services/fx/` — FX provider abstraction and external-rate retrieval.

## Frontend Layout

- `app/` — App Router pages and route-specific clients.
- `components/` — reusable UI, domain components, and providers.
- `lib/` — API clients, auth, query keys, formatting, and TypeScript types.
- `i18n/` and `messages/` — locale configuration and English/Romanian messages.
- `tests/` — Playwright suites grouped by feature and responsive behavior.

## Naming and Placement

Use PascalCase for React components and Kotlin classes, camelCase for functions/variables, and domain-specific folders for DTOs and tests. Keep API query-key construction centralized in `frontend/lib/queryKeys.ts`. Put schema changes in a new numbered Flyway migration rather than editing applied migrations.

## Important Files

- `backend-kotlin-jpa/build.gradle.kts` — backend dependencies/toolchain.
- `backend-kotlin-jpa/src/main/resources/application.yml` — runtime defaults and environment bindings.
- `frontend/package.json` — frontend commands/dependencies.
- `frontend/playwright.config.ts` — browser test projects and server startup.
- `.env.example` — safe environment variable reference.

*Mapped from current repository state on 2026-08-04.*
