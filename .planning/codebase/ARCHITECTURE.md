# Architecture

**Analysis Date:** 2026-08-03

## System Shape

Xpenses is a containerized full-stack expense-management application with a Next.js UI, Spring Boot/Kotlin REST backend, and PostgreSQL database. `docker-compose.yml` places the three services on a private Docker network.

## Backend Layers

- Controllers in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/` define REST boundaries, authorization checks, request validation, and response shaping.
- Services in `services/` contain business workflows such as expenses, reports, OCR, FX, export, email, and storage.
- Entities in `model/` map financial and identity records through JPA.
- DTOs in `dto/` and `models/` separate HTTP payloads from persistence entities.
- Repositories in `repositories/` encapsulate Spring Data access.
- Cross-cutting behavior lives in `config/`, `security/`, and `report/` lifecycle/review packages.

## Main Data Flow

1. Next.js pages/components call typed helpers in `frontend/lib/api.ts` or `serverApi.ts`.
2. Spring controllers authenticate the request and delegate to a service.
3. Services validate domain rules, coordinate repositories and storage/providers, and map results to DTOs.
4. JPA persists to PostgreSQL; Flyway owns schema evolution.
5. Frontend TanStack Query manages server state and cache keys from `frontend/lib/queryKeys.ts`.

## Domain Workflows

- Expense/report state transitions are centralized in `report/lifecycle/ExpenseReportLifecycle.kt`.
- Review queue projections are under `report/review/`.
- FX policy is centralized in `services/FxService.kt` and applies to expenses, advances, and mileage.
- Receipt files are abstracted behind `services/storage/StorageProvider.kt` and selected by `StorageService.kt`.

## Entry Points

- JVM entry point: `XpensesApplication.kt`.
- Browser entry/layout: `frontend/app/layout.tsx` and `frontend/app/page.tsx`.
- API health probe: `controllers/HealthController.kt`.
- Container startup/build: backend and frontend Dockerfiles plus `docker-compose.yml`.

## Extension Guidance

Add a backend feature as controller → service → repository/entity/DTO, with a Flyway migration when persistence changes. Add frontend routes under `frontend/app/`, reusable UI under `frontend/components/`, and API functions under `frontend/lib/api/` or `api.ts`. Preserve lifecycle transitions in the lifecycle package instead of duplicating status mutation in controllers.

*Mapped from current repository state on 2026-08-03.*
