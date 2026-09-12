# Prioritized production-hardening roadmap

## Planning rules

Plan against reconciled `bdb6fcba9845be7053b0087253bb4a1c191d96e3`, not against unchanged baseline wording in reports 01–04. See `00-executive-summary.md` for source-remediated/partial findings. This document is a plan, **not authorization already exercised to change production or rewrite history**.

Priority order: disclosure/auth/financial/evidence/outage first; field-user mobile blockers second; accessibility/form reliability third; performance/polish last. Each issue's canonical finding contains its detailed acceptance tests. Fixes need focused regression tests in the same PR; Phase 3 does not postpone testing until later. Optional unsafe features may be disabled with a recovery/export path until repaired.

Effort is rough engineering size, not a promised schedule: **S** ≤1 focused engineer-day, **M** 2–3 days, **L** 4+ days or cross-system work. Each phase can contain several L tasks; migration, incident response, review and real-device QA add uncertainty. Finance must approve historical-value policy; operations/security owns keys, rollout and restore.

## Phase 0 — Stop-ship critical fixes

**Goal:** Contain the new secret exposure and prevent irreversible financial/privacy/evidence errors before increasing production use.

### Tasks and likely files

| Task | Findings / status | Files likely to change | Effort |
|---|---|---|---|
| Contain committed-secret incident; identify consumers and copies; protected backup; staged key/downstream credential rotation, session revocation and approved redaction/history response | SEC-013; current Critical | `docs/agy/audit/3.8/05-deployment-ops-audit.md` (redact only with owner coordination), `services/CryptoService.kt`, JWT/token consumers, secret-manager deployment config, incident/rotation runbook, security tests | L |
| Complete account transition isolation: cancel/recheck active queue replay, partition all caches/counts/drafts, migrate ownerless items into quarantine, test old installed SW upgrade | SEC-002/003; partial source changes | `frontend/components/{AuthProvider,OfflineSyncProvider,Providers}.tsx`, `frontend/lib/{offlineQueue,queryKeys}.ts`, `frontend/public/sw.js`, PWA tests | L |
| Add authoritative owner-bound idempotency for expense creation/receipts and report create+attach, persist progress and recover partial saves | FE-001/003 remain | `ExpenseController.kt`, `ExpenseService.kt`, report lifecycle/controller, new migration/operation repository; capture/new-report/ExpenseForm/OfflineSyncProvider and API contracts | L |
| Correct mileage-inclusive PDF formula and stop legacy mileage partial recalculation; define posting snapshot for allowance/settlement/signature rather than reading mutable current settings/files | BE-001/002/008/010; BE-003 partial | `PdfService.kt`, `services/mapper/ReportMapper.kt`, `MileageController.kt`, `AdvanceController.kt`, `ExpenseReport.kt`, lifecycle, snapshot migrations and exports | L |
| Make receipt filename inspection read-only; retain removal of lossy Undo; verify safe insurance downloads through same-origin browser | FE-004 remains; FE-002/SEC-001 source remediation present | `frontend/components/expenses/ExpenseForm.tsx`, expenses list, `InsuranceController.kt`, focused HTTP/Playwright tests | S–M |
| Gate IMAP until trusted sender binding and report+ledger atomic success exist; SEEN must never reopen successful work; lease fencing required | BE-004/SEC-006 partial | `EmailImportService.kt`, `ImapIngestionLedger.kt`, message/report relation migration, gateway policy/runbook, integration tests | L |
| Gate/repair accepted OCR jobs: durable input, recovery/retries/age limits, provider calls outside DB transactions, per-receipt budget across all endpoints | BE-005/006, SEC-005 partial | `AsyncOcrService.kt`, `OcrService.kt`, OCR/bulk controllers, executor/job model/repository/migrations, `frontend/lib/ocrScan.ts` | L |
| Prove DB+receipt+signature+key recoverability; bound logs/headroom; verify deployed private bindings, no demo credentials and explicit prod config | OPS-001–004/006, BE-007 | Compose/env templates, backup/restore/runbooks, DataInitializer, durable storage cleanup where needed | L |

