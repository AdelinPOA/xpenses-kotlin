# Deployment and operations audit

## Scope and provenance

Initial source baseline: `87bec5a15457c3c74ebec613f2459ac1306093a5` (2026-09-06). Reconciled source: `bdb6fcba9845be7053b0087253bb4a1c191d96e3` (2026-09-07). Application changes between these revisions came from another workstream, not this audit. Existing running containers are not assumed to contain current HEAD. No containers were restarted, no production authentication attempted, and no database/volume restore performed. See `06-test-and-verification-plan.md` for executed checks.

**New stop-ship security dependency:** SEC-013 documents exposed purported production secrets in a separately committed audit. No secret values are reproduced here. Do not confuse an ignored `.env` with the committed Markdown disclosure.

## Deployment inventory

| Surface | Exact paths and responsibility |
|---|---|
| Compose | `docker-compose.yml`: frontend/backend/PostgreSQL/Redis, local named volumes, health checks, resource limits, ports; `docker-compose.override.yml.example`: publishes DB port and bind-mounts backend compiled classes for development |
| Containers | `frontend/Dockerfile`: Node 22.11.0, standalone Next build, non-root runtime; `backend-kotlin-jpa/Dockerfile`: JDK/JRE 21, layered jar, privilege drop after recursive volume chown; `backend-kotlin-jpa/Dockerfile.native`: optional GraalVM/distroless/Alpine variants, not selected by Compose |
| Build contexts | `frontend/.dockerignore`, `backend-kotlin-jpa/.dockerignore`; npm lockfile; Gradle wrapper, `build.gradle.kts`, `gradle.properties`, `settings.gradle.kts` |
| Kubernetes | `backend-kotlin-jpa/deployment.yaml`: two backend replicas, actuator probes, DB secret only; no companion PVC/Redis/JWT/encryption configuration in this manifest |
| Runtime configuration | `.env.example` (development-oriented); `backend-kotlin-jpa/src/main/resources/application.yml`, `application-prod.yml`, `logback-spring.xml`; `frontend/next.config.ts`, `lib/api.ts`, `lib/serverApi.ts` |
| CI | `.github/workflows/ci.yml`: Gitleaks, Kotlin tests/jar, TS/parity/lint/build/public mobile checks, Compose image builds; `.pre-commit-config.yaml` local tooling |
| Scripts | `scripts/backup-db.sh`; `scripts/check-i18n-parity.mjs`, `check-i18n-parity.test.mjs`, `check-format-currency.mjs`; `Makefile` development/build/test wrappers |
| External boundaries | TLS ingress, DNS, firewall, off-site backup scheduler, monitoring backend, cloud IAM, mailbox trust gateway are not defined sufficiently in this repository to certify deployment |

## Findings

### OPS-001 — Production bootstrap still permits unsafe development configuration

- **ID:** OPS-001
- **Severity:** High
- **Area:** Ops
- **Confidence:** Confirmed configuration; actual secret strength and deployed profile not examined.
- **Evidence:** `docker-compose.yml`, `db.environment` and `backend.environment`, still default DB password to the public development value. `.env.example` uses illustrative signing/encryption values and selects `SPRING_PROFILES_ACTIVE=dev`, `SWAGGER_ENABLED=true`. `application.yml` disables Flyway validation and enables baselining; `application-prod.yml` correctly reverses both and selects Secure cookies and Redis fail-closed limits. Thus copying the example selects materially weaker behavior, not the documented production posture. `AuthController.kt` consumes `cookie.secure`; example variable `COOKIE_SECURE` is not the literal property name (verify actual binding; prod YAML explicitly sets it). `application-prod.yml` declares `JWT_SALT`, with no source consumer found; distinguish dead configuration from a genuinely mandatory runtime secret.
- **User impact / production risk:** An operator can deploy a functioning but incorrectly hardened environment, weak database credentials, or migration drift protection disabled.
- **Recommended fix:** Separate clearly named development and production templates; require explicit production credentials and trusted origins; preflight rejects illustrative secrets/default passwords and dev profile for production. Document variables actually consumed, including Redis/proxy settings and encryption-key recovery. Remove obsolete variables only after caller verification.
- **Acceptance criteria:** Production setup cannot silently select dev settings or known credentials; missing required configuration fails before binding public traffic; fresh and upgraded databases validate migrations under prod.
- **Suggested tests:** Isolated Compose config/startup matrix with sanitized temporary env files, missing/placeholder credentials, dev/prod profiles, clean and upgraded schema. Never print expanded real environment values.
- **Dependencies or sequencing:** Phase 0 production gate; SEC-013 rotation first. Configuration validation is not evidence existing exposed keys were rotated.

