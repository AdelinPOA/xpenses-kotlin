# Xpenses

Expense management for field-service teams. Technicians record expenses and receipts, submit expense reports, and track advances and mileage. Managers and `chef_finance` review, approve and reject reports; `chef_finance` alone can mark approved reports as paid. Moderators manage application settings and integrations.

This is the consolidated project reference, checked against the working tree at commit `d62bcdc` on **2026-10-18**. Source inspection establishes implementation and configuration, not successful production operation. Findings requiring browser, device, database, ingress, or provider verification are explicitly separated below.

- [Architecture and source map](#architecture-and-source-map)
- [Domain language](#domain-language)
- [Development and deployment](#development-and-deployment)
- [Configuration](#configuration)
- [Verification and CI](#verification-and-ci)
- [Current limitations](#current-limitations)
- [Documentation review and history](#documentation-review-and-history)

Repository: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin). Production hostname used by repository configuration: `xpenses.nt-automation.cc`.

## Architecture and source map

The backend is one Spring Boot application with shared PostgreSQL persistence. The frontend uses the Next.js App Router. Compose defines four services: `frontend`, `backend`, `db`, and `redis`.

| Area | Checked configuration | Source |
| --- | --- | --- |
| Backend | Kotlin 2.4.0; Spring Boot 3.5.16; Java toolchain 21; MVC, Security, JPA | [Gradle build](backend-kotlin-jpa/build.gradle.kts) |
| Frontend | Next.js 16.3.8; React 19; TypeScript; Tailwind CSS 4; TanStack Query 5 | [package manifest](frontend/package.json), [lockfile](frontend/package-lock.json) |
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

OCR jobs progress through `OCR`, `EXPENSE`, and `RECEIPT` stages with database leases. Successful promotion creates a draft expense and attaches a receipt; cancellation and successful attachment attempt to delete the staged source. A result with missing details can advance into draft recovery; permanent provider failure does not itself guarantee a photo-only expense. See [AsyncOcrService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt) and [ADR-0004](docs/adr/0004-asynchronous-receipt-capture-and-ocr-staging.md).

Report state transitions live in [ExpenseReportLifecycle](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ExpenseReportLifecycle.kt). The states are `draft`, `submitted`, `approved`, `rejected`, and `paid`. Recall accepts submitted or rejected reports and returns them to draft. Authorization is endpoint-specific; the existence of a management screen does not grant a role every financial mutation.

### Integrations

- **AI workflows:** moderators configure providers/models and separate ordered chains for receipt OCR and delegation-email parsing at `/admin/ocr`. Provider/model chains are configurable; built-in inactive Gemini defaults remain for initial configuration. The integration accepts compatible multimodal Chat Completions providers through validated public HTTPS destinations. Keys use encrypted storage. Setup and limits: [AI administration guide](docs/ocr-model-management.md), [ADR-0006](docs/adr/0006-gui-managed-ai-provider-model-chains.md).
- **Delegation email:** incoming Technician emails can create draft reports through a durable ingestion ledger. Committing the draft and source-message association is distinct from marking an IMAP message seen. Retry and acknowledgement behavior: [ADR-0003](docs/adr/0003-durable-technician-email-ingestion.md), [ingestion code](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ingestion/).
- **Storage:** local and S3 providers exist behind [StorageService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/StorageService.kt). Context validation applies to receipt/signature/OCR-source APIs; insurance uses a separate upload path and does not inherit every check. Provider migration has persisted progress; see the backend verification report before relying on old migration findings.
- **FX:** [FxService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt) implements EUR identity, BNR-based conversion and per-currency margins, with provider fallbacks. RON conversion has no margin. Expense-specific rates and EUR amounts are stored; automatic rates approximate settlement unless actual debit information or a manual rate is supplied. [ADR-0001](docs/adr/0001-bnr-fx-rates-with-margin.md) records the policy; code remains the reference for provider fallback behavior.

## Domain language

The canonical project glossary lives in [CONTEXT.md](CONTEXT.md). It defines Expenses, Receipts, ExpenseReports, Advances, FX terms, OCR jobs, delegation emails, AI model chains and roles. Keep terminology there; use this README for implementation and operational guidance.

The API report mapper computes reimbursement as expenses + allowance + mileage − paid advances; the PDF summary uses its separately documented mileage exclusion. See [ReportMapper](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt).

The glossary is grounded in [models](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/), [FX service](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt), [PDF service](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt), [OCR service](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt), and [ingestion ADR](docs/adr/0003-durable-technician-email-ingestion.md). Detailed qualifications are in the [backend documentation review](docs/documentation-review/2026-10-18/backend.md).

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
| `TRUSTED_PROXY_ADDRESSES` | Empty by default; used by the custom limiter. Framework forwarding is also enabled; ingress/filter interactions require runtime verification. |
| `SEED_DEMO_USERS` | false by default; enables demo initialization when the user table is empty. No production-profile refusal is implemented. |
| `SWAGGER_ENABLED` | false by default. |
| `COMPANY_NAME` | Display name in application configuration. |
| `IMAP_POLL_INTERVAL` | 300,000 ms by default. |
| `OCR_CACHE_RETENTION_DAYS` | 90 days by default. |
| `OCR_CACHE_CLEANUP_INTERVAL`, `OCR_CACHE_CLEANUP_BATCH_SIZE` | 86,400,000 ms / 100 by default. |
| `INTERNAL_API_URL` | Frontend rewrite and server fetch target; default `http://backend:8080/api`. |

[AuthController](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt) uses HttpOnly, SameSite=Lax access/refresh cookies and stores hashed refresh tokens. [SecurityConfig](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt) disables framework CSRF tokens and checks Origin/Referer for protected mutations; curl/integration mutations need an allowed Origin. [CryptoService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/CryptoService.kt) writes AES-128-GCM values and retains legacy CBC decryption. The old audit's AES-256 description was incorrect.

### Migrations and backups

Migration files currently run through `V103__durabilize_ocr_job_state.sql`. Determine the next version from the directory when adding a migration; this inventory is not the deployed database version.

```bash
ls -1 backend-kotlin-jpa/src/main/resources/db/migration/ | sort -V | tail -n 1
```

Add incremented migrations; preserve applied migrations. Hibernate schema validation is enabled. Flyway `validate-on-migrate` is false in the base configuration and true in `prod` and `ci`; `baseline-on-migrate` is true in base and false in those profiles. Schema validation and migration-history validation are different mechanisms.

[scripts/backup-db.sh](scripts/backup-db.sh) uses `set -euo pipefail` and `pg_dump -Fc`, with `BACKUP_DIR`, `DB_CONTAINER`, `DB_USER`, `DB_NAME`, and `RETENTION_DAYS` overrides. It backs up the database only and prunes old matching dumps; it does not back up uploaded files. Scheduling, off-host copies, restore success, and uploaded-file coverage were not verified. The script was not executed during this documentation review.

## Verification and CI

Fast checks suitable for this host:

```bash
cd frontend
npm run typecheck
npm run i18n:check
```

Both passed during this review; translation parity covered **1,028 keys** in English and Romanian. Parity does not establish that every UI string is translated or accessible.

For a backend change, select the affected test class:

```bash
cd backend-kotlin-jpa
./gradlew test --tests '<ClassName>' --no-daemon
```

The backend build includes JUnit/Spring Security tests and Testcontainers PostgreSQL support. Heavy checks belong in an isolated development or CI environment. [Playwright configuration](frontend/playwright.config.ts) defines mobile Chromium, mobile WebKit, tablet and desktop projects; locally it defaults to four workers, CI uses one, and service workers are blocked. Those suites therefore do not establish PWA service-worker correctness or real iPhone acceptance.

[CI](.github/workflows/ci.yml) runs on pushes and PRs targeting `main`:

1. Gitleaks secret scanning.
2. Java 21 backend tests and `bootJar`, with `--no-daemon`.
3. Node 22 frontend install, TypeScript, translation parity, lint and production build.
4. Compose integration after backend/frontend jobs: npm-audit policy tests and dependency audit, Docker builds, Trivy image scans, temporary-stack startup, health checks, and authenticated mobile browser tests.

CI generates temporary credentials and tears down its disposable volumes. That cleanup is scoped to CI and must not be copied onto this production host. Workflow presence does not establish the status of a particular CI run; this review did not rerun the pipeline.

## Current limitations

These are source-supported gaps, not a list of reproduced production incidents. The [audit findings and disposition](docs/documentation-review/2026-10-18/README.md) separates confirmed mechanisms, contradicted/stale claims, runtime-dependent risks and product proposals. Detailed source evidence is in the [frontend review](docs/documentation-review/2026-10-18/frontend.md), [backend review](docs/documentation-review/2026-10-18/backend.md), and [operations review](docs/documentation-review/2026-10-18/operations.md).

- **Orphan cleanup:** [AppSettingsService](backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AppSettingsService.kt) derives candidates from receipt references while other stored file purposes exist. Cleaning can affect non-receipt files; scanning alone does not delete. No cleanup was run.
- **Offline privacy:** [query persistence](frontend/lib/queryPersister.ts) uses a shared IndexedDB record; [service worker](frontend/public/sw.js) caches navigation HTML without account scoping. Logout cleanup exists, but account/session-transition safety is not established. A cross-user leak was not reproduced.
- **Capture recovery:** OCR-source replay is owned by the [capture page](frontend/app/expenses/capture/page.tsx), while [global offline sync](frontend/components/OfflineSyncProvider.tsx) handles the manual queue. Retrying committed manual creation after a lost response lacks a server idempotency guarantee.
- **OCR retention:** worker-lease recovery exists, but the stored job expiry is not enforced by a cleanup worker. Terminal processing failures can retain source files and do not automatically create photo-only expenses. See the [backend review](docs/documentation-review/2026-10-18/backend.md).
- **Bulk creation:** receipt-upload rollback cleanup exists, but the bulk flow creates an expense before separately attaching its receipt. Attachment failure can leave a receiptless expense; this is distinct from orphaned-file cleanup.
- **Frontend correctness:** SSR/client query keys differ in list/dashboard flows; local dates use UTC conversion in some paths; `en-EU` does not guarantee the intended European formatting; proactive/reactive refresh are not coordinated by one shared guard. See the frontend review for precise scope.
- **UX gaps:** bulk review lacks complete visible failure handling; the full search page omits result types represented in its contract; the mobile “Approved” summary uses paid counts/totals. Existing receipt lightbox/toast fixes must not be planned again as missing work.
- **Domain and infrastructure:** privileged advance mutations still mix read-all and management checks; recall retains signature/rejection metadata; some transactional methods call FX/LDAP externally; lazy mapping warrants query measurement. Hibernate batching already exists, so the audit's asserted unbatched query counts are not established.
- **HTTP/storage hardening:** some exception-to-4xx mappings and insurance magic-byte checks are absent; rate-limit coverage is endpoint-specific. `/api/expenses/bulk-upload` already has a limit. Proxy bypass, SQL counts, memory exhaustion, and actual public headers require focused runtime verification.

GitHub Issues are the task source of truth; this README does not assign new priorities from old audit scores. Open items checked on 2026-10-18 include [mobile umbrella #45](https://github.com/AdelinPOA/xpenses-kotlin/issues/45), [contract #46](https://github.com/AdelinPOA/xpenses-kotlin/issues/46), [form/navigation #47](https://github.com/AdelinPOA/xpenses-kotlin/issues/47), [bulk review #48](https://github.com/AdelinPOA/xpenses-kotlin/issues/48), [capture verification #49](https://github.com/AdelinPOA/xpenses-kotlin/issues/49), [receipt viewer #50](https://github.com/AdelinPOA/xpenses-kotlin/issues/50), [real-device acceptance #51](https://github.com/AdelinPOA/xpenses-kotlin/issues/51), and [dependency tracking #54](https://github.com/AdelinPOA/xpenses-kotlin/issues/54). Recheck issue state before taking work.

## Documentation review and history

The review covered all seven root Markdown files: README, AGENTS, CONTEXT, WIP, todo, FULL_APP_AUDIT and FULL_APP_AUDIT_VERIFICATION. Three independent GPT-6 Luna agents with maximum reasoning checked frontend, backend/domain, and operations claims. The consolidated reference retains source-backed behavior, separates proposals from implementation, and removes unsupported scores, performance estimates, invented defects, and production-success claims.

Use the [reconciled audit findings](docs/documentation-review/2026-10-18/README.md) before planning fixes from either audit. The earlier audit verification corrects many false positives, but its historical environment observations and unperformed runtime checks remain bounded by its evidence. Documentation correction does not mean the supported application defects have been fixed.

### Corrections to historical documents

The [disposition tables](docs/documentation-review/2026-10-18/README.md#contradicted-or-stale-claims) explain why the alleged desktop wrapper, first-receipt-only view, first-page picker restriction, broken gzip backup and missing OCR worker recovery are not valid descriptions of the checked code. They also distinguish existing fixes from residual gaps, such as terminal OCR-source retention and account isolation in offline caches.

The [WIP inventory](docs/documentation-review/2026-10-18/frontend.md#wip-inventory-accepted-plan-vs-current-implementation) records shipped and partial UX work. Neither the old WIP nor the audits should be imported wholesale as a current backlog.

### Archive and evidence

Original working-tree versions were preserved **byte for byte**, including the pre-existing local changes to `todo.md` and untracked audit verification. Their SHA-256 hashes are recorded in [SHA256SUMS](docs/archive/root-md-2026-10-18/SHA256SUMS). They live in [docs/archive/root-md-2026-10-18](docs/archive/root-md-2026-10-18/):

- [Previous README](docs/archive/root-md-2026-10-18/README.before-consolidation.md)
- [Previous CONTEXT glossary](docs/archive/root-md-2026-10-18/CONTEXT.md)
- [WIP plan](docs/archive/root-md-2026-10-18/WIP.md)
- [Legacy todo findings](docs/archive/root-md-2026-10-18/todo.md)
- [Full audit](docs/archive/root-md-2026-10-18/FULL_APP_AUDIT.md)
- [Earlier audit verification](docs/archive/root-md-2026-10-18/FULL_APP_AUDIT_VERIFICATION.md)

**The archive is historical evidence, not current guidance.** Its original source paths/relative links refer to the repository root, before relocation; consult the current source links and disposition reports above. Its claims may be false or stale even when an old checkbox says “verified”. Historical audit dates, scores and runtime observations were not adopted as current facts.

`AGENTS.md` remains in root because agents load it automatically. `CONTEXT.md` remains the separate canonical domain glossary, with verified wording corrections; its original snapshot is retained in the archive. Agent instructions and maintained guides point to the root glossary. Specialized guides, ADRs, accepted specifications and release records remain under `docs/` and `openspec/`; they are outside this root-file consolidation and are not globally re-certified by it.

Production logins, destructive cleanup, backup/restore actions, database-content queries, external-provider calls, real-device checks and full builds/test suites were not performed. Source-backed risks remain risks until reproduced; no undocumented production state is assumed.
