# Coding Conventions

**Analysis Date:** 2026-08-04

## Backend

- Kotlin code is organized by technical layer and domain, with constructor injection in Spring components.
- Controllers use explicit Spring MVC annotations and delegate business decisions to services.
- DTOs are grouped by domain (`dto/expense`, `dto/report`, `dto/user`) and persistence entities remain in `model/`.
- Jackson uses snake_case JSON through `application.yml`; do not rename API fields casually.
- Validation and common HTTP error translation are centralized in `config/ValidationExceptionHandler.kt`.
- Authorization is expressed through the shared `services/Authorization.kt` service and security configuration.
- Monetary values use `BigDecimal`; preserve scale and positive-rate validation when working on FX or totals.
- Use Flyway migrations for database changes and keep Hibernate `ddl-auto: validate`.

## Frontend

- App Router pages live under `frontend/app/`; interactive route logic is commonly split into `*Client.tsx` files.
- Shared components use PascalCase filenames and live under `frontend/components/`.
- Server state is managed with TanStack Query; use the factories in `frontend/lib/queryKeys.ts` for cache identity.
- HTTP access is centralized in `frontend/lib/api.ts`, `frontend/lib/api/`, and `frontend/lib/serverApi.ts`; avoid ad hoc fetch/axios calls.
- Forms generally use React Hook Form with Zod resolvers; preserve schema validation at the client boundary.
- User-facing strings belong in `frontend/messages/en.json` and `frontend/messages/ro.json` and must pass the i18n parity script.
- Formatting utilities belong in `frontend/lib/format.ts`, especially for dates and currency.

## Quality and Hygiene

- ESLint is configured in `frontend/eslint.config.mjs`.
- Repository hooks are configured in `.pre-commit-config.yaml`.
- Avoid logging credentials or reading `.env` into generated documentation.
- Keep changes scoped to the feature and update focused tests alongside behavior changes.

*Mapped from current repository state on 2026-08-04.*