### OPS-002 — Source port restrictions are not proof of deployed ingress isolation

- **ID:** OPS-002
- **Severity:** High
- **Area:** Ops
- **Confidence:** Baseline all-interface binding confirmed; current source remediation present; deployed isolation needs verification.
- **Evidence:** Baseline `docker-compose.yml` published `8001:8080` and `3001:3000`. Current source defaults both bind IPs to `127.0.0.1`. Initial read-only `docker ps` and `ss -ltnp` still showed running services on `0.0.0.0:8001` and `0.0.0.0:3001`. No TLS reverse-proxy config exists in the audited Compose stack. `server.forward-headers-strategy=framework` and rate-limiter trusted proxy addresses are separate controls.
- **User impact / production risk:** If reachable externally, direct HTTP ports can bypass TLS ingress and edge controls. Network reachability, firewall policy and proxy header sanitization were not tested. Secure cookies are not claimed to be transmitted over HTTP.
- **Recommended fix:** Deploy reviewed loopback/private-network bindings with an ingress-compatible rollback plan; firewall external access; sanitize forwarded headers at the ingress and allow only its immediate peers in the rate limiter. Verify effective HSTS/CSP and Secure/HttpOnly/SameSite attributes through HTTPS.
- **Acceptance criteria:** External host cannot reach app ports directly; HTTPS login/session works; spoofed forwarded IP/scheme cannot bypass limits or affect security decisions. Source config and running deployment agree.
- **Suggested tests:** Owner-run external TCP check and HTTPS header/cookie test against staging; `docker ps`, `ss`, and sanitized proxy config review after rollout.
- **Dependencies or sequencing:** Phase 0 deployment gate. Do not change bindings blindly if ingress lives in another container/host.

### OPS-003 — Demo-account seeding is disabled by default now, but lacks a production prohibition

