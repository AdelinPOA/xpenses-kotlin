# xpenses-kotlin — Agent Guide

## Before you start

- Read `HANDOFF.md` (session history) and `README.md` (up-to-date overview) at session start.
- Update both at session end and push to GitHub.

## Workflow

- **OpenSpec for features**: Run `/openspec-propose` before writing code, then `/openspec-apply-change` to implement, `/openspec-archive-change` to finalize.
- Branch as needed (no strict rule — user may commit to `main` directly).

## JDK constraint

Kotlin 2.4.0 requires **JDK 21+**. `make build` runs `check-java-version` first and fails below JDK 21. Use `.java-version` for SDKMAN!/jEnv/asdf.

## Key commands

| Command | What it does |
|---------|-------------|
| `make test` | JUnit/Testcontainers suite (needs Docker) |
| `./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'` | Single test class |
| `make build` | `./gradlew bootJar --no-daemon` (JDK 21+) |
| `make rebuild` | `docker compose up -d --build backend` |
| `make up` | `docker compose up -d --build` |
| `make logs` | `docker compose logs -f backend` |
| `make test-health` | `curl localhost:8001/api/health` |

**Frontend** (inside `frontend/`):
| Command | What it does |
|---------|-------------|
| `npm run dev -- -p 3001` | Dev server (hot reload via Turbopack) |
| `npx tsc --noEmit && npx eslint .` | TypeScript check + lint |
| `npm run build` | Production build |

## Hot-swap (preferred over Docker rebuild)

1. `docker compose up -d` (starts services)
2. `./gradlew classes processResources`
3. Backend reloads in <1s via `spring-boot-devtools` + `docker-compose.override.yml` (rename from `.example` to use locally)

## Architecture

- **Backend** (`backend-kotlin-jpa/`): Spring Boot 3.4.5 + JPA/Hibernate + Flyway (~43 source files, 15 controllers, 13 services)
- **Frontend** (`frontend/`): Next.js 15 + React 19 + Tailwind CSS v4 (CSS-first, no `tailwind.config.js`) (~60 source files)
- **OCR**: Gemini-only, multi-tier model fallback chain (no sidecar/local)
- **Ports**: Frontend 3001→3000, Backend API 8001→8080, PostgreSQL 5432 (internal)

## Backend patterns

- **`ddl-auto: validate`** — all schema changes go through Flyway migrations (`V1`–`V25`). Never edit an applied migration; add a new one.
- **Soft delete**: `@SQLDelete` + `@SQLRestriction("deleted = false")` on financial entities. `delete()` is an UPDATE, not a DELETE.
- **Controllers are thin**: read `request.getAttribute("currentUser") as? User`, delegate to service.
- **All entities** in `Models.kt`, **all repos** in `Repositories.kt` (single files). Jackson `SNAKE_CASE` by default.
- **In-memory filtering**: repo `findAll()` then filter in Kotlin (no SQL-level WHERE for most lists).
- **Rate limiting**: bucket4j on `/api/auth/login` (10/min) and `/api/auth/refresh` (5/min) by remote IP.

## Frontend patterns

- **Auth**: JWT in `access_token`/`refresh_token` httpOnly cookies. Axios `withCredentials: true`. On 401, interceptor auto-refreshes. `middleware.ts` checks cookies for protected routes.
- **API URLs**: SSR uses `INTERNAL_API_URL=http://backend:8080/api` (Docker internal). Browser uses relative `/api` (Next.js rewrites proxy to backend). Client-side API base in `lib/api.ts` uses `/api` in browser, `INTERNAL_API_URL` on server.
- **File downloads**: `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL` → synthetic click. Never `<a href>` for authenticated endpoints.
- **Dark mode**: `.dark` class on `<html>`. `@custom-variant dark` in `globals.css`.
- **Tailwind v4**: CSS-first config (no `tailwind.config.js`).
- **Output**: `output: "standalone"` in `next.config.ts` — Docker image runs `server.js` directly.
- **PWA**: `public/sw.js` + `public/manifest.json`. Middleware bypasses auth for these static paths.

## Testing quirks

- **`IntegrationTestBase`**: `@SpringBootTest(MOCK)`, `@Transactional`, `@AutoConfigureMockMvc`, `PostgreSQLContainer`.
- **`TestAuthHelper.loginAs(username, pw)`** returns the `access_token` cookie for MockMvc requests.
- FX/OCR/email services are mocked via `@MockitoBean`.
- Requires Docker (Testcontainers starts throwaway PostgreSQL).
- CI runs 4 jobs: Gitleaks → Kotlin test+build → Frontend tsc+lint+build → Docker compose build.

## Environment

Key vars (see `.env.example`): `JWT_SECRET` (required), `COOKIE_SECURE=true` (prod, Cloudflare terminates TLS), `SEED_DEMO_USERS`, `CORS_ALLOWED_ORIGINS`, `DATA_DIR`. Test accounts: `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1`.

## Notable quirks

- `build.gradle.kts` sets `api.version=1.45` for Testcontainers on Docker 29+ and disables `processTestAot` (GraalVM AOT spins up a context with Docker).
- Production domain: `xpenses.nt-automation.cc`. Cloudflare Zero Trust terminates TLS at edge, forwards HTTP to origin on port 3001.
