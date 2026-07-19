# xpenses-kotlin

Kotlin + Spring Boot 3.4 backend, Next.js 15 frontend, PostgreSQL 16. Self-hosted expense management.

## Project structure

```
backend-kotlin-jpa/   # Kotlin 2.4 / Spring Boot 3.4 API (port 8001)
frontend/             # Next.js 15 + React 19 UI (port 3001 dev, 3000 prod)
AGENTS.md             # THIS FILE — root navigation only
├── backend-kotlin-jpa/AGENTS.md   # backend-specific conventions & commands
├── frontend/AGENTS.md             # frontend-specific conventions & commands
```

**Always read the sub-AGENTS.md for the package you are working in.** They contain per-package conventions, anti-patterns, and exact commands.

## Essential commands

```bash
# Development (local hot-reload)
cp .env.example .env
docker compose up -d db backend          # start DB + backend on port 8001
cd frontend && npm install && npm run dev -- -p 3001

# Backend (from repo root)
cd backend-kotlin-jpa && ./gradlew test --no-daemon                           # all tests (needs Docker)
./gradlew test --no-daemon --tests 'eu.nt.xpenses.report.ReportStateMachineTest'  # single test
./gradlew bootJar --no-daemon                                                  # build JAR
./gradlew classes processResources                                             # hot-swap into running Docker

# Frontend (from repo root)
cd frontend && npx tsc --noEmit && npm run lint   # typecheck + lint (no `npm run typecheck`)
npm run build                                      # production build

# Smoke-test running backend
make test-health    # curl /api/health
make test-login     # curl POST /api/auth/login (tech1)
```

## CI pipeline (must pass CI-checks locally)

```yaml
# backend:  ./gradlew test bootJar --no-daemon
# frontend: npm ci → npx tsc --noEmit → npm run lint → npm run build
# docker:   docker compose build
```

## Dev environment quirks

- **JDK 21+ required** for local backend builds. `.java-version`=21. Use Docker-based build if host JDK mismatches.
- **Backend tests require Docker** (Testcontainers + PostgreSQL). Testcontainers API version pinned to `1.45` in `build.gradle.kts` line 96 — do not change.
- **Dual-API URL pattern** for frontend: SSR uses `INTERNAL_API_URL=http://backend:8080/api`, browser uses `NEXT_PUBLIC_API_URL=http://localhost:8001/api`.
- **Docker Compose override** (`docker-compose.override.yml.example`) enables backend hot-swapping via `spring-boot-devtools`. Rename to `docker-compose.override.yml` to enable.
- **Flyway**: `ddl-auto: validate`. All schema changes → new migration files. Never edit existing migrations.

## Workflow

**Always use OpenSpec for feature work** — `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Available as both CLI commands and slash-commands (`.claude/commands/opsx/`).

Testing order: `code changes` → `./gradlew test` (backend) / `npx tsc --noEmit && npm run lint` (frontend) → `docker compose build`.

## Test accounts (when `SEED_DEMO_USERS=true`)

| User | Password | Role |
|------|----------|------|
| `tech1` | `tech1` | Technician |
| `manager1` | `manager1` | Manager |
| `cfo1` | `cfo1` | Chef of Finances |
| `mod1` | `mod1` | Moderator |