- **ID:** OPS-003
- **Severity:** High
- **Area:** Ops
- **Confidence:** Baseline unsafe default confirmed; source default repaired; existing accounts and prod override behavior unverified.
- **Evidence:** Baseline Compose and `.env.example` enabled seeding; current versions default false. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt:61–95` still creates predictable technician, manager, finance and mod accounts when enabled and users table is empty, without checking prod profile. The default change does not remove accounts created previously.
- **User impact / production risk:** An explicit stale environment override can create privileged known-credential accounts on a fresh deployment; existing seeded accounts may remain usable.
- **Recommended fix:** Refuse demo identity seeding in prod; provide a one-time audited admin bootstrap. Owner inventories/disables or resets existing demo identities without deleting financial ownership history.
- **Acceptance criteria:** Fresh prod cannot create demo identities even with stale demo flag; deployed privileged users are individually approved and have rotated credentials.
- **Suggested tests:** Prod-profile startup test with seeding flag true; development test still seeds only intended fixtures; owner-run account inventory without exposing password data.
- **Dependencies or sequencing:** Phase 0 deployment gate; no login guessing was attempted in this audit.

### OPS-004 — Backup script does not establish recoverability of complete expense evidence

- **ID:** OPS-004
- **Severity:** High
- **Area:** Ops
- **Confidence:** Repository coverage gap confirmed; external backup jobs may exist and need owner verification.
- **Evidence:** `scripts/backup-db.sh:14–23` dumps PostgreSQL directly to final filename and prunes local dumps; no verification, atomic rename, encryption, restrictive umask or off-site replication is defined. `docker-compose.yml` stores receipt/signature bytes in `xpenses-data`, separate from `pgdata`; remote storage and encryption keys require their own recovery. No restore script or tested restore runbook is included. `bash -n` passes but proves only syntax.
- **User impact / production risk:** Restored rows can point to missing receipts/signatures or undecipherable credentials; failed dump can leave a misleading final-named file. Host loss can remove both primary and local backups.
- **Recommended fix:** Define RPO/RTO; consistent DB+object/volume backup with recoverable key escrow, protected permissions, integrity manifest and atomic completion; scheduled off-site encrypted copies and alerts; documented restore into a separate isolated environment.
- **Acceptance criteria:** Restore recovers representative reports, exact totals, downloadable receipt hashes, signatures and encrypted integration settings within RPO/RTO. A failed backup never appears complete and never triggers unsafe pruning.
- **Suggested tests:** Fault-inject pg_dump failure and low disk; restore only into a disposable new database/volume; compare record/object counts and hashes. Never wipe the running stack to test restoration.
- **Dependencies or sequencing:** Phase 0 prove recoverability before financial migrations/key rotation; Phase 4 automate and drill.

### OPS-005 — Redis has no configured memory cap or authentication boundary

- **ID:** OPS-005
- **Severity:** Medium
- **Area:** Ops
- **Confidence:** Confirmed Compose and running-container configuration; growth/abuse impact needs load verification.
- **Evidence:** `docker-compose.yml`, redis service, enables AOF and a volume but has no resource limit, `maxmemory`/eviction policy or ACL/auth configuration; all application services share `xpenses-net`. Sanitized `docker inspect` reported Redis `memory=0`. It is not host-port published. Production rate limiting uses Redis and fails closed (`application-prod.yml`).
- **User impact / production risk:** Unbounded state or AOF growth can exhaust host capacity; compromise of a network peer can access limiter state. An incompatible eviction policy can silently weaken limits; unavailable Redis can block protected operations by design.
- **Recommended fix:** Measured memory/disk bounds, explicit policy suited to security counters, restricted network/ACL permissions, persistent-state monitoring and tested outage/recovery behavior. Do not choose an eviction policy blindly or put passwords in command logs.
- **Acceptance criteria:** Peak workload stays within documented bounds; unauthorized peers cannot mutate state; expiry, restart and outage behavior preserve the intended abuse policy and user-facing errors.
- **Suggested tests:** Staging Redis restart/unavailability, cardinality load and expiry, unauthorized commands, AOF recovery; never run FLUSHALL against the live service.
- **Dependencies or sequencing:** Phase 4 with SEC-005 budget tests; preserve fail-closed semantics deliberately.

### OPS-006 — Running container logs have no per-container rotation bounds

- **ID:** OPS-006
- **Severity:** High
- **Area:** Ops
- **Confidence:** Confirmed effective configuration, not just missing YAML.
- **Evidence:** `docker-compose.yml` has no logging limits. Read-only `docker inspect xpenses-backend xpenses-frontend xpenses-db xpenses-redis --format '{{.Name}} logging={{json .HostConfig.LogConfig}} memory={{.HostConfig.Memory}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}'` reported `json-file` with empty Config for all four. Production uses JSON stdout (`logback-spring.xml`). No disk alerting is defined in repo; external host controls remain unverified.
- **User impact / production risk:** Growing logs can consume the same host storage needed by PostgreSQL, receipts and backups, causing outage or failed writes.
- **Recommended fix:** Explicit bounded logging driver/rotation and central protected retention; monitor host, database, object and backup disk headroom; document deployment recreation needed for log-driver changes.
- **Acceptance criteria:** Effective container log options are bounded; sustained logging rotates without exhausting disk; low-headroom alert reaches an owner.
- **Suggested tests:** Inspect deployed LogConfig; bounded synthetic logging in disposable stack; simulate disk-threshold alert without filling production disk.
- **Dependencies or sequencing:** Phase 0 ensure headroom and bounds; Phase 4 monitoring/retention automation. Coordinate SEC-012 privacy retention.

### OPS-007 — JSON logging lacks end-to-end correlation and operational recovery signals

- **ID:** OPS-007
- **Severity:** Medium
- **Area:** Ops
- **Confidence:** Source instrumentation/runbook gap confirmed; external telemetry unverified.
- **Evidence:** `logback-spring.xml` supplies JSON logging but repository searches found no request-ID/MDC correlation filter. `frontend/lib/api.ts` has no corresponding request/error ID propagation. `application.yml` exposes health/info/prometheus; no scrape/alert configuration exists. OCR queue, stale IMAP claims, receipt cleanup, backup freshness and rejection-rate alerts are not defined.
- **User impact / production risk:** Field reports of failed scans/reimbursement cannot be reliably traced across browser, API, worker and provider; silent stuck work persists until a user reports it.
- **Recommended fix:** Generate/validate bounded request IDs, echo on responses and user-visible support errors, propagate through asynchronous jobs; define metrics/alerts for queue age, failures, storage integrity, DB pool, auth/quota errors and backup freshness. Avoid logging receipt text or credentials.
- **Acceptance criteria:** A failed upload can be traced from displayed ID to backend/job logs without private payloads; each critical alert has an owner and runbook.
- **Suggested tests:** Correlation across async boundaries, hostile/oversized incoming IDs, privacy log assertions and deliberate staging alert triggers.
- **Dependencies or sequencing:** Phase 4 after correctness fixes; SEC-012 governs data retention.

### OPS-008 — Runtime API environment contract is misleading, not a confirmed cross-origin browser defect

- **ID:** OPS-008
- **Severity:** Low
- **Area:** Ops
- **Confidence:** Confirmed configuration ambiguity; nondefault image routing needs verification.
- **Evidence:** `frontend/lib/api.ts:3–5` correctly uses browser-relative `/api`. Compose nevertheless passes a hardcoded public domain as runtime `NEXT_PUBLIC_API_URL`; frontend Dockerfile builds before that environment exists. `next.config.ts:12–17` computes rewrite destination using INTERNAL_API_URL during Next configuration; `lib/serverApi.ts` separately reads the internal URL. Next primary documentation retrieved via Context7 confirms NEXT_PUBLIC values are inlined at build time (https://nextjs.org/docs/app/guides/environment-variables).
- **User impact / production risk:** Operators may believe changing a public runtime variable changes browser routing, or promote an image whose configured rewrite and server-fetch destinations differ. No browser calls to the hardcoded live domain were demonstrated; do not claim that defect.
- **Recommended fix:** Document relative browser API and one supported build/runtime internal routing contract; remove misleading public variable if unused; test promoting the exact image between staging environments.
- **Acceptance criteria:** Browser stays same-origin; SSR and rewritten client requests reach the same intended backend after image promotion without undocumented rebuild requirements.
- **Suggested tests:** Build once, run in two isolated networks with distinguishable mock backends, inspect sanitized routes manifest and server/client requests.
- **Dependencies or sequencing:** Phase 4 cleanup, FE-007 fetch parity; preserve existing same-origin design.

### OPS-009 — CI does not gate authenticated behavior, dependency risk or container startup

- **ID:** OPS-009
- **Severity:** High
- **Area:** Testing
- **Confidence:** Confirmed workflow and executed test selection.
- **Evidence:** `.github/workflows/ci.yml` sets `PLAYWRIGHT_AUTHENTICATED_UI: "false"`; both local audit runs produced two public login passes and sixteen skips. Docker job only builds images, never starts them, and does not depend on Gitleaks job. No dependency/container vulnerability scan or artifact signing is configured. `frontend/eslint.config.mjs` does not lint TSX: explicit `npx eslint app/login/page.tsx` warned it was ignored even while npm lint returned success.
- **User impact / production risk:** Green CI can miss broken expense/session/report/PWA flows, startup wiring and dependency vulnerabilities. A passing lint check currently does not establish React/TypeScript lint coverage.
- **Recommended fix:** Isolated real-backend fixtures for authenticated mobile flows and mandatory non-skipped counts; proper TS/React lint config; Compose prod startup/login/read/teardown smoke; dependency/image scanning with reviewed exceptions; require all quality/security jobs before release. Review pinned image/action update process rather than assuming pinned digests are patched.
- **Acceptance criteria:** Deliberate TSX lint violation, missing auth fixtures, failed startup and threshold vulnerability all fail required gates; no reliance on production test credentials.
- **Suggested tests:** CI fault-seeding tests, current locked dependencies/container scan, full mobile flow artifacts, startup on clean and upgrade DBs. Branch protection is owner-verified, not inferred from YAML.
- **Dependencies or sequencing:** Phase 3; Phase 0 features require focused regressions immediately. FE-011/012 are the same frontend gate work, not duplicate tickets.

### OPS-010 — Health checks do not establish dependency readiness; Kubernetes probes are unauthorized

- **ID:** OPS-010
- **Severity:** High
- **Area:** Ops
- **Confidence:** Confirmed source contracts; actual Kubernetes deployment not established.
- **Evidence:** Compose backend health calls `/api/health`; `controllers/HealthController.kt` always returns status ok without DB/Redis/storage checks. Frontend health fetches `/` only. `backend-kotlin-jpa/deployment.yaml` probes `/actuator/health/liveness` and `/actuator/health/readiness`, but `config/SecurityConfig.kt` permits only exact `/actuator/health` and protects `/actuator/**` with mod role; probes supply no auth. Kubernetes manifest also omits JWT/encryption/Redis/CORS setup and persistent receipt storage while enabling two replicas.
- **User impact / production risk:** Healthy badges can coexist with unusable application dependencies. Applying the standalone Kubernetes manifest can yield failed probes/startup or ephemeral per-pod receipt evidence. It must not be presented as deploy-ready.
- **Recommended fix:** Separate process liveness from dependency readiness with narrowly exposed non-sensitive probe endpoints. Keep failure of a shared dependency out of restart-only liveness. Complete and test Kubernetes secrets/PVC/object-storage configuration or clearly archive it as unsupported. Do not scale replicas before BE-004/006/007/009 closure.
- **Acceptance criteria:** Dependency loss changes readiness appropriately; healthy process is not repeatedly restarted for external DB outage; unauthenticated probes work without exposing diagnostics; evidence survives pod replacement.
- **Suggested tests:** Isolated prod-profile HTTP probe contract; staging DB/Redis outage, startup delay and pod restart; fresh Compose full workflow despite green health endpoints.
- **Dependencies or sequencing:** Phase 0 if Kubernetes rollout is planned; otherwise Phase 4 supported-deployment cleanup.

## Positive controls and unverified areas

Production profile enables migration validation, disables baselining, uses Secure cookies, Redis fail-closed limits and structured logs. Compose persists all three data volumes; DB/backend/frontend limits were visible in effective container configuration. Both standard application images drop privileges for runtime. These are useful controls, not disaster-recovery or supply-chain certification.

No blanket recommendation to increase JVM heap to a fixed percentage: OpenJDK is container-aware and native/image/PDF/thread overhead must be measured. The concrete queued-image risk is BE-006; benchmark memory and latency before tuning. No vulnerability count is claimed without a dependency/container scan. TLS/certificates/HSTS, live IAM, external firewall reachability, production key validity and complete restore remain **Needs verification**.
