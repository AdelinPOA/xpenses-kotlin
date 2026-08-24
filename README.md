# Xpenses

Xpenses is an expense-management application for service teams. Technicians capture expenses and receipts, OCR extracts receipt data, reports group expenses for submission, and managers review, approve, reject, and track reimbursement-related work.

The repository is a modular monolith with a Kotlin/Spring backend, a Next.js frontend, PostgreSQL as the system of record, Redis for distributed runtime state, and Docker Compose for local and production-style deployments.

> Repository: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin)  
> Live application: [xpenses.nt-automation.cc](https://xpenses.nt-automation.cc/)

## Table of contents

- [Product scope](#product-scope)
- [Repository facts](#repository-facts)
- [Architecture](#architecture)
- [Domain model](#domain-model)
- [Repository layout](#repository-layout)
- [Request and data flows](#request-and-data-flows)
- [Prerequisites](#prerequisites)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Database and migrations](#database-and-migrations)
- [Testing and verification](#testing-and-verification)
- [Docker deployment](#docker-deployment)
- [CI pipeline](#ci-pipeline)
- [Security model](#security-model)
- [Storage, OCR, and ingestion](#storage-ocr-and-ingestion)
- [AI-agent contribution guide](#ai-agent-contribution-guide)
- [Current architecture priorities](#current-architecture-priorities)
- [Documentation maintenance](#documentation-maintenance)

## Product scope

### Core workflows

1. A user creates an expense manually or uploads a receipt.
2. OCR extracts merchant, amount, currency, date, category, and raw receipt text when possible.
3. The receipt is stored and linked to the expense.
4. Expenses can be grouped into an expense report.
5. The report is submitted for review.
6. A manager reviews, approves, or rejects the report.
7. Approved reports can continue through payment/export workflows.

### Main capabilities

- Authentication with access and refresh tokens stored in cookies.
- Role-based application behavior for technicians, managers, finance, and administrators.
- Expense and receipt CRUD operations.
- Single and bulk receipt upload.
- OCR with a primary provider and fallback processing.
- Expense reports with draft, submitted, approved, rejected, and payment-related states.
- Advance payments and mileage records.
- Currency conversion and EUR-based calculations.
- PDF, Excel, and CSV export capabilities.
- Local filesystem and S3-compatible object storage.
- IMAP-based ingestion for incoming expense information.
- Manager approval and review workflows.
- Internationalized frontend copy with translation-parity checks.
- Responsive desktop and mobile UI.

## Repository facts

| Area | Technology / rule |
|---|---|
| Backend | Kotlin, Java 21, Spring Boot 3.4, Spring MVC, Spring Security, Spring Data JPA |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query |
| Database | PostgreSQL 16 |
| Migrations | Flyway SQL migrations |
| Runtime state | Redis 7.4; Caffeine/JCache for local caching where appropriate |
| Authentication | JWT access/refresh tokens, secure production cookies |
| OCR | Configurable OCR providers with fallback behavior and caching/comparison records |
| File storage | Local storage and S3-compatible storage |
| Deployment | Docker Compose with backend, frontend, PostgreSQL, and Redis |
| Backend build | Gradle wrapper in `backend-kotlin-jpa/` |
| Frontend package manager | npm with `frontend/package-lock.json` |
| E2E testing | Playwright, including mobile Chromium and WebKit projects |
| Accessibility | axe checks in the frontend test suite |
| Secret scanning | Gitleaks in GitHub Actions |

## Architecture

Xpenses is a modular monolith. Backend modules run in one Spring Boot application and share the deployment unit, but responsibilities should remain separated by domain concept.

### Logical bounded contexts

- **Identity** — users, roles, authentication, JWT lifecycle, cookies, and authorization.
- **Expenses** — expense lifecycle, receipt attachment, validation, ownership, and editing rules.
- **Reports** — report lifecycle, submission, manager review, approval, rejection, and payment state.
- **OCR and ingestion** — receipt scanning, OCR fallback, mailbox polling, idempotency, and retry state.
- **Storage** — local/S3 providers, path containment, file validation, receipt persistence, and migrations between providers.
- **FX and mileage** — exchange rates, EUR conversion, mileage calculations, and rate snapshots.
- **PDF and export** — PDF generation, Excel/CSV exports, and export-specific formatting.
- **Admin and configuration** — application settings, categories, company configuration, and operational controls.

### Architectural rules

1. Controllers are HTTP adapters. They should validate transport input, call the appropriate domain module, and construct the HTTP response.
2. Business rules belong in domain services or dedicated domain modules, not duplicated across controllers.
3. Storage providers must be accessed through the storage abstraction; callers must not reimplement path, extension, size, or magic-byte rules.
4. Authorization must be explicit and consistent for both reads and mutations.
5. External provider calls must not hold database transactions open.
6. Distributed work must be idempotent and safe when more than one backend replica performs polling or processing.
7. Database schema changes must be delivered through Flyway migrations.
8. Public behavior changes require tests at the highest practical seam: service tests for business rules, HTTP tests for contracts, and Playwright for user-visible behavior.
9. Production secrets must be supplied through environment configuration; development defaults must not become production fallbacks.
10. Keep domain terminology stable. When a new concept is introduced, update this README and the project glossary/documentation together.

## Domain model

The central relationship is:

```text
User
 ├── owns Expense records
 ├── submits ExpenseReport records
 └── participates in approval/payment actions

ExpenseReport
 ├── contains Expense records
 ├── may contain AdvancePayment records
 └── may contain MileageRecord records

Expense
 ├── belongs to a User
 ├── optionally belongs to an ExpenseReport
 ├── belongs to a Category
 └── owns one or more Receipt records
```

### Important persistence concepts

- `users` — identity, role, account status, and user settings.
- `expense_reports` — report ownership, date range, status, totals, approval, payment, and rejection information.
- `expenses` — original amount/currency, converted EUR amount, tax, merchant, date, category, status, and OCR text.
- `receipts` — stored receipt objects linked to expenses.
- `categories` — configurable expense categories and optional limits.
- `fx_rates` — dated exchange-rate snapshots.
- `advance_payments` — advance/payment records associated with reports and users.
- `mileage_records` — mileage calculation inputs and persisted results.
- `refresh_tokens` — hashed refresh-token persistence.
- `app_settings` — application-level settings.
- OCR, IMAP, rate-limit, and storage-migration ledger tables — durable state for safe retries and multi-instance processing.

### Expense and report state changes

Do not introduce a new state casually. First find the existing state constants, transition checks, API DTOs, frontend filters, translations, and tests. A state change usually affects backend validation, permissions, list filters, exports, and Playwright assertions.

## Repository layout

```text
xpenses-kotlin/
├── backend-kotlin-jpa/
│   ├── build.gradle.kts
│   ├── gradlew
│   └── src/
│       ├── main/kotlin/eu/nt/xpenses/
│       │   ├── controllers/       # HTTP adapters
│       │   ├── services/          # domain/application modules
│       │   ├── security/          # authentication and request protection
│       │   ├── ingestion/         # IMAP and external ingestion
│       │   ├── model/             # persistence and transport models
│       │   └── ...
│       ├── main/resources/
│       │   ├── application.yml
│       │   └── db/migration/       # Flyway migrations
│       └── test/                  # Kotlin/JUnit tests
├── frontend/
│   ├── app/                       # Next.js routes and page entry points
│   ├── components/                # reusable UI and feature components
│   ├── lib/                       # API clients, query keys, and shared helpers
│   ├── tests/                     # Playwright and accessibility tests
│   ├── package.json
│   └── playwright.config.*
├── scripts/                       # repository-level verification scripts
├── openspec/                      # feature proposals and implementation tasks
├── docs/                          # plans, ADRs, and supporting documentation
├── docker-compose.yml             # local/production-style service topology
└── .github/workflows/ci.yml       # build, test, security, and Docker CI
```

The exact package or component path may evolve. When updating this section, prefer the current directory tree and domain ownership over preserving historical names.

## Request and data flows

### Normal expense creation

```text
Browser
  → Next.js page/component
  → frontend API client
  → Spring controller
  → authentication + authorization
  → Expense domain module
  → PostgreSQL
  → response DTO
  → frontend query/cache refresh
```

### Receipt upload and OCR

```text
Receipt upload
  → request validation and rate limit
  → OCR module
  → provider/cache/fallback processing
  → Expense domain module
  → Storage module
  → Receipt persistence
  → draft Expense response
```

Provider calls should remain outside long database transactions. OCR failures should be represented as recoverable user-facing results where the workflow supports manual completion.

### Multi-instance background work

```text
Scheduler / worker
  → deterministic message or file key
  → PostgreSQL claim ledger
  → process once or retry within the attempt limit
  → mark processed/completed or failed
```

The claim must be conflict-safe. A second replica must not duplicate successful work merely because it observed the same mailbox message or storage path.

## Prerequisites

For local development, install:

- Java 21 JDK.
- Node.js 22 and npm.
- Docker Engine with Docker Compose.
- Git.

PostgreSQL and Redis are supplied by Docker Compose. Running them natively is possible, but the application configuration must point to the matching local endpoints.

## Local development

### Option A: run the complete stack with Docker Compose

Create a local `.env` file containing the required secrets and database settings. Do not commit it.

```bash
docker compose up -d --build
docker compose ps
```

Default local endpoints from `docker-compose.yml`:

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:8001`
- Backend health: `http://localhost:8001/api/health`
- PostgreSQL: exposed to the Compose network as `db:5432`
- Redis: exposed to the Compose network as `redis:6379`

Follow logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Stop the stack without deleting persistent volumes:

```bash
docker compose down
```

### Option B: run backend and frontend from source

Start PostgreSQL and Redis first, then configure the backend environment for local endpoints.

Backend:

```bash
cd backend-kotlin-jpa
./gradlew bootRun
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

The frontend normally runs on `http://localhost:3000` when started directly. Keep the API URL consistent with the backend port used by your local setup.

### Makefile shortcuts

A `Makefile` wraps the most common operations:

| Command | Purpose |
|---|---|
| `make up` | Build and start the full Docker Compose stack |
| `make down` | Stop the stack |
| `make rebuild` | Rebuild and restart only the backend service |
| `make logs` | Follow backend logs |
| `make build` | Build the backend bootJar (checks JDK 21 first) |
| `make test` | Run the backend test suite |
| `make test-health` | Smoke-test the running backend health endpoint |
| `make test-login` / `make test-expenses` | Curl-based login and authenticated API checks against a locally running stack |

### Useful backend commands

```bash
cd backend-kotlin-jpa
./gradlew test
./gradlew bootJar
./gradlew clean test
```

### Useful frontend commands

```bash
cd frontend
npm ci
npx tsc --noEmit
npm run lint
npm run i18n:check
npm run build
npm run test:e2e
npm run test:e2e:mobile
```

## Configuration

The backend reads configuration from `application.yml` and environment variables. Values below are the important operational settings; check the current configuration file before adding a new variable.

### Required or production-critical variables

| Variable | Purpose | Production guidance |
|---|---|---|
| `JWT_SECRET` | Signs authentication tokens | Required; use a strong unique secret; never use an empty/default value |
| `ENCRYPTION_SECRET` | Encrypts protected application data | Required; preserve it across deployments |
| `CORS_ALLOWED_ORIGINS` | Allowed browser origins | Set only trusted frontend origins |
| `DB_USER` | PostgreSQL username | Use a non-default production account |
| `DB_PASSWORD` | PostgreSQL password | Use a secret manager or protected environment file |
| `DB_NAME` | PostgreSQL database name | Must match the database and JDBC configuration |
| `SPRING_PROFILES_ACTIVE` | Active Spring profile | Use the intended production profile in production |
| `REDIS_URL` | Redis connection URL | Point to the production Redis service |
| `TRUSTED_PROXY_ADDRESSES` | Proxies allowed to provide forwarded client IP headers | List only known reverse proxies |

### Optional operational variables

| Variable | Purpose |
|---|---|
| `SEED_DEMO_USERS` | Enables demo-user seeding; keep disabled for normal production operation |
| `RATE_LIMITING_ENABLED` | Enables request rate limiting |
| `RATE_LIMITING_STORE` | Selects memory or Redis-backed rate-limit state |
| `RATE_LIMITING_FAIL_CLOSED` | Determines behavior when the distributed store is unavailable |
| `RATE_LIMITING_MAX_TRACKED_KEYS` | Bounds in-memory identity state |
| `SWAGGER_ENABLED` | Enables OpenAPI/Swagger endpoints |
| `COMPANY_NAME` | Company display name |
| `IMAP_POLL_INTERVAL` | Mailbox polling interval |
| `OCR_CACHE_RETENTION_DAYS` | OCR comparison/cache retention |
| `OCR_CACHE_CLEANUP_INTERVAL` | OCR cleanup interval |
| `OCR_CACHE_CLEANUP_BATCH_SIZE` | Cleanup batch size |

Never document real secret values. Use placeholders such as `<set-in-secret-manager>` in examples.

## Database and migrations

- PostgreSQL is the source of truth for business data and durable processing state.
- Hibernate uses `ddl-auto: validate`; it must not silently create or mutate the schema.
- Schema changes belong in `backend-kotlin-jpa/src/main/resources/db/migration/`.
- Use the next Flyway version and a descriptive filename, for example `V101__add_example_field.sql`.
- Keep migrations forward-only and safe to run in every environment.
- Add indexes for new high-volume lookup paths when justified by query behavior.
- Update affected entities, DTOs, services, controllers, exports, and tests in the same change.
- Never edit an already-applied migration to repair production history. Add a new migration.
- For operational backups, `scripts/backup-db.sh` runs `pg_dump` against the running Compose database container and prunes dumps past a retention window. It is configurable via environment variables (`BACKUP_DIR`, `DB_CONTAINER`, `DB_USER`, `DB_NAME`, `RETENTION_DAYS`); schedule or wrap it per your deployment requirements.

Before merging a migration change, verify:

1. A clean database migrates from the beginning.
2. An existing database migrates from its current version.
3. The application starts with Hibernate validation enabled.
4. Rollout order does not require the old application and new schema to be incompatible at the same time.

## Testing and verification

### Backend

Backend tests use JUnit through Gradle and include Spring test support, security test support, and Testcontainers PostgreSQL coverage where appropriate.

```bash
cd backend-kotlin-jpa
./gradlew test
```

Prefer unit tests at the domain module interface for business rules. Use MockMvc or equivalent HTTP tests for endpoint contracts. Use Testcontainers when behavior depends on PostgreSQL semantics, migrations, locking, or SQL conflict handling.

### Frontend

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run i18n:check
npm run build
```

### Browser and mobile behavior

```bash
cd frontend
npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run test:e2e:mobile
```

Authenticated flows use environment-provided credentials when enabled. Do not commit test credentials or bypass authentication checks in application code to make tests pass.

### What to verify for a feature

- Backend business rules and authorization.
- HTTP status codes and response DTO shape.
- Database migration and persistence behavior.
- Frontend loading, empty, success, and failure states.
- Desktop and mobile layouts when the feature is user-facing.
- Translation parity for all visible strings.
- Accessibility names, keyboard behavior, and touch-target size.
- Rate limits and idempotency for externally triggered or background work.
- Docker build/startup if runtime wiring changed.

## Docker deployment

The Compose topology contains four services:

```text
frontend → backend → PostgreSQL
                  ↘ Redis
```

The backend depends on healthy PostgreSQL and Redis services. Persistent volumes are used for:

- `pgdata` — PostgreSQL data.
- `redisdata` — Redis append-only data.
- `xpenses-data` — backend local storage data.

Build and start:

```bash
docker compose build
docker compose up -d
```

Inspect health and logs:

```bash
docker compose ps
docker compose logs --tail=200 backend
curl -f http://localhost:8001/api/health
```

For production, verify secrets, CORS, secure cookies, trusted proxy configuration, storage location, database backups, Redis persistence, migration status, and reverse-proxy routing before considering a deployment complete.

## CI pipeline

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

Current checks include:

1. **Gitleaks** — scans repository history/content for leaked secrets.
2. **Kotlin backend** — JDK 21 setup, Gradle tests, and `bootJar` build.
3. **Frontend** — npm install, TypeScript check, translation parity, lint, production build, Playwright browser installation, and mobile UI/accessibility tests.
4. **Docker** — builds the Compose images after backend and frontend jobs pass.

A pull request is not complete merely because the code compiles. Review the behavior covered by the change, inspect failed Playwright artifacts when available, and verify operational configuration for production-sensitive changes.

## Security model

Security-sensitive behavior is part of the architecture, not an optional follow-up.

### Authentication and secrets

- Production authentication cookies must be secure.
- JWT signing and encryption secrets must be explicit production configuration.
- Refresh tokens are persisted as hashes, not reusable plaintext tokens.
- Secrets belong in environment configuration or a secret manager, never in source, README examples, fixtures, or logs.

### Authorization

Every read and mutation must consider the current user, ownership, and role. Do not rely on frontend visibility as an authorization control. Enforce access in the backend domain module.

### Request protection

- Rate limits protect login, token refresh, OCR, expense scanning, and report-export workloads.
- The Redis-aware custom filter is the authoritative application-level limiter.
- Forwarded client IP headers are trusted only from configured proxies.
- In-memory identity state is bounded and expires.
- Protected path matching must avoid prefix collisions.

### File and storage protection

- Resolve storage paths through the canonical containment logic.
- Reject traversal, absolute-path escape, and symlink escape attempts.
- Validate file size, extension, and content/magic bytes at the storage seam.
- Do not concatenate user-controlled filenames into filesystem paths directly.

### Background work

Mailbox ingestion and storage migration use durable ledgers so retries are bounded and duplicate processing is prevented across replicas. Preserve this behavior when changing worker code.

## Storage, OCR, and ingestion

### Storage providers

The storage module supports local and S3-compatible providers. Callers should depend on storage operations, not provider-specific path or SDK behavior.

Storage changes must preserve:

- path containment;
- filename and content validation;
- receipt/signature context rules;
- stable object naming;
- migration progress and retry state;
- compatibility with existing receipt records.

### OCR

OCR can involve external provider calls, fallback processing, caching, and comparison records. Keep external calls outside database transactions and make failures recoverable where the user can manually complete the expense.

When modifying OCR:

- preserve the stable service interface used by callers;
- keep rate limiting and budget controls inside the OCR module where possible;
- avoid holding database connections while waiting on providers;
- test provider success, fallback, timeout, malformed output, and cache behavior.

### IMAP ingestion

Incoming messages require a deterministic identity key, normally based on `Message-ID` with a safe fallback. Claim, process, and mark the message through the PostgreSQL ledger. A failed message may be retried only within the configured attempt limit.

## AI-agent contribution guide

This section is intentionally explicit so an AI coding agent can work safely in the repository.

### Before changing code

1. Read this README and any relevant `CONTEXT.md` or ADR in `docs/adr/`.
2. Inspect recent commits and existing tests around the target module.
3. Identify the user-visible behavior, domain rule, persistence change, and operational impact.
4. Search for all callers, DTOs, frontend API functions, translations, and tests before editing a shared contract.
5. Check whether an existing module already owns the rule. Do not create a second implementation.

### During implementation

- Keep changes focused and incremental.
- Preserve existing API contracts unless the task explicitly requires a breaking change.
- Prefer a deep domain module with a small stable interface over controller logic duplicated across endpoints.
- Keep adapters thin and provider-specific code behind the owning module.
- Use existing naming, error, authorization, and i18n conventions.
- Add or update tests in the same change.
- Add migrations rather than changing applied migration history.
- Do not weaken security, disable validation, skip tests, or add secret defaults to unblock a build.

### After implementation

Run the narrowest relevant tests first, then the broader verification sequence:

```bash
cd backend-kotlin-jpa && ./gradlew test
cd ../frontend && npx tsc --noEmit && npm run lint && npm run i18n:check && npm run build
```

For UI work, run the relevant Playwright projects. For Docker or configuration work, build and health-check the affected services. Report exactly what was run and what was not run.

### Change-impact checklist

| Change | Also inspect |
|---|---|
| New backend field | Entity, migration, DTO, mapper, service, controller, exports, frontend type, translations, tests |
| New expense/report state | Transition rules, authorization, filters, labels, exports, mobile UI, API tests, E2E tests |
| Receipt/storage change | Storage context rules, local/S3 providers, path safety, MIME/magic-byte checks, migration behavior |
| OCR change | Provider adapter, cache, fallback, rate limit, transaction boundary, error state, cost/budget behavior |
| Auth change | Cookies, JWT config, refresh-token persistence, CORS, proxy headers, security tests, production env |
| New background job | Deterministic key, claim ledger, retry limit, idempotency, concurrency, metrics, failure recovery |
| Frontend visible copy | All locale files, `i18n:check`, screenshots, accessible labels, empty/loading/error states |
| API contract change | Backend DTO/controller, frontend API client, query keys, mocks, integration/E2E tests |

### Never do without explicit approval

- Delete or rewrite applied migrations.
- Remove authorization checks.
- Commit secrets or production credentials.
- Disable Gitleaks, CI, security tests, or migration validation.
- Change production deployment topology as a side effect of an unrelated feature.
- Perform broad refactors while implementing a narrow bug fix.

## Current architecture priorities

Recent hardening work completed:

- Dashboard endpoints use SQL aggregates (`SUM`, grouped category spend) instead of hydrating month-wide expense entities.
- Application settings (daily allowance, mileage rates, FX margins, storage migration status, receipt orphan handling) are owned by `AppSettingsService`; controllers no longer access repositories directly.
- Settings transport DTOs live in `dto/settings`, shared correctly between controller and service.

The next architectural/product priorities are:

1. Deepen the Expense lifecycle into a single authoritative `ExpenseService` so receipt handling, authorization, listing, export, and download rules do not drift across controllers.
2. Polish the manager review workflow so the dashboard acts as a work hub, `/approvals` is the focused review queue, and `/reports` remains the report browser/archive.
3. Add focused deployed-environment verification for Redis failover behavior, background-job retries, migration recovery, and production configuration. A Compose smoke job in CI (build the stack, wait for health, exercise login + an authenticated read) is the foundation for this.

Update this section when priorities change. Link the relevant issue, ADR, or pull request instead of allowing this list to become an untracked roadmap.

## Documentation maintenance

Update this README when any of the following changes:

- a service, port, prerequisite, or startup command changes;
- a required environment variable is added, removed, or renamed;
- a domain state or bounded context changes;
- a security invariant changes;
- a CI job or required verification command changes;
- a migration or background-processing contract changes;
- an AI-agent contribution rule is learned from a production incident or review.

Keep explanations close to the owning code when behavior is subtle. Use this README for stable repository-level orientation, not for temporary task notes or secrets.