Backend Kotlin names in this roadmap resolve under `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/`; migrations under `backend-kotlin-jpa/src/main/resources/db/migration/`.

**Risks:** Key rotation can strand legacy ciphertext; changing financial formulas can silently alter posted history; unsafe queue migration can destroy or reassign drafts; disabling workers without preserving accepted input loses evidence. Do not rewrite applied migrations or delete queues. Existing posted reports need explicit finance-approved correction policy, not opportunistic recalculation.

**Acceptance criteria:** No live/reused disclosed key remains trusted; encrypted settings survive planned migration. Every create/replay operation yields at most one record and preserves evidence. Nonzero-component API/PDF financial parity, immutable posted settlement/signature, no partial legacy recalculation. Inspection generates no writes. IMAP/OCR are either disabled safely or pass crash/identity/quota gates. Restore succeeds in disposable infrastructure; deployed critical config/log/ingress/account checks recorded.

**Verification commands:**

```bash
cd backend-kotlin-jpa && ./gradlew test --rerun-tasks --no-daemon
cd ../frontend && npx tsc --noEmit --incremental false && npm run build
# Run only newly added targeted specs against isolated fixture backend:
PLAYWRIGHT_PORT=3107 npm run test:e2e -- --project=mobile-chromium --project=mobile-webkit
cd .. && docker compose config --quiet
```

Full E2E currently includes fixture/mocked assumptions; select new deterministic security/partial-write tests as they are implemented and require their execution. Owner runs redacted secret scans, controlled rotation and restore drill; do not publish expanded Compose config.

**Phase effort:** L (multiple cross-system tracks). **Exit:** owner/security/finance sign-off with evidence, not just merged commit IDs.

## Phase 1 — Mobile field-user usability fixes

**Goal:** Technicians and managers can complete receipt-to-review work safely on iPhone/Android with reliable session, back navigation, forms and evidence access.

### Tasks

1. Finish MUX-001: new detail route exists; fix incorrect receipt `/download` suffix and preserve originating list/search/back context. **S**.
2. Verify SEC-004 source fix using expired JWT/refresh, long-lived polling and parallel tabs; distinguish network loss from logout; expose owner-bound failed-queue inspect/retry/edit/export/discard (FE-005). **L**.
3. Replace fragile history-only dirty guards with recoverable owner-isolated drafts; cover report create/edit, expense, signature, picker/focus refresh and actual mobile Back (MUX-003). **L**.
4. Finish shared accessible sidebar/dialog behavior, stable nonlocalized structural selectors, hidden focus suppression, focus trap/restore, scroll lock and safe areas (MUX-002/006). **M–L**.
5. Sweep **all** visible controls for 44×44 targets/names, not just expense cards; associated labels/error mapping/live status, true date-range validation, 16px mobile inputs and predictable keyboards (MUX-004/005). **L**.
6. Finish real receipt tab visibility and normal baseline-zoom scrolling; retain photo/manual completion on OCR failure, one operation and absolute cancellation deadline (MUX-007, FE-006). **M**.
7. Separate loading/error/empty/stale states and stop false all-clear/silent inline mutation rejection (FE-008). **M–L**.
8. Verify new dark-signature export and stored legacy signatures on white PDF/print; finish decision translation keys and blocking contrast gaps (MUX-008/009/011). **M**.

**Files likely to change:** `frontend/app/expenses/[id]/page.tsx`, capture/report/mileage/advance/profile/admin pages; `components/layout/{AppShell,Sidebar}.tsx`, receipt/form/drawer/Toast/SignaturePad components; `lib/{useFormGuard,navigationGuard,ocrScan,offlineQueue}.ts*`, Auth/Offline providers, `app/globals.css`, EN/RO catalogs; PDF/signature handling if legacy repair is approved.

