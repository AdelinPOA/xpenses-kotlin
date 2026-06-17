## Context

The xpenses-kotlin project has been through 56 development sessions and is feature-complete: report state machine, multi-currency FX, OCR (EasyOCR + Gemini + MinerU), PDF/Excel/CSV export, LDAP, IMAP email import, digital signatures, advance payments, mileage — all implemented across a Kotlin/Spring Boot backend, Next.js 15 frontend, and 5-service Docker Compose stack.

A comprehensive 5-pillar audit (backend logic, frontend UX, DevSecOps, testing, convergence) scored the project **64/100 production-readiness**. The audit found 12 P0 blockers (crashes, auth bypass, data-loss races, public-default secrets, dev-mode prod containers) and ~18 P1 high-severity gaps (missing transactions, missing validation, IDOR, broken observability). Notably, **10 JUnit test files exist but CI never runs them**, and the Prometheus endpoint is exposed without the registry dependency.

This change is the third code-quality remediation pass (after `code-quality-gaps-round-2`). It is scoped to close every P0 and P1 finding. P2 polish items (frontend `: any` typing, accessibility audits, E2E test authoring) are deferred to follow-up changes.

Stack constraints: Kotlin 2.1.0 / Spring Boot 3.4.3 / JDK 21 (toolchain); Next.js 15.1.0 / React 19; PostgreSQL 16 + Flyway; Tailwind v4; Docker Compose. No JDK upgrade is possible without a Kotlin compiler upgrade (2.1.0 caps at JDK 22).

## Goals / Non-Goals

**Goals:**
- Zero P0 blockers: no crashing pages, no unauthenticated destructive endpoints, no public-default secrets, no auth-bypass IDOR, no dev-mode prod containers.
- All mutating backend endpoints are `@Transactional`; all `@Version` optimistic-lock guarantees actually hold.
- Every request DTO carries bean-validation annotations; the exception handler covers all 400-cause exception types with a consistent `{"detail": "..."}` shape.
- Frontend has global error boundary, 404 page, and role gates on every privileged route.
- Docker stack runs no container as root, has healthchecks on all services, exposes nothing externally except frontend (3001) and backend (8001).
- CI runs the existing 10 test files, typechecks/builds the frontend, and scans images for CVEs.
- `/actuator/prometheus` actually returns metrics; logs are JSON-structured in prod.
- IMAP feature is either fully shipping (scheduled poller) or fully removed — not half-built.

**Non-Goals:**
- No new business features (charts, budgets, recurring expenses, audit log — those are on the README roadmap, not this change).
- No frontend test suite authored from scratch (CI wiring only; test authoring is a follow-up change).
- No SFTP/SMB/WebDAV storage providers (S3 + local remain the only functional providers).
- No GraalVM native image switch (JVM mode stays for development velocity).
- No Kubernetes hardening beyond the existing single `deployment.yaml` (no Service/Ingress/Helm chart authoring).
- No dependency major-version upgrades (Next 15→16, React 19→20, Spring Boot 3.4→3.5) — only patch-level CVE fixes.
- No `: any` / `as any` TypeScript cleanup in the frontend (P2 polish).

## Decisions

### Decision 1: Fix P0 bugs in-place rather than via abstraction

**Choice**: Direct, surgical edits to the offending lines (e.g. reorder the two statements in `deleteExpense`, add `"manager"` to one list literal, move 4 hook calls above an early return).

**Rationale**: Every P0 has a localized root cause. Introducing new abstractions (a "ReceiptDownloadGuard", a "TransactionalService base class") would expand blast radius and review burden for changes that are fundamentally one-line fixes. The audit already identified exact file:line references.

**Alternatives considered**: A "hardening layer" AOP aspect that auto-wraps all controller methods in `@Transactional`. Rejected — Spring's `@Transactional` on the method is already idiomatic; an aspect hides intent and makes test mocking harder.

### Decision 2: `JWT_SECRET` fail-fast with no default, rather than a generated ephemeral key

**Choice**: Remove the `:dev-secret-change-in-production` default from all three `@Value` sites. If `JWT_SECRET` is unset, the app throws `IllegalArgumentException` at startup.

**Rationale**: A generated ephemeral key would let the app boot but break every existing JWT and every encrypted LDAP/IMAP/S3 credential on restart (since `CryptoService` derives Fernet keys from the same secret). Fail-fast forces operators to set the env var and is the only safe default. The dev `.env` already sets it; local `docker compose up` continues to work.

**Alternatives considered**: Spring Boot's `@ConfigurationProperties` validation with `@NotBlank`. Rejected — `@Value` is already in use and a startup guard in `@PostConstruct` is equally effective with less refactor.

