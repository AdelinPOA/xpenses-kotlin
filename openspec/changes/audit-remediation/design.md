## Context

`audit-consolidated.md` (verified 2026-06-22) consolidates three prior audits into 95 unresolved findings. Four prior OpenSpec changes (`production-readiness-hardening`, `performance-query-optimization`, `fix-codebase-bugs-and-debt`, `code-quality-gaps-round-2`) are **fully implemented** (all tasks checked off) yet the audit re-confirms residual gaps — typically the same class of bug in a *different* file or a *partial* fix. This change closes the residue plus the genuinely net-new findings, as a single mega-change sequenced by the audit's four-sprint roadmap.

Current constraints that shape the approach:
- **Flyway with `ddl-auto: validate`** — all schema changes go through a new `V17` (never edit applied migrations). Hibernate validates entities against the schema at startup, so entity-type and column-type changes must land together.
- **OSIV is on by default** — lazy relations currently resolve during view rendering; disabling it (H16) requires fixing every lazy-load site first, so it is sequenced after the JOIN FETCH work.
- **Host JDK is 25; Kotlin 2.1.0 needs ≤ JDK 22** — backend tests run in CI on JDK 21, not on this host. Verification of backend changes is via CI / Docker, not local `./gradlew test`.
- **Snake_case JSON via Jackson** — DTO shape changes ripple to the frontend.

## Goals / Non-Goals

**Goals:**
- Remediate all 95 net-new unresolved findings, grouped by the four-sprint roadmap, each task tagged with its finding ID and `file:line`.
- Add capability specs only for behavioral changes; keep config/devops/refactor items as spec-less tasks.
- Reference, never duplicate, the four implemented changes; for performance items in their domain, extend `performance-query-optimization` rather than re-spec it.
- Keep each sprint independently shippable and verifiable (CI green, health check, targeted curl).

**Non-Goals:**
- The three by-design tradeoffs (C3, H12, M5) — documented, not changed.
- The irreversible/non-issue items (H7 V8 `DATE`→`VARCHAR`, M13 `orphanRemoval`) — documented only.
- New product features. This is hardening/remediation, not feature work.
- Re-implementing anything already delivered by the four referenced changes.

## Decisions

**1. One mega-change, four task sections (not four changes).** Chosen per the user's scope decision. Rationale: a single `tasks.md` is the audit's single source of truth and avoids cross-change dependency bookkeeping. Alternative (per-sprint changes) rejected to avoid four sets of overlapping specs. The four sprints remain shippable in order via task-section boundaries.

**2. Reference-don't-duplicate the four implemented changes.** For C1/M3/M4 (performance domain) the tasks note *"extends change: performance-query-optimization"* and add only the residual DB-pushdown work (privileged dashboard aggregation, report-list pagination, remaining in-memory sorts, batch saves) — no new pagination capability is specified, since that capability already exists.

**3. Schema changes consolidated into a single `V17`.** C5 (`deleted_at`→`TIMESTAMPTZ`), H8 (`inventory_items.request_id` index), M14 (mileage `CHECK (>= 0)`), H9 (`version` columns on `expenses`/`receipts`), M7 (`deleted`/`deleted_at` on `mileage_records`), M12 (advance status default), and the H5 `Double`→`numeric` column retypes all land in one ordered migration. Rationale: one validate-compatible deployment step; entity changes ship in the same release. Alternative (one migration per fix) rejected as noisy and harder to keep in lockstep with entity edits under `validate`.

**4. `Double`→`BigDecimal` is the highest-risk task and is gated.** It touches 15+ entity fields, FX/total/allowance arithmetic, DTO serialization (JSON number format changes), and DB column types. It is sequenced in Sprint 3 *after* the security/ops quick wins, done behind comprehensive arithmetic tests, and shipped as its own commit so it can be reverted independently. Marked **BREAKING**.

**5. CSRF via `SameSite=Strict` + Origin verification (default), CSRF token optional.** The app is a same-origin first-party SPA behind a VPN; `SameSite=Strict` cookies plus server-side `Origin`/`Referer` checks close the gap with the least frontend churn. A `CookieCsrfTokenRepository` is the alternative if a future cross-subdomain deployment needs it; the spec permits either.

