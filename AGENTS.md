# xpenses-kotlin — Agent Guide

## Before you start

- Read `HANDOFF.md` (session history) and `README.md` (up-to-date overview) at session start.
- Update both at session end and push to GitHub.

## Mandatory workflow

**Always use OpenSpec for new features.** Run `/openspec-propose` before writing code, then `/openspec-apply-change` to implement, `/openspec-archive-change` to finalize.

Create feature branches (`feat/feature-name`). Never commit to `main`.

## JDK constraint

Kotlin 2.1.0 compiles only on **JDK 21 or 22**. On JDK 23+, use Docker to build:
`make build` (runs `check-java-version` first and fails with a clear message). Use `.java-version` for SDKMAN!/jEnv/asdf.

## Key commands

| Command | What it does |
|---------|-------------|
| `make test` | Runs JUnit/Testcontainers suite (needs Docker) |
| `./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'` | Single test class |
| `make build` | `./gradlew bootJar --no-daemon` (JDK 21/22 only) |
| `make rebuild` | `docker compose up -d --build backend` |
| `make up` | `docker compose up -d --build` |
| `make logs` | `docker compose logs -f backend` |

## Hot-swap (preferred over Docker rebuild)

1. `docker compose up -d` (starts services)
2. `./gradlew classes processResources` (or on JDK 23+, compile inside a container — see README)
3. Backend reloads in <1s via `spring-boot-devtools` + `docker-compose.override.yml`

## Architecture at a glance

- **Backend**: `backend-kotlin-jpa/` — Spring Boot 3.4.5 + JPA/Hibernate + Flyway (42 source files)
- **Frontend**: `frontend/` — Next.js 15 + React 19 + Tailwind CSS v4 (CSS-first, no `tailwind.config.js`) (58+ source files)
- **OCR sidecar**: `ocr-sidecar/` — Python FastAPI + EasyOCR (internal port 5000, no host mapping)
- **MinerU OCR**: `mineru/` — opt-in via `docker compose --profile mineru up` (port 8002)

## Backend patterns

- **`ddl-auto: validate`** — all schema changes go through Flyway migrations (`V1`–`V16`). Never edit an applied migration; add a new one.
- **Soft delete**: `@SQLDelete` + `@SQLRestriction("deleted = false")` on financial entities. `delete()` is an UPDATE, not a DELETE.
- **Controllers are thin**: read `request.getAttribute("currentUser") as? User`, delegate to service. Business logic goes in `ExpenseService`/`ReportService`/etc.
- **All entities** in `Models.kt`, **all repos** in `Repositories.kt` (single files). Jackson `SNAKE_CASE` by default.
- **In-memory filtering**: repo `findAll()` then filter in Kotlin (no SQL-level WHERE for most lists).

## Frontend patterns

- **Auth**: JWT in `access_token`/`refresh_token` httpOnly cookies. Axios with `withCredentials: true`. On 401, interceptor auto-refreshes. `middleware.ts` checks cookies for protected routes.
- **API URLs**: SSR uses `INTERNAL_API_URL=http://backend:8080/api`, browser uses `NEXT_PUBLIC_API_URL=http://localhost:8001/api`.
- **File downloads**: `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL` → synthetic click. Never `<a href>` for authenticated endpoints.
- **Dark mode**: `.dark` class on `<html>`. `@custom-variant dark` in `globals.css`.

## Testing quirks

- **`IntegrationTestBase`** is the base class: `@SpringBootTest(MOCK)`, `@Transactional`, `@AutoConfigureMockMvc`, `PostgreSQLContainer`.
- **`TestAuthHelper.loginAs(username, pw)`** returns the `access_token` cookie for MockMvc requests.
- FX/OCR/email services are mocked via `@MockitoBean`.
- Requires Docker (Testcontainers starts throwaway PostgreSQL).
- CI runs 4 jobs: Gitleaks → Kotlin test+build → Frontend tsc+lint+build → Docker compose build.

## Ports

| Service | Host | Container |
|---------|------|-----------|
| Frontend | 3001 | 3000 |
| Backend API | 8001 | 8080 |
| PostgreSQL | 5432 | 5432 |
| MinerU | 8002 | 8000 |

## Environment

Key vars: `JWT_SECRET` (required), `COOKIE_SECURE`, `SEED_DEMO_USERS`, `CORS_ALLOWED_ORIGINS`, `DATA_DIR`. See `.env.example`. Test accounts: `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1`.

## Notable quirks

- `build.gradle.kts` sets `api.version=1.45` for Testcontainers on Docker 29+ and disables `processTestAot` (GraalVM AOT spins up a context with Docker).
- Rate limiting (bucket4j) on `/api/auth/login` (10/min) and `/api/auth/refresh` (5/min) by remote IP.
- `audit.md` / `auditv2.md` are historical artifacts — not authoritative.
- **Pre-hot-swap compile**: On JDK 23+, run Gradle in a JDK 21 container to compile classes for hot-swap into the running Docker backend.