### Decision 3: `SEED_DEMO_USERS` gating via `@ConditionalOnProperty`

**Choice**: Wrap the entire demo-user-seeding block in `DataInitializer` with `@ConditionalOnProperty(name = ["seed.demo.users"], havingValue = "true", matchIfMissing = false)`.

**Rationale**: `matchIfMissing = false` means an empty prod DB never gets `mod1/mod1` admin accounts. Dev workflow sets `SEED_DEMO_USERS=true` in `.env`. Categories and mileage rates (non-sensitive reference data) continue to seed unconditionally.

**Alternatives considered**: An `if` check inside the `run()` method. Rejected — `@ConditionalOnProperty` is declarative and also prevents the bean method from running at all, avoiding any chance of partial seeding on a misconfigured profile.

### Decision 4: `signaturePath` → `hasSignature` in `UserResponse`

**Choice**: Replace the absolute-path string with a `hasSignature: Boolean` computed from `user.signaturePath != null`. Frontend reads `user.has_signature` instead of truthy-checking `signature_path`.

**Rationale**: Leaking `/app/data/signatures/3.png` in every login/me/user-list response is an information-disclosure vector (reveals storage layout, user IDs, container paths). A boolean is all the frontend needs (the "Sign Report" button only needs to know whether a signature exists; the actual PNG is fetched from `/api/users/me/signature`).

**Alternatives considered**: Keep the field but redact to a relative path. Rejected — even relative paths leak structure; a boolean is the minimal useful contract.

### Decision 5: Bean validation — annotations on every DTO, manual business rules kept

**Choice**: Add `@NotBlank`/`@NotNull`/`@Min(0)`/`@Size`/`@Pattern` to every request DTO field. Keep existing inline business-rule checks (state machine, duplicate detection, FX) as a second pass after `@Valid` passes.

**Rationale**: Structural validation (required, non-blank, non-negative, length) is declarative and removes ~30 inline `if (body.x == null) throw ...` blocks. Business rules are too complex for annotations and stay manual. The `ValidationExceptionHandler` is extended to catch the 4 exception types that produce 400s so the frontend always sees `{"detail": "..."}`.

**Alternatives considered**: A single Kotlinx.validation schema. Rejected — Spring Bean Validation is already on the classpath (added in round 2) and is the idiomatic choice.

### Decision 6: Frontend prod build via multi-stage Dockerfile

**Choice**: `frontend/Dockerfile` becomes two stages — `builder` runs `npm ci && npm run build`, `runner` copies `.next/standalone` + `.next/static` + `public` and runs `node server.js`. Remove the `npm run dev` override in `docker-compose.yml`.

**Rationale**: The current container runs `next dev --turbopack` in "production" — source maps exposed, no minification, HMR overhead. Next.js `output: standalone` produces a minimal Node server with no `node_modules` in the runtime image. This is the documented Next.js production pattern.

**Alternatives considered**: Keep dev mode but gate via compose profiles. Rejected — the default `docker-compose.yml` must be the production artifact; dev overrides belong in `docker-compose.override.yml` (which we will not create here, but document).

### Decision 7: Non-root containers via `USER` directive + `chown`

**Choice**: Add `USER node` (frontend, already exists in the node image), `USER 1000` (ocr-sidecar/mineru after `pip install --user`), to each Dockerfile. Add `securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false }` to `deployment.yaml`.

**Rationale**: Running as root is the #1 container-hardening miss. The base images already ship non-root users. `pip install --user` + `USER 1000` works for the Python sidecars. Read-only root FS is achievable because receipts write to a mounted volume, not the container FS.

**Alternatives considered**: `gosu`/`su-exec` entrypoint scripts. Rejected — adds complexity; the base images' built-in users are sufficient.

### Decision 8: CI test execution + security scanning, no new test authoring

**Choice**: `ci.yml` adds `./gradlew test` (runs the 10 existing test files), `npm run build` + `tsc --noEmit` (frontend), `aquasecurity/trivy-action` (image scan), `github/codeql-action` (SAST), `gitleaks/gitleaks-action` (secret scan). No new tests are written in this change.

**Rationale**: The audit's most embarrassing finding is that 10 tests exist but CI doesn't run them. Wiring them in is zero-risk and immediately valuable. Authoring new tests (PDF, OCR, Crypto) is scoped to a follow-up change to keep this change reviewable.

**Alternatives considered**: Add JaCoCo coverage gating now. Rejected — gating on coverage before adding tests would fail CI; defer to the follow-up test-authoring change.