**6. JWT-claims principal (M2) keeps a load-on-demand escape hatch.** The filter stops doing an unconditional `findById` per request and instead builds a lightweight principal from claims; controllers that genuinely need the full `User` entity load it explicitly. Rationale: removes a DB round-trip from every authenticated request without breaking the few endpoints that mutate the user entity.

**7. Atomic report+notification via `@TransactionalEventListener(AFTER_COMMIT)`.** Preferred over a full DB outbox table for its smaller footprint; the spec also allows an outbox if delivery durability across restarts becomes a requirement. Approver lookup switches to a role-scoped query (no `findAll()`).

**8. Service extraction (H15) reuses the established `ReportService`/`ExpenseService` pattern.** Controllers become thin; shared `calculateDailyAllowance` (M10) is defined once in the service layer and consumed by both `ReportController` and `PdfService`.

**9. Spec-less tasks for pure plumbing.** `.dockerignore`, CI caching, DNS, healthchecks, log limits, `libs.versions.toml`, ktlint/detekt, file splits (`Models.kt`), frontend `lib/format.ts`, query-key centralization, skeletons, and the LOW batch carry no spec deltas — they change no externally-observable requirement.

## Risks / Trade-offs

- **`Double`→`BigDecimal` data/JSON regression** → Mitigate: comprehensive precision tests before/after; ship as an isolated, revertible commit; verify JSON shape against the frontend; back up DB before the `V17` retype on real data.
- **`V17` on existing rows with bad data** (e.g. negative mileage failing the new `CHECK`) → Mitigate: pre-flight data audit query; clean or `USING`-clause-coerce before adding constraints; H7's already-stringified `purchase_date` is explicitly out of scope.
- **Disabling OSIV (H16) surfaces hidden `LazyInitializationException`** → Mitigate: land all JOIN FETCH / `@Transactional(readOnly)` fixes first (H4 and the performance-query work), flip OSIV last in Sprint 3, run the full controller test set added in Sprint 4.
- **CSRF `SameSite=Strict` can break flows relying on top-level cross-site navigation** → Mitigate: app is first-party SPA; verify login/refresh/download flows after the change; keep token-repository fallback documented.
- **JWT-claims principal could desync from DB role changes mid-session** → Mitigate: short access-token TTL already in place; role change takes effect on next token refresh — acceptable and documented.
- **Backend changes can't be tested on this host (JDK 25)** → Mitigate: rely on CI (JDK 21) and Dockerized runs; gate each sprint on CI green + smoke curls.
- **Mega-change scope creep / partial landing** → Mitigate: task sections are sprint-aligned and independently shippable; commit per sprint; keep `tasks.md` checkboxes authoritative.

## Migration Plan

1. **Sprint 1** (no schema): security/ops/config. Ship + CI green + `make test-health`.
2. **Sprint 2**: author `V17` (timestamptz, index, checks, version cols, mileage soft-delete cols, advance default). Deploy to a copy first; validate Hibernate startup; then entity `@Version`/soft-delete edits + M1/M2/M3/M4. Rollback: `V17` is additive except the `TIMESTAMPTZ` retype (reversible via `AT TIME ZONE`); keep a pre-migration DB snapshot.
3. **Sprint 3**: `Double`→`BigDecimal` (column retype appended to/after `V17`) as an isolated commit; then `Models.kt` split, service extraction, OSIV flip, `equals/hashCode`, version catalog, ktlint/detekt. Rollback: revert the BigDecimal commit independently.
4. **Sprint 4**: frontend quality + the 10 controller test suites + test-infra; fix README inaccuracies.

## Open Questions

- CSRF: confirm `SameSite=Strict` is acceptable for all current login/download flows, or do we need the token-repository approach now? (Default: `SameSite=Strict` + Origin.)
- `BigDecimal` migration: is a maintenance window with a DB snapshot available for the column retype on production data? (Required before the H5 retype runs.)
- Outbox vs. `AFTER_COMMIT` event for M1: is cross-restart notification durability a requirement, or is best-effort-after-commit sufficient? (Default: `AFTER_COMMIT` event.)
