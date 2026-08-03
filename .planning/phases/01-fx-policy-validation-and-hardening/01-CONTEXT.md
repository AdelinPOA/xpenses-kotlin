# Phase 1: FX Policy Validation and Hardening - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate and harden the locked FX conversion policy across expenses, advances, mileage, settings, fallback dates, and historical records. This phase clarifies implementation and verification behavior within the existing Kotlin/Spring Boot and Next.js architecture; it does not change the ADR's policy decisions or add unrelated financial capabilities.

</domain>

<decisions>
## Implementation Decisions

### Fallback-date cache semantics
- **D-01:** When a fallback provider supplies a rate for a requested expense date, persist the actual provider/source date rather than representing the rate as if it came from the requested date.

### FX settings validation
- **D-02:** Validate `fx_margins` updates atomically. If any currency or margin entry is invalid, reject the entire update with clear field-specific validation errors and leave the existing configuration unchanged.

### Cross-workflow verification
- **D-03:** Build comprehensive conversion-matrix coverage in `FxService`, plus focused workflow tests for expenses, advances, and mileage proving each uses the shared policy and stores the resolved rate correctly. Do not duplicate the full matrix in every workflow.

### Historical and manual-rate safeguards
- **D-04:** Use automated regression tests and migration/cache-cleanup safety checks. Posted records must retain their frozen rate and EUR total after relevant maintenance paths, while manual rate overrides must continue to take precedence.

### the agent's Discretion
- Exact test fixture builders, assertion organization, error-message wording, and the implementation mechanism used to persist the provider's actual source date remain open to the researcher and planner, provided D-01 through D-04 hold.

</decisions>

<specifics>
## Specific Ideas

- The locked policy is defined by ADR-0001 and must remain the source of truth.
- Financial configuration updates should behave transactionally: no partial or silently clamped margin configuration.
- Historical correctness needs repeatable automated evidence, not only a one-time database inspection.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Policy and requirements
- `docs/adr/0001-bnr-fx-rates-with-margin.md` — locked BNR, margin, fallback, date, override, and historical-value policy.
- `.planning/REQUIREMENTS.md` — FX-01 through FX-05 acceptance scope for this phase.
- `.planning/ROADMAP.md` — phase goal and exit criteria.

### Existing implementation and test context
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt` — centralized FX resolution and caching.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt` — application settings API boundary.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExpenseService.kt` — expense conversion workflow.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AdvanceController.kt` — advance conversion workflow boundary.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt` — mileage workflow boundary.
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/FxServiceTest.kt` — existing FX service test coverage.
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/ExpenseServiceTest.kt` — existing expense service test patterns.
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt` — existing mileage controller test patterns.
- `frontend/app/admin/settings/SettingsClient.tsx` — settings UI validation and configuration behavior.
- `frontend/tests/admin/settings.spec.ts` — existing settings browser-test coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FxService` centralizes rate resolution and is the natural home for the shared conversion matrix and source-date behavior.
- Existing `FxServiceTest`, `ExpenseServiceTest`, and `MileageControllerTest` provide test conventions to extend.
- `SettingsClient` and the admin settings Playwright spec provide existing UI/API integration points for margin validation.

### Established Patterns
- Backend follows controller → service → repository/entity/DTO layering, with Flyway as the schema source of truth.
- Financial workflows share report-level behavior and persist through Spring Data/JPA; historical values must remain frozen after posting.
- Frontend server state and API calls use the existing Next.js/TanStack Query conventions; settings behavior should fit the current admin settings flow.

### Integration Points
- BNR and ECB/Frankfurter provider calls and cache persistence live in `FxService`.
- Expense, advance, and mileage controllers/services consume the shared FX behavior.
- `AppSettingsController`/`SettingsClient` own configurable `fx_margins` updates.
- Flyway/cache maintenance paths must be checked for historical-rate preservation.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within the phase scope.

</deferred>

---

*Phase: 01-fx-policy-validation-and-hardening*
*Context gathered: 2026-08-03*