**Risks:** Browser history interception can break Next navigation; modal focus and body-lock cleanup differ across devices; a file picker can trigger refetch/visibility changes; theme correction must not alter evidence unexpectedly. Preserve working safe-area/dvh and primary touch-target controls.

**Acceptance criteria:** All core flows complete at 360/390/412/430 in both browser engines, locales/themes, with populated/error data; no accidental mutation from preview or silent draft loss. No overflow/control occlusion; ≥44px controls, meaningful labels/status, no serious/critical axe defects. Physical device keyboard/camera/back/PWA and VoiceOver/TalkBack checklist signed off.

**Verification commands:**

```bash
cd frontend
npx tsc --noEmit --incremental false
npm run i18n:check
npm run lint
npm run build
PLAYWRIGHT_PORT=3107 PLAYWRIGHT_AUTHENTICATED_UI=true npm run test:e2e:mobile
npm run test:e2e
```

Provide isolated fixture credentials externally and **fail if authenticated tests skip**. Expand Playwright projects to four widths and service-worker-enabled PWA tests; current scripts alone do not cover the acceptance matrix.

**Phase effort:** L. **Dependencies:** Phase 0 account/idempotency policy; narrow UI work may run in parallel but no field-user sign-off before data/privacy gates.

## Phase 2 — Security and data-integrity hardening

**Goal:** Consistent lifecycle authorization, immutable accounting/evidence, safe concurrency, input validation and privacy policy across all paths.

### Tasks

- Finish shared report-aggregate locking/version strategy for parent lifecycle and child expenses/mileage/advances; test two real independent transactions (BE-009). **L**.
- Centralize allowed report/advance transitions and exceptions; enforce server date/currency validation, historical snapshots and migration constraints (BE-003/011). **M–L**.
- Fix Romanian date-only month ranges and default-date policy without altering history; centralize mutation invalidation of all related caches (FE-009/010). **M**.
- Define refresh token family/atomic rotation and replay grace policy; disable/re-enable and logout access-token semantics; negative Origin/Referer auth-route tests (SEC-007/008/011). **L**.
- Require appropriate secure LDAP/mail transport, constrain admin destination+stored-secret binding and define trusted sender gateway contracts (SEC-009/010/006). **M–L**.
- Implement durable evidence cleanup/remote retry and accurate incomplete ZIP reporting (BE-007/012); avoid swallowing persistence failures. **L**.
- Approve retention, provider processing, deletion/export and audit-log policy for receipts/OCR/IMAP/browser caches/backups/signatures (SEC-012). **L**.

**Files likely to change:** report lifecycle/state machine, Authorization/ExpenseService, Advance/Mileage/Auth controllers, refresh repositories/token entities, schema constraints/locking migrations, storage and ZIP export, email/LDAP/settings services; frontend format/range/query keys and mutation clients; retention jobs and privacy runbooks.

**Risks:** Broad locks can degrade throughput; naive refresh reuse revocation logs out legitimate concurrent tabs; credential changes can lock out enterprise integrations; retention conflicts with financial audit obligations. Preserve ownership checks and frozen FX policy; do not infer “manager may edit anything.”

**Acceptance criteria:** Concurrency outcomes deterministic, no successful write violates lifecycle invariants, posted values unchanged absent approved correction workflow; expected 401/403 contract; transport rejects insecure/misdirected use; partial downloads explicitly identified; retention/deletion auditable and approved.

**Verification commands:** `cd backend-kotlin-jpa && ./gradlew test --rerun-tasks --no-daemon`; `cd frontend && npx tsc --noEmit --incremental false && npm run test:e2e`. Add PostgreSQL barrier-controlled concurrency and synthetic-key tests; timezone projects `Europe/Bucharest` winter/summer/midnight/month-end. Owner-run gateway/transport tests only in isolated staging.

**Phase effort:** L. **Dependencies:** Phase 0 snapshot/idempotency decisions; Phase 1 must use the same permission/error contracts.

## Phase 3 — Test coverage and CI gates