### Decision 9: Observability — Prometheus registry + JSON logging, no full APM

**Choice**: Add `io.micrometer:micrometer-registry-prometheus` to `build.gradle.kts` (makes the already-exposed `/actuator/prometheus` endpoint work). Add `logback-spring.xml` with `logstash-logback-encoder` for the `prod` profile (JSON) and console-text for `dev`. Do NOT add Sentry/OpenTelemetry in this change.

**Rationale**: The Prometheus endpoint is already exposed in config but 404s because the registry is missing — that's a one-line dependency fix. JSON logging is a one-file config. Full APM (Sentry, OTel collector) requires selecting a vendor and instrumenting spans — that's a separate decision with operational implications, deferred.

**Alternatives considered**: Add Sentry now. Rejected — Sentry requires a DSN/org choice and budget approval; JSON logs + Prometheus metrics are vendor-neutral and immediately scrape-able.

### Decision 10: IMAP polling — ship the scheduler

**Choice**: Add `@EnableScheduling` to `XpensesApplication` and a `@Scheduled(fixedDelay = ...)` method that calls `EmailImportService.processIncomingEmail()` when IMAP is configured. Keep the simulate endpoint for manual testing.

**Rationale**: The IMAP config endpoints, encrypted credential storage, parser (local + Gemini), and report-creation logic are all fully implemented — only the polling loop is missing. Removing the feature would discard significant working code. The poller is a small addition; the `simulate` endpoint remains useful for ops testing.

**Alternatives considered**: Remove the feature. Rejected — the implementation is ~90% complete; the scheduler is the last 10%.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `JWT_SECRET` fail-fast breaks existing local dev setups that rely on the default | `.env` already sets it; `docker compose up` reads `.env`. Document the requirement in README. |
| `SEED_DEMO_USERS=false` by default means fresh dev installs have no test users | Set `SEED_DEMO_USERS=true` in `.env` (already present); document in README quickstart. |
| `signaturePath` → `hasSignature` is a wire-format change | Frontend already optional-chains `signature_path`; update both sides atomically in this change. Only field using it is the "Sign Report" button visibility. |
| Switching frontend to `output: standalone` may break if `next.config.ts` doesn't enable it | Add `output: 'standalone'` to `next.config.ts` as part of the Dockerfile change; verify the build locally. |
| Non-root + read-only root FS may break the OCR sidecar (writes model cache to `/root/.EasyOCR`) | Change the volume mount to `/home/ocr/.EasyOCR` and set `EASYOCR_HOME` env; test the sidecar startup. |
| Running the 10 existing tests in CI may reveal failures that were hidden | That's a feature, not a risk — fix any failures as part of this change. Tests use Testcontainers (real PG), so they're authoritative. |
| `@Transactional` additions may surface previously-hidden LazyInitializationExceptions if a lazy collection is accessed outside the transactional bounds | Add `@Transactional(readOnly = true)` to list endpoints that access lazy collections; the audit already flagged EAGER→LAZY as a follow-up. |
| `bucket4j` rate-limiting may reject legitimate traffic if limits are too aggressive | Start with 10 req/min on `/login` and 5 req/min on `/refresh`; make configurable via `application.yml`. |
| `logback-spring.xml` JSON output makes local dev logs harder to read | Profile-gated: `dev` profile keeps human-readable console; only `prod` uses JSON encoder. |

## Migration Plan

1. **Backend changes ship first** (critical-bugfixes, secrets, validation, transactions) — no contract breaks except `signaturePath`→`hasSignature`.
2. **Frontend changes ship second** — atomically with the `signaturePath` removal so the "Sign Report" button continues to work.
3. **Docker/CI changes ship together** — the frontend prod-build Dockerfile + CI test wiring + security scanning in one PR, verified by the CI run itself.
4. **Observability** (Prometheus registry, logback) ships last — no behavioral impact, purely additive.
5. **Rollback**: every change is independently revertible via `git revert`. The only data-migration is `V5__constraints.sql` (additive NOT NULL/CHECK/indexes) — rollback requires `DROP` but the migration is forward-only by design.

## Open Questions

- Should the rate-limit on `/api/auth/login` return `429 Too Many Requests` or `200` with an error body? (Default: `429` with `Retry-After` header — idiomatic.)
- What IMAP poll interval is appropriate? (Default: 5 minutes, configurable via `imap.poll-interval`.)
- Should `show-details: always` on `/actuator/health` be downgraded to `when-authorized`? (Default: yes — restrict DB driver/disk details to `chef_finance`/`mod`.)
