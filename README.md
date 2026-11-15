# Xpenses

Expense management for field-service teams. Technicians record expenses and receipts, submit expense reports, and track advances and mileage. Managers and `chef_finance` review, approve and reject reports; `chef_finance` alone can mark approved reports as paid. Moderators manage application settings and integrations.

This is the consolidated project reference, updated for the **2026-11-14** (`34aa5f8`) baseline. Read [HANDOFF.md](HANDOFF.md) for source-versus-production provenance, live deployment pointers, and verification snapshots.

- [System Overview](#system-overview)
- [Subdirectories & System Boundaries](#subdirectories--system-boundaries)
- [Architecture and source map](#architecture-and-source-map)
- [Domain language](#domain-language)
- [Global Invariants](#global-invariants)
- [Global Side Effects](#global-side-effects)
- [Development and deployment](#development-and-deployment)
- [Configuration](#configuration)
- [System Verification](#system-verification)
- [Verification and CI](#verification-and-ci)
- [Current limitations](#current-limitations)
- [Historical archives](#historical-archives)

Repository: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin). Production hostname used by repository configuration: `xpenses.nt-automation.cc`.

<!-- BEGIN:XPENSES_AUTOSYNC:TELEMETRY -->
| Telemetry Metric | Live Repository State |
|---|---|
| **Git Baseline** | `main` @ `0314411` |
| **Flyway Migrations** | 39 scripts (latest: `V107__refresh_token_rotation_grace.sql`) |
| **Backend Controllers** | 19 `*Controller.kt` files |
| **Frontend Routes** | 31 Next.js `page.tsx` routes |
| **Compose Services** | `db`, `redis`, `backend`, `frontend` |
<!-- END:XPENSES_AUTOSYNC:TELEMETRY -->

## System Overview

Xpenses is a two-tier expense management system composed of a Spring Boot 4.1.1 / Kotlin 2.4.0 JPA backend (`backend-kotlin-jpa`), a Next.js 16.4.3 / React 19 App Router PWA frontend (`frontend`), and operational/CI verification utilities (`scripts`). PostgreSQL 16 (Flyway-managed, `V1`–`V107`) serves as the durable relational store, Redis 7.4 provides optional distributed rate-limiting storage, and local filesystem or S3-compatible object storage holds receipts, signatures, insurance files, and staged OCR uploads. Asynchronous workflows include bounded-lease OCR job processing (`OCR` → `EXPENSE` → `RECEIPT`) and durable IMAP technician delegation email ingestion.

## Subdirectories & System Boundaries

- [backend-kotlin-jpa](./backend-kotlin-jpa/README.md) — Spring Boot / Kotlin JPA backend (`/api/**` REST controllers, security/JWT/rate limiting, Flyway SQL migrations `V1`–`V107`, report lifecycle, IMAP ingestion ledger, FX providers, local/S3 storage, and async OCR services)
- [frontend](./frontend/README.md) — Next.js App Router PWA frontend (route pages, feature components, `next-intl` `en`/`ro` localization, single-flight Axios/SSR transport, IndexedDB offline/OCR queues, and v9 Service Worker)
- [scripts](./scripts/README.md) — Operational and CI verification scripts (`backup-db.sh`, `check-format-currency.mjs`, `check-i18n-parity.mjs`, `check-npm-audit.mjs`, `run_graphify_full.py`, `verify-ocr-restart.py`)
- [skills/mobile-pwa-qa](./skills/mobile-pwa-qa/SKILL.md) — Manual mobile/PWA QA checklist and acceptance boundaries
- `docs/`, `openspec/`, `roadmap/` — Architecture decision records (`docs/adr/`), verification contracts (`docs/contracts/`), designs, OpenSpec specs, and historical archives (documentation-only; no source code contracts)

## Architecture and source map

The backend is one Spring Boot application with shared PostgreSQL persistence. The frontend uses the Next.js App Router. Compose defines four services: `frontend`, `backend`, `db`, and `redis`.

| Area | Checked configuration | Source |
| --- | --- | --- |
| Backend | Kotlin 2.4.0; Spring Boot 4.1.1 / Spring Framework 7; Java toolchain 21; MVC, Security, JPA | [Gradle build](backend-kotlin-jpa/build.gradle.kts) |
| Frontend | Next.js 16.4.3; React 19; TypeScript; Tailwind CSS 4; TanStack Query 5 | [package manifest](frontend/package.json), [lockfile](frontend/package-lock.json) |
| Data | PostgreSQL 16; Redis 7.4 with append-only persistence | [Compose](docker-compose.yml) |
| Schema | Flyway SQL; Hibernate `ddl-auto: validate`; batch fetch size 16 | [application configuration](backend-kotlin-jpa/src/main/resources/application.yml) |
| Exports | PDF via OpenPDF/PDFBox; XLSX via Apache POI; CSV | [Gradle build](backend-kotlin-jpa/build.gradle.kts), [export service](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExportService.kt) |
| Packaging | Backend executable JVM JAR; frontend standalone Node server; Node 22 build/runtime image | [backend Dockerfile](backend-kotlin-jpa/Dockerfile), [frontend Dockerfile](frontend/Dockerfile) |

```text
Browser → frontend /api rewrite → backend → PostgreSQL
                                         → Redis (when selected by runtime configuration)
                                         → filesystem or S3-compatible storage
                                         → configured AI, FX, LDAP, SMTP and IMAP integrations
```

Browser API requests use relative `/api`; server-side requests use `INTERNAL_API_URL`. The frontend rewrite defaults to `http://backend:8080/api`, appropriate inside Compose. See [API client](frontend/lib/api.ts), [server client](frontend/lib/serverApi.ts), and [Next configuration](frontend/next.config.ts).

| Code area | Location |
| --- | --- |
| HTTP endpoints | [controllers](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/) |
| Application services | [services](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/) |
| Report transitions and review queue | [report](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/) |
| Authentication and request protection | [security](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/), [SecurityConfig](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt) |
| Durable mailbox ingestion | [ingestion](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ingestion/) |
| SQL migrations | [migration directory](backend-kotlin-jpa/src/main/resources/db/migration/) |
| Pages, components, API contracts | [app](frontend/app/), [components](frontend/components/), [lib](frontend/lib/) |
| Automated tests | [backend tests](backend-kotlin-jpa/src/test/), [browser tests](frontend/tests/) |
| Design decisions | [ADRs](docs/adr/) |

### Expense, receipt and report flows

Manual entry, receipt capture, and bulk upload are separate implemented paths. The form stages manual saves in a local recovery queue; asynchronous capture uses durable backend OCR jobs. Do not infer identical retry or offline behavior across these paths. See [ExpenseForm](frontend/components/expenses/ExpenseForm.tsx), [capture page](frontend/app/expenses/capture/page.tsx), and [BulkExpenseController](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/BulkExpenseController.kt).

Single-receipt capture defaults to durable acceptance → immediate Expense review → explicit versioned confirmation; verification is independent of financial status and never submits a Report. Interrupted reviews retain owner-scoped edits and known IDs. See the [verification contract](docs/contracts/expense-verification-and-immediate-review.md) and [release repair](docs/reviews/2026-10-21-capture-release-repair.md).

OCR jobs progress through `OCR`, `EXPENSE`, and `RECEIPT` stages with database leases. Successful promotion creates a draft expense and attaches a receipt; cancellation and successful attachment attempt to delete the staged source. A result with missing details can advance into draft recovery; permanent provider failure does not itself guarantee a photo-only expense. See [AsyncOcrService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt) and [ADR-0004](docs/adr/0004-asynchronous-receipt-capture-and-ocr-staging.md).

Report state transitions live in [ExpenseReportLifecycle](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt). The states are `draft`, `submitted`, `approved`, `rejected`, and `paid`. Recall accepts submitted or rejected reports and returns them to draft. Authorization is endpoint-specific; the existence of a management screen does not grant a role every financial mutation.

### Integrations

- **AI workflows:** moderators configure providers/models and separate ordered chains for receipt OCR and delegation-email parsing at `/admin/ocr`. Provider/model chains are configurable; built-in inactive Gemini defaults remain for initial configuration. The integration accepts compatible multimodal Chat Completions providers through validated public HTTPS destinations. Keys use encrypted storage. Setup and limits: [AI administration guide](docs/ocr-model-management.md), [ADR-0006](docs/adr/0006-gui-managed-ai-provider-model-chains.md).
- **Delegation email & order import:** incoming Technician emails can create draft reports through a durable ingestion ledger, and the UI also supports pasting order/delegation text via `/api/reports/import-order` and `/import-order/preview` (with open-draft duplicate lookup by `kundenauftrag`). Committing the draft and source-message association is distinct from marking an IMAP message seen. Retry and acknowledgement behavior: [ADR-0003](docs/adr/0003-durable-technician-email-ingestion.md), [ingestion code](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ingestion/), [EmailImportService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt).
- **Storage:** local and S3 providers exist behind [StorageService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt). `StorageContext` validation (`RECEIPT`, `SIGNATURE`, `OCR_SOURCE`) applies to receipt/signature/OCR-source APIs; [InsuranceController](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt) stores documents separately under `<userId>/insurance/`, validates allowed extensions on upload, and serves downloads with `SafeMediaType`, `X-Content-Type-Options: nosniff`, and forced `Content-Disposition: attachment`.
- **FX:** [FxService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt) implements EUR identity, BNR-based conversion and per-currency margins, with provider fallbacks. RON conversion has no margin. Expense-specific rates and EUR amounts are stored; automatic rates approximate settlement unless actual debit information or a manual rate is supplied. [ADR-0001](docs/adr/0001-bnr-fx-rates-with-margin.md) records the policy; code remains the reference for provider fallback behavior.

## Domain language

The canonical project glossary lives in [CONTEXT.md](CONTEXT.md). It defines Expenses, Receipts, ExpenseReports, Advances, FX terms, OCR jobs, delegation emails, AI model chains and roles. Keep terminology there; use this README for implementation and operational guidance.

The API report mapper computes reimbursement as expenses + allowance + mileage − paid advances; the PDF summary uses its separately documented mileage exclusion. See [ReportMapper](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt).

The glossary is grounded in [models](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/), [FX service](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt), [PDF service](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt), [OCR service](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt), and [ingestion ADR](docs/adr/0003-durable-technician-email-ingestion.md). Detailed qualifications are in the [backend documentation review](docs/documentation-review/2026-10-18/backend.md).

## Global Invariants

- **Authentication, CSRF & Role Boundaries:** Stateless `HttpOnly` JWT cookies (`access_token`, `refresh_token`) with `tokenVersion` checks, single-flight frontend refresh (`xpenses_auth_refresh` Web Lock), Origin/Referer enforcement on non-idempotent API mutations, and endpoint-specific RBAC across `technician`, `manager`, `chef_finance`, and `mod` (self-approval/payment blocked).
- **Financial & Lifecycle Integrity:** PostgreSQL `NUMERIC` columns and Flyway `CHECK` constraints enforce non-negative monetary amounts (`expenses`, `advance_payments`, `mileage_records`), positive FX rates, soft-delete filtering (`deleted = false`), optimistic `@Version` locking, and strict `ExpenseReport` state transitions (`draft` → `submitted` → `approved` / `rejected` → `paid`, with recall to `draft`).
- **Idempotency & Durable Leases:** Expense save/review, OCR scan/actions, and report creation use `Idempotency-Key` request-hash verification; async OCR (`ocr_jobs`), IMAP ingestion (`imap_ingestion_messages`), frontend offline queues (`xpenses-offline`), and OCR source queues (`xpenses-ocr-sources`) enforce fenced leases and owner scoping.
- **Storage & Edge Security:** Local and S3 storage reject path escapes/symlinks and enforce MIME/extension/magic-byte checks (`SafeMediaType`, `nosniff`); frontend CSP and v9 Service Worker isolate `/api*`, `/_next*`, and owner-verified IndexedDB caches.

## Global Side Effects

- **PostgreSQL & Redis:** Backend mutates Flyway-managed PostgreSQL tables (including `pg_advisory_xact_lock` and `PESSIMISTIC_WRITE` locks) and executes Redis Lua scripts (`INCR`/`PEXPIRE`) for rate limiting when enabled.
- **Filesystem & Object Storage:** Backend writes/reads/deletes receipt, signature, insurance, and staged OCR source files in local `/app/data` or S3; frontend persists owner-scoped snapshots and queues in IndexedDB (`xpenses-cache`, `xpenses-offline`, `xpenses-ocr-sources`) and CacheStorage (`xpenses-v9`).
- **External Integrations & Background Jobs:** Outbound HTTP/HTTPS calls to AI OCR/parsing endpoints (validated public DNS IPs), FX providers (Frankfurter, BNR XML, Currency API), SMTP, IMAPS/STARTTLS, and LDAP/LDAPS, alongside `@Scheduled` IMAP polling and OCR recovery/cleanup tasks.

## Development and deployment

**This checkout is on the live production host.** Preserve running services and the `pgdata`, `redisdata`, and `xpenses-data` volumes. Never run `docker compose down`, `make down`, or volume deletion here. Use `--no-daemon` for Gradle and target individual tests; avoid full stack builds or multi-worker browser suites on this host. See [AGENTS.md](AGENTS.md).

The following startup instructions are for a **separate development checkout/environment**. They are not a request to restart production.

### Running from source

Use Java 21 and Node.js 22, matching the build and CI. Provide PostgreSQL and Redis endpoints accessible to the source processes. Compose's `db` and `redis` services do not publish host ports; merely starting those services does not make `localhost:5432` or `localhost:6379` reachable from host processes.

Set backend environment variables before starting it:

```bash
export SPRING_DATASOURCE_URL='jdbc:postgresql://<database-host>:5432/<database>'
export SPRING_DATASOURCE_USERNAME='<database-user>'
export SPRING_DATASOURCE_PASSWORD='<database-password>'
export REDIS_URL='redis://<redis-host>:6379'
export JWT_SECRET='<unique-long-random-signing-secret>'
export ENCRYPTION_SECRET='<different-long-random-encryption-secret>'
export COOKIE_SECURE=false
export CORS_ALLOWED_ORIGINS='http://localhost:3000,http://127.0.0.1:3000'
cd backend-kotlin-jpa
./gradlew bootRun --no-daemon
```

The backend's direct default port is 8080. In another shell, set the frontend's server-side backend URL **before starting Next**:

```bash
cd frontend
npm ci
INTERNAL_API_URL=http://localhost:8080/api npm run dev
```

The normal direct frontend address is `http://localhost:3000`. Browser calls still use same-origin `/api`. If a backend is already exposed on port 8001, use `http://localhost:8001/api` instead. [Next configuration](frontend/next.config.ts) embeds the rewrite destination when evaluated; for a production frontend build, supply the intended destination during build as well as runtime.

### Compose deployment reference

A root `.env` is required by `env_file`; supply protected deployment-specific values. Do not copy production secrets into a development environment.

```bash
docker compose up -d --build
docker compose ps
```

| Service | Default endpoint / persistence |
| --- | --- |
| Frontend | `127.0.0.1:3001` → container 3000 |
| Backend | `127.0.0.1:8001` → container 8080; `/api/health` |
| PostgreSQL | Compose-network `db:5432`; `pgdata` |
| Redis | Compose-network `redis:6379`; `redisdata` |
| Uploaded local files | Backend `/app/data`; `xpenses-data` |

`FRONTEND_BIND_IP`, `BACKEND_BIND_IP`, and `COMPOSE_CONTAINER_PREFIX` override bindings/names. Loopback binding is the checked default, not proof of the running host's exposure. Backend startup waits for healthy database and Redis services. [Compose configuration](docker-compose.yml) is authoritative.

Read-only operational checks:

```bash
docker compose ps
docker compose logs --tail=100 backend
curl --fail http://127.0.0.1:8001/api/health
```

The [Makefile](Makefile) also contains build/test/rebuild shortcuts. Its `test-health` target prints failures without reliably propagating a failing exit status; use `curl --fail` when checking success programmatically. Login smoke shortcuts reference demo accounts and are unsuitable as evidence of production authentication health.

## Configuration

[application.yml](backend-kotlin-jpa/src/main/resources/application.yml) defines base defaults; [application-prod.yml](backend-kotlin-jpa/src/main/resources/application-prod.yml) and [application-ci.yml](backend-kotlin-jpa/src/main/resources/application-ci.yml) apply profile overrides. [Compose](docker-compose.yml) defaults to `prod` and supplies environment overrides. The production profile requires `JWT_SECRET`, `JWT_SALT`, `ENCRYPTION_SECRET`, `CORS_ALLOWED_ORIGINS`, and `REDIS_URL`. Database-backed integration settings are not all environment variables.

| Setting | Checked meaning / default |
| --- | --- |
| `JWT_SECRET`, `ENCRYPTION_SECRET` | Both must be nonblank and different; startup validation enforces this. Preserve encryption-key compatibility with stored settings. |
| `JWT_SALT` | Required by the `prod` profile; used in JWT signing-key derivation. |
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | Direct backend database settings. Compose derives them from `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. |
| `SPRING_PROFILES_ACTIVE` | Compose defaults to `prod`; its overrides enable secure cookies, Flyway validation and Redis-backed fail-closed limiting. |
| `COOKIE_SECURE` | Cookie flag: controller fallback false; `prod` profile sets true. Environment overrides can change the effective value. |
| `CORS_ALLOWED_ORIGINS` | Base default: localhost/127.0.0.1 port 3001; required explicitly in `prod`. Set the actual browser origins. |
| `REDIS_URL` | Base default: localhost; `prod` requires a value. Compose supplies `redis://redis:6379` unless overridden. |
| `RATE_LIMITING_ENABLED` | true by default. |
| `RATE_LIMITING_STORE` | Base configuration: `memory`; `prod`: `redis`. |
| `RATE_LIMITING_FAIL_CLOSED` | Base configuration: false; `prod`: true. |
| `RATE_LIMITING_MAX_TRACKED_KEYS` | 10,000 by default. |
| `TRUSTED_PROXY_ADDRESSES` | Empty in base config; `prod` profile defaults to `127.0.0.1,172.16.0.0/12,10.0.0.0/8` (CIDR/IP list) for forwarded client IP headers. |
| `OCR_SOURCE_CLEANUP_ENABLED` | `false` by default in Compose; opt-in retention cleanup of staged OCR source uploads. |
| `SEED_DEMO_USERS` | false by default; enables demo initialization when the user table is empty. No production-profile refusal is implemented. |
| `SWAGGER_ENABLED` | false by default. |
| `COMPANY_NAME` | Display name in application configuration. |
| `IMAP_POLL_INTERVAL` | 300,000 ms by default. |
| `OCR_CACHE_RETENTION_DAYS` | 90 days by default. |
| `OCR_CACHE_CLEANUP_INTERVAL`, `OCR_CACHE_CLEANUP_BATCH_SIZE` | 86,400,000 ms / 100 by default. |
| `INTERNAL_API_URL` | Frontend rewrite and server fetch target; default `http://backend:8080/api`. |

[AuthController](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt) uses HttpOnly, SameSite=Lax access/refresh cookies and stores hashed refresh tokens. [SecurityConfig](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt) disables framework CSRF tokens and checks Origin/Referer for protected mutations; curl/integration mutations need an allowed Origin. [CryptoService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/CryptoService.kt) writes AES-128-GCM values and retains legacy CBC decryption. The old audit's AES-256 description was incorrect.

### Migrations and backups

The latest schema migration is `V107__refresh_token_rotation_grace.sql` (following `V104` durable-save idempotency, `V105` expense verification, and `V106` OCR acceptance/recovery). Determine the next version from the directory when adding a migration; [HANDOFF.md](HANDOFF.md) tracks verified production schema state.

```bash
ls -1 backend-kotlin-jpa/src/main/resources/db/migration/ | sort -V | tail -n 1
```

Add incremented migrations; preserve applied migrations. Hibernate schema validation is enabled. Flyway `validate-on-migrate` is false in the base configuration and true in `prod` and `ci`; `baseline-on-migrate` is true in base and false in those profiles. Schema validation and migration-history validation are different mechanisms.

[scripts/backup-db.sh](scripts/backup-db.sh) uses `set -euo pipefail` and `pg_dump -Fc`, with `BACKUP_DIR`, `DB_CONTAINER`, `DB_USER`, `DB_NAME`, and `RETENTION_DAYS` overrides. It backs up the database only and prunes old matching dumps; it does not back up uploaded files. The 2026-10-21 coordinated release separately backed up database and uploaded files, verified the archives, and actually restored the database and rehearsed additive migrations in isolation. Private backup paths/rollback commands stay in the host operations directory referenced by [HANDOFF.md](HANDOFF.md); never publish their contents. Off-host coverage and scheduling are not inferred from this rehearsal.

## System Verification

- Run (Frontend fast checks): `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
- Run (Frontend unit checks): `cd frontend && npm run test:lint-config && npm run test:auth:unit && npm run test:service-worker:unit`
- Run (Backend targeted test): `cd backend-kotlin-jpa && ./gradlew test --tests '<ClassName>' --no-daemon`
- Run (Backend full suite in isolated/CI env): `cd backend-kotlin-jpa && ./gradlew test --no-daemon`
- Run (Scripts unit tests): `node --test scripts/check-i18n-parity.test.mjs scripts/check-npm-audit.test.mjs`

## Verification and CI

Fast checks suitable for this host:

```bash
cd frontend
npm run typecheck
npm run i18n:check
npm run test:lint-config
npm run lint
```

Typecheck, lint-coverage regressions, and lint (`eslint . --max-warnings 0`) pass on the current source; translation parity covers **1,243 keys** in English and Romanian. Parity does not establish that every UI string is translated or accessible.

For a backend change, select the affected test class:

```bash
cd backend-kotlin-jpa
./gradlew test --tests '<ClassName>' --no-daemon
```

The optional root `package.json`/lockfile is a separate Playwright QA toolbox retained from local work, not the frontend application package. Install and run application checks under `frontend/`; the root QA dependency is development-only. The maintained [mobile QA skill](skills/mobile-pwa-qa/SKILL.md) describes its manual acceptance boundaries.

The backend build includes JUnit/Spring Security tests and Testcontainers PostgreSQL support. Heavy checks belong in an isolated development or CI environment. [Playwright configuration](frontend/playwright.config.ts) defines mobile Chromium, mobile WebKit, tablet and desktop projects; generic browser tests block service workers by default, while dedicated VM/browser and authenticated offline cold-start suites explicitly exercise the real worker. Run serially on this host. These automated checks do not establish physical iPhone/Safari/PWA/keyboard/VoiceOver acceptance.

[CI](.github/workflows/ci.yml) runs on pushes and PRs targeting `main`:

1. Gitleaks secret scanning.
2. Java 21 backend tests and `bootJar`, with `--no-daemon`.
3. Node 22 frontend install, TypeScript, translation parity, real TS/TSX lint with executable coverage regression, safety tests normally and with Python optimization, capture/offline regressions and production build.
4. Compose integration after backend/frontend jobs: npm-audit policy tests and dependency audit, Docker builds, Trivy image scans, temporary-stack startup, health checks, authenticated mobile/capture/SW tests and an actual persisted-state backend-restart rehearsal.

Workflow actions are pinned to verified commit SHAs, job permissions are explicit and checkout credentials are not persisted. See the [pi-lens follow-up](docs/reviews/2026-10-21-pi-lens-follow-up.md).

CI generates temporary credentials and tears down its disposable volumes. That cleanup is scoped to CI and must not be copied onto this production host. Workflow presence does not establish a particular run's result. Check the linked CI runs in [HANDOFF.md](HANDOFF.md) and the integration record; never describe a running or skipped gate as passed.

## Current limitations

- **OCR source retention:** worker-lease recovery and opt-in source cleanup are distinct. `OCR_SOURCE_CLEANUP_ENABLED` stays `false` in production pending storage retention reconciliation; see [ocr-source-resume-and-retention.md](docs/contracts/ocr-source-resume-and-retention.md).
- **Orphan cleanup:** [AppSettingsService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AppSettingsService.kt) checks receipt, legacy expense, insurance, OCR source, and signature references and restricts deletion to receipt path patterns; scanning alone does not delete.
- **Insurance upload validation:** [InsuranceController](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/InsuranceController.kt) hardens downloads (`SafeMediaType`, `nosniff`, forced attachment), while uploads validate allowed extensions rather than file magic bytes.
- **Bulk creation:** receipt-upload rollback cleanup exists, but the bulk flow creates an expense before separately attaching its receipt; attachment failure can leave a receiptless expense.
- **Capture & offline queues:** OCR-source replay is owned by the [capture page](frontend/app/expenses/capture/page.tsx), while [global offline sync](frontend/components/OfflineSyncProvider.tsx) handles the manual queue ([ADR-0007](docs/adr/0007-durable-expense-save-idempotency.md)). Do not infer interchangeable queues across paths.
- **Physical device acceptance:** automated Playwright suites cover emulated mobile Chromium/WebKit and service-worker regressions, not physical iPhone/Safari/VoiceOver hardware.
- **Live DB demo/legacy accounts:** see [HANDOFF.md](HANDOFF.md#L48) for unmutated seeded/blank-email accounts in live PostgreSQL awaiting explicit owner approval.

GitHub Issues (`gh issue list`) are the task source of truth (`0` open issues as of the [HANDOFF.md](HANDOFF.md) snapshot).

## Historical archives

Dated audits, superseded handoffs, and historical root-doc snapshots are retained only for provenance under [docs/archive/](docs/archive/) and [docs/documentation-review/2026-10-18/](docs/documentation-review/2026-10-18/). They are historical evidence, not current operational guidance. Specialized active docs remain under [docs/adr/](docs/adr/), [docs/contracts/](docs/contracts/), and [docs/designs/](docs/designs/).