**Goal:** Green checks represent actual covered source, authenticated workflows and runnable production images.

### Tasks

1. Fix ESLint TS/TSX parsing, React/hooks coverage and generated-report ignores; add a fixture demonstrating TSX rule violation fails (FE-012/OPS-009). **S–M**.
2. Seed deterministic isolated backend users/data, not production credentials; mandatory authenticated mobile counts, four widths, RO/EN/themes, role matrix and dedicated real-SW privacy tests (FE-011). **L**.
3. Add missing nonzero financial component/output parity, provider/DB failure, lost-response, concurrent-operation and restart tests from report 06. **L**.
4. Add used-translation-key checks, visual baselines for populated routes, accessibility/focus/target checks and redacted traces/screenshots. **M–L**.
5. Add production-profile Compose smoke: unique project/container names and free ports, build/start/migrate/auth/read, teardown. Prevent hardcoded current container names from colliding with existing deployments. **M–L**.
6. Require secret/dependency/image scans and all quality jobs before release; scan history with redaction, record exceptions/expiry and dependency update ownership. Verify branch-protection configuration separately. **M**.

**Files likely to change:** `frontend/eslint.config.mjs`, package/lockfile, `playwright.config.ts`, `tests/**`, parity script; backend test base and domain/controller/integration tests; `.github/workflows/ci.yml`, dedicated test Compose config, scan configuration and CI artifact policy.

**Risks:** Auth secrets absent on PRs can silently skip gates; mocked empty fixtures miss overflow; globally blocked SW hides privacy regressions; transactional test wrappers hide real races. Test failures must not be “fixed” by loosening assertions or disabling security.

**Acceptance criteria:** Required tests cannot skip for missing fixtures; known seeded failures break the correct gate; all production TSX linted; clean+upgrade DB startup verified; artifacts contain synthetic data only; test/build/scan jobs required before release.

**Verification commands:**

```bash
cd frontend
npm ci
npx tsc --noEmit --incremental false
npm run lint
npm run i18n:check
npm run build
npm run test:e2e
cd ../backend-kotlin-jpa
./gradlew test bootJar --no-daemon
cd ..
docker compose config --quiet
```

Dependency installation/build commands here are proposed CI validation, not all executed by the audit. Provision browsers in CI and run newly defined isolated Compose smoke and vulnerability scanners with pinned versions/redacted output.

**Phase effort:** L. **Dependencies:** Dedicated fixtures and safe network/provider boundaries; focused regression tests already accompany Phases 0–2.

## Phase 4 — Performance, observability and operations

**Goal:** Predictable bounded behavior, diagnosable failures and demonstrated recovery under representative field workload.

### Tasks

- Normalize SSR/client query options, bounded pagination and identity keys; remove unused hydration data; measure route payload/request count and slow-server rendering (FE-007, BE-013). **M–L**.
- Stream/bound exports and images, impose meaningful request/provider deadlines and queue admission controls; measure actual heap/native/image memory before JVM tuning (BE-005/006/013). **L**.
- Instrument correlation IDs and worker age/error/budget/DB-pool metrics, support IDs and actionable alerts without private payloads (OPS-007). **M**.
- Set Redis bounds/ACL/network policy and test fail-closed outage/expiry/AOF recovery; verify logs and disk alerts (OPS-005/006). **M**.
- Implement trustworthy dependency readiness separately from process liveness; repair/archive incomplete Kubernetes manifest, verify persistent evidence and safe replica scaling (OPS-010). **M–L**.
- Automate off-site complete backups and periodic isolated restore drills with documented RPO/RTO; rehearse key rotation and storage migration recovery (OPS-004). **L**.
- Verify image promotion/API rewrite contract; remove misleading envs; keep pinned dependencies/images updated; publish TLS/proxy/HSTS/header and rollback runbook (OPS-001/002/008/009). **M**.

**Files likely to change:** frontend server pages/query options/serverApi/next config; backend list repositories/export/OCR workers/metrics/security filters; runtime YAML/logging, Compose/Dockerfiles/deployment.yaml, scripts/backup/restore, env templates, monitoring and operational documentation.

**Risks:** Cache optimization can reintroduce private-data leakage; streaming must preserve authorization and completeness; indiscriminate Redis eviction weakens quotas; readiness misconfiguration causes restart storms; elevated JVM heap can starve native memory. Avoid unmeasured universal heap percentages or destructive live chaos tests.

**Acceptance criteria:** Representative scale stays inside documented memory/latency/provider budgets; initial fetches do not duplicate or hydrate unbounded lists; failures have traceable IDs and alerts; planned DB/Redis/provider outage recovers; evidence restored and verifiable within approved RPO/RTO; supported deployment is reproducible.

**Verification commands:** `docker compose config --quiet`; `cd frontend && npm run build`; `cd backend-kotlin-jpa && ./gradlew test bootJar --no-daemon`; owner-run isolated image-build/promotion/load/outage/restore exercises with sanitized `docker inspect` and metric captures. Never chaos-test or restore over the existing live volumes.

**Phase effort:** L. **Dependencies:** Worker/idempotency/ownership controls before replica scaling; Phase 0 already requires essential recoverability/headroom.

## Phase 5 — Visual polish and design-system cleanup

**Goal:** Cohesive, legible, field-oriented design without changing financial or permission semantics.

### Tasks

- Consolidate semantic button/field/error/dialog/loading/empty primitives after behavior is proven; remove unused/duplicated drawer implementations (MUX-004/005/006/012). **M–L**.
- Finish EN/RO copy, locale-aware date/currency display, narrow-header wrapping and status semantics; remove raw `return (` JSX text if still present (MUX-009/010/012). **M**.
- Refine visual hierarchy, mobile density and daylight readability; coherent tokens/type scale and non-color status cues across dark/light; reduced-motion compliance (MUX-008). **M**.
- Measure bundles before extracting heavy client modules; retain SSR benefits and safe cached-data boundaries. Optimize images/icon imports only against measured benefit (FE-007). **M**.
- Update the historical mobile-remediation plan and README claims to reflect demonstrated, not merely intended, IMAP/test/production behavior. **S**.

**Files likely to change:** `frontend/components/ui/**`, dashboard/layout/expense/report shared components, `app/globals.css`, catalogs/formatters, route client boundaries, snapshot baselines, `docs/mobile-ui-remediation-plan.md`, README.

**Risks:** Cosmetic refactors can regress safe areas, scroll/focus, or data mutation behavior; snapshot rebaselining can hide defects. Do not accept accessibility loss as brand differentiation or make labels smaller to mask overflow.

**Acceptance criteria:** Consistent mobile and desktop hierarchy with no financial/permission regression; no missing keys or incidental JSX text; measured contrast and 44px contracts retained; approved populated screenshots for four widths/two themes/locales; no critical/serious axe issues.

**Verification commands:** `cd frontend && npm run lint && npm run i18n:check && npm run build`; isolated `npm run test:e2e` plus new responsive/visual projects and manual daylight/assistive-tech review. Do not blindly update snapshots.

**Phase effort:** L. **Dependencies:** Phases 0–3 release gates; performance changes use Phase 4 measurements. Visual polish is not a substitute for fixing financial correctness.

## Release evidence checklist

- [ ] SEC-013 incident scope/rotation/redaction verified without disclosing values.
- [ ] Phase 0 financial/privacy/evidence risks fixed or affected features safely disabled.
- [ ] Source fixes deployed and validated; baseline/current/live revisions recorded.
- [ ] All targeted regression tests execute, no hidden skips; fresh backend suite pass.
- [ ] Full authenticated mobile matrix and physical-device checklist signed off.
- [ ] Restore, key recovery, ingress/profile/account/log controls verified.
- [ ] Named owners approve remaining **Needs verification** risks; no hypothesis silently promoted to confirmed closure.
