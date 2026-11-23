# Mileage Entry Editing for Draft Expense Reports

*   **Author:** adelinpoa
*   **Status:** Approved
*   **Date:** 2026-11-23

--------------------------------------------------------------------------------

## Overview

Technicians use Xpenses to log distance-based travel (`MileageRecord`) on an open `ExpenseReport` and generate the Excel `Trip sheet` (`foaie de parcurs`). Today, once a Technician saves a `MileageRecord` on `/reports/[id]/mileage`, the web interface offers no way to edit it on desktop or mobile. Fixing any mistake requires deleting the trip and re-entering all eight fields.

This design adds single-trip editing on `/reports/[id]/mileage` for draft `ExpenseReport` owners and updates the existing `PATCH /api/reports/{reportId}/mileage/{mileageId}` backend endpoint so edits preserve saved financial and `Vehicle` snapshots, serialize safely against concurrent vehicle deletion or report submission, fit 360–390px mobile viewports, and ship without a database migration.

## The Problem

Technicians keep a draft `ExpenseReport` open across a 1–3 week assignment, entering trips daily on mobile or desktop and using weekday Copy/Paste. Mistakes in distance, route names, start/end timestamps, `Vehicle` selection, round-trip flag, or trip notes happen frequently and are often noticed immediately after saving or while reviewing the `Trip sheet` before submission.

Without an edit flow, Technicians must delete and recreate the `MileageRecord`. That workaround creates three problems:

1. **Manual rework and new typos:** Re-typing route, timestamps, vehicle, and notes to correct one field takes extra effort on mobile screens and risks new errors.
2. **Unintended financial re-pricing:** Deleting and recreating a trip snapshots today's global mileage rates and tax settings instead of preserving the rates captured when the trip was first logged.
3. **Defects in the existing backend and UI:** Although `PATCH /api/reports/{reportId}/mileage/{mileageId}` already exists on the backend, wiring an edit button to it today would expose existing defects:
    *   The mileage page gates mutating controls only on `report.status === "draft"`, not on ownership, so a `Moderator` viewing another Technician's draft sees mutating controls and prefills their own `Vehicle` odometer.
    *   The backend `PATCH` handler checks field presence instead of actual value changes, overwrites saved `Vehicle` snapshots when an unchanged `vehicle_id` is sent, re-fetches live RON/EUR `FX rate` data on distance-only edits, cannot clear `description` to empty, and writes modern fuel columns onto legacy rows created before Flyway migration `V32` (which introduced fuel and tax columns).
    *   The backend `POST` and `PATCH` handlers run external HTTP lookups inside `@Transactional` alongside `REQUIRES_NEW` cache writes (risking HikariCP pool self-deadlock on a 10-connection pool), do not lock the parent `ExpenseReport` against concurrent `submit`, and do not verify optimistic-lock `version` or flush `@Version` increments before serializing responses.
    *   The existing trip form restricts distance input to 0.1 km steps (blocking valid 2-decimal trips), lacks mobile touch-target and iOS Safari width guards, and lets a `start_time` edit leave `end_time` behind (for example, turning a 1-hour trip into a 25-hour overnight entry).

## Goals

*   **Edit any field of a saved draft trip on desktop and mobile:** Draft `ExpenseReport` owners can edit `origin`, `destination`, `start_time`, `end_time`, `distance_km`, `Vehicle` assignment (including clearing to no vehicle), `round_trip`, and `description` (including clearing to `null`) on `/reports/[id]/mileage` without losing scroll position in multi-week lists.
*   **Enforce strict owner-only, draft-only access:** Only the `ExpenseReport` owner can see or execute mileage creation, editing, odometer updates, and deletion, and only while `report.status === "draft"`.
*   **Preserve historical pricing and saved `Vehicle` snapshots:** Unrelated edits and distance-only edits keep creation-time gross/tax rates, same-day `FX rate` (when a positive `fuelExchangeRate` is already persisted), and saved `Vehicle` snapshots (even when the `Vehicle` was later edited or deleted in Profile) without external network calls. Date or `Vehicle` changes recalculate from explicit inputs without writing modern fuel columns onto legacy pre-V32 rows.
*   **Prevent concurrency corruption and ship without schema changes:** Mileage mutations do not hold database transactions open across external HTTP calls, serialize against concurrent report `submit` and `deleteVehicle`, reject stale multi-tab edits with HTTP `409 Conflict`, emit structured SLF4J audit logs, and deploy safely with backend-first rollout and frontend-first rollback.
*   **Prevent common mobile and timestamp entry errors:** Changing `start_time` preserves trip duration by shifting `end_time` automatically unless `end_time` was edited independently; decimal distance entry accepts both `.` and `,` down to `0.01 km` and displays hundredths accurately across all mileage totals; mobile actions satisfy 44×44px minimum touch targets without horizontal overflow at 360–390px.

## Non-Goals

*   **Bulk multi-trip editing:** Technicians edit one `MileageRecord` at a time. Weekday Mon–Fri paste remains creation-only.
*   **Offline mileage editing:** Mileage pricing depends on server-side fuel price and `FX rate` resolution; offline mutation queuing is out of scope, matching existing online-only create and delete flows.
*   **Editing non-draft reports or moderator overrides:** Technicians must use the existing `recall` action to return a `submitted` or `rejected` `ExpenseReport` to `draft` before editing mileage. `Moderator` users do not edit another Technician's mileage entries.
*   **Retroactive re-pricing of unchanged trips:** Changing global mileage settings or `Vehicle` specifications in Profile does not re-price existing `MileageRecord` rows unless the Technician explicitly changes the trip's date or vehicle.
*   **Changing `businessDate` timezone policy:** `VehicleMileage.businessDate()` remains `ZoneOffset.UTC` uniformly across create and update to avoid altering pricing dates for existing midnight-window drafts and breaking locked UTC contract tests.
*   **Database schema migrations (`V111`):** All required columns (including `mileage_records.version`) exist on Flyway `V110`; no new migration is added.
*   **Refactoring upstream FX/fuel provider caching internals:** Adding single-flight or yearly XML caches inside `BnrRateProvider` (BNR — National Bank of Romania FX provider) and `HttpFuelPriceProvider` is out of scope and tracked separately.

## Open Questions

None. All scope, API contract, concurrency, and UX decisions are settled.

## Critical User Journeys (CUJs)

### CUJ 1: Correct a Mistake on a Saved Draft Trip (Desktop and Mobile)

*   **Given**: A Technician owns a `draft` `ExpenseReport` containing 20+ `MileageRecord` rows across multiple weeks on `/reports/[id]/mileage`.
*   **When**: The Technician taps **Edit** on a trip row or card, changes `distance_km` (for example using a comma decimal such as `12,25`), edits `origin`, clears `description` to empty, and clicks **Save**.
*   **Then**:
    *   The modal closes on success without resetting the page's scroll position.
    *   The trip saves with `description` cleared, preserves its creation-time gross/tax rates and persisted same-day `FX rate`, and displays `12.25 km` without rounding hundredths away.
    *   The trip row, weekly subtotal, grand totals, `/reports/[id]` report totals, and `Trip sheet` `.xlsx` export reflect the updated `EUR amount` and distance; a confirmation toast appears.

### CUJ 2: Reschedule a Trip to Another Day or Week

*   **Given**: A Technician owns a `draft` `ExpenseReport` with a 1h 30m trip on Wednesday and the previous week collapsed in `MileageWeeklyList`.
*   **When**: The Technician opens **Edit**, changes `start_time` to Tuesday of the collapsed previous week (without manually editing `end_time`), checks the live duration preview (`1h 30m`), and clicks **Save**.
*   **Then**:
    *   `end_time` shifts automatically to preserve the 1h 30m duration instead of creating a multi-day overnight entry.
    *   The trip recalculates using the fuel price and RON/EUR `FX rate` for the new business date.
    *   The UI expands the destination week, moves the trip into Tuesday's day group, highlights the updated row briefly, and shows a toast naming the destination day.

### CUJ 3: Edit a Trip Whose `Vehicle` Was Deleted or Modified in Profile

*   **Given**: A `MileageRecord` holds a saved `Vehicle` snapshot whose linked `Vehicle` was either deleted from Profile (`vehicle_id = null`) or later edited to a different fuel consumption or plate.
*   **When**: The Technician opens **Edit**, fixes a typo in `destination`, leaves the `Vehicle` selector on its default `"{plate} · {makeModel} (saved on trip)"` option, and saves — or explicitly picks a different active `Vehicle` or `"No vehicle (standard rate)"`.
*   **Then**:
    *   On an unrelated edit, the saved `Vehicle` snapshot and fuel consumption remain unchanged, and `Trip sheet` vehicle metadata is preserved.
    *   When the Technician chooses another active `Vehicle` or clears the vehicle, the saved snapshot updates (or clears) and modern-row pricing recalculates accordingly.

### CUJ 4: Non-Owner or Non-Draft Viewer Opens Mileage Page

*   **Given**: A `Moderator` opens another Technician's `draft` `ExpenseReport`, or a Technician opens their own `submitted`, `approved`, `rejected`, or `paid` `ExpenseReport`.
*   **When**: They navigate to `/reports/[id]/mileage`.
*   **Then**:
    *   No Add, Edit, Copy, Paste, Delete, or starting-odometer editing controls are rendered, empty draft days are hidden, and the viewer's own vehicles are not fetched.
    *   Any direct API `PATCH` attempt by a non-owner returns HTTP `403`, and any `PATCH` against a non-draft report returns HTTP `400`.

### CUJ 5: Concurrent Edit or Submit Conflict Handling

*   **Given**: A Technician opens the Edit modal for a trip in Tab A while submitting the `ExpenseReport` (or editing the same trip) in Tab B.
*   **When**: The Technician clicks **Save** in Tab A after Tab B has already committed.
*   **Then**:
    *   The backend rejects the stale edit with HTTP `409 Conflict` (version mismatch) or HTTP `400` (report no longer `draft`) without overwriting Tab B's changes or corrupting submitted totals or `Vehicle.last_odometer_km` (which `advancePrimaryVehicleOdometer` updates from `starting_odometer_km + totalDistanceKm` on report submit).
    *   The modal stays open with an inline localized error alert, preserves the Technician's typed values, and refreshes report data in the background so the latest server state is visible once dismissed.

## Technical Plan (Architecture)

### System Overview & Component Boundaries

The design preserves the existing backend module boundaries (`MileageController` -> `VehicleMileage` -> pricing ports and JPA repositories) and splits the frontend mileage feature into four focused modules: `frontend/lib/api/mileage.ts` (typed HTTP client), `frontend/lib/format.ts` (shared decimal parsing and 2-decimal km formatting), `frontend/lib/mileageTripForm.ts` (modal draft diff, duration shift, and vehicle snapshot-drift logic, keeping `frontend/lib/mileageWeeks.ts` focused on calendar grouping and weekday Copy/Paste), and `frontend/components/reports/MileageTripModal.tsx` (unified create/edit dialog).

```text
[Browser: /reports/[id]/mileage]
  │  canEdit = (report.status === "draft" && user.id === report.user_id)
  │
  ├─ MileagePage (modalState, copiedTripId, controlled collapsedWeeks, paste queue)
  │    ├─ MileageWeeklyList ──► TripRowActions (Edit / Copy / Delete)
  │    └─ MileageTripModal (mode = "create" | "edit")
  │         └─ frontend/lib/mileageTripForm.ts + frontend/lib/format.ts
  │
  ▼  POST / PATCH / DELETE via frontend/lib/api/mileage.ts (45s timeout)
[Backend: MileageController -> VehicleMileage]
  │
  ├─ Phase 1 (readTx): verify owner + draft, validate input/bounds, capture version & pricing inputs
  ├─ Phase 2 (no DB tx): external fuel price / FX lookups ONLY when semantic deltas require them
  └─ Phase 3 (writeTx): acquireUserLock(actorId) -> ExpenseReportRepository.findByIdForUpdate(reportId)
                        -> re-verify owner, draft, version & vehicle pricing inputs -> calculate
                        -> saveAndFlush(rec) -> emit structured SLF4J audit log
```

### 1. API & Serialization Contract

All endpoints remain under `/api/reports/{reportId}/mileage`:

*   **Optimistic-lock version token:** `MileageRecordOut` exposes `version` populated from `MileageRecord.version`. The frontend `MileageRecord` type treats `version` as optional so records hydrated from React Query's IndexedDB cache (`frontend/lib/queryPersister.ts`) before an upgrade remain valid until refetched.
*   **Partial `PATCH` semantics (`MileageRecordUpdate`):**
    *   `origin` and `destination` are optional; when provided, they are trimmed, required to be non-blank, and bounded to 255 characters (`400` otherwise).
    *   `description` follows the blank-string clearing convention used in `ExpenseReports.updateReport` (lines 172–181 for `kundenauftrag`..`techniker`, extended with trimming here): omitted or `null` leaves `rec.description` unchanged; blank or whitespace-only (`""`) clears `rec.description` to `null`; non-blank text is trimmed and bounded to 1000 characters. No `clear_description` boolean is added.
    *   `distance_km` is validated as finite and within `0.01..100000.0` (`400` otherwise), aligned between `createMileage` and `updateMileage`.
    *   `start_time` and `end_time`: timestamps must fall inside `2020-01-01T00:00:00Z` through `now + 1 year` (`400` otherwise). On `createMileage`, both timestamps are checked; on `updateMileage`, only newly supplied `start_time`/`end_time` values are checked so untouched pre-2020 legacy rows are not locked out. After bounds validation (`400`), the merged `(targetStartTime, targetEndTime)` pair must satisfy `end_time > start_time` (`422` otherwise).
    *   `vehicle_id` and `clear_vehicle`: specifying both `clear_vehicle: true` and a non-null `vehicle_id` is rejected with HTTP `400`.
    *   `round_trip`: updates the informational flag without recalculating pricing.
    *   `version`: optional expected entity version; mismatch throws `OptimisticLockingFailureException` (mapped to HTTP `409 Conflict`).
*   **Jackson 3 deploy-skew tolerance:** `application.yml` explicitly disables `fail-on-unknown-properties` so this release and subsequent backend releases tolerate additive JSON fields from newer clients instead of returning HTTP `400`.

### 2. Backend Execution Flow, Concurrency & Locking

External HTTP providers (`HttpFuelPriceProvider` and `BnrRateProvider`) persist cache misses via `PROPAGATION_REQUIRES_NEW`. Running them inside an outer `@Transactional` method holds two HikariCP connections per request on a 10-connection pool and can self-deadlock under concurrent edits. Removing `@Transactional` from `createMileage` and `updateMileage` and splitting both into three phases via `TransactionTemplate` (`readTx` -> out-of-transaction external lookups -> `writeTx`) eliminates that pool hazard:

1.  **Phase 1 (`readTx`):** Verify report ownership (`403`) and draft status (`400`), validate merged time order (`422`), load the target `MileageRecord`, verify optional `body.version` (`409`), compute semantic deltas, and capture `phase1Version = rec.version` plus the target `UserVehicle`'s pricing inputs (`fuelType`, `fuelConsumptionLitersPer100Km`). Release the DB connection.
2.  **Phase 2 (no DB transaction):** Call only the external HTTP ports (`fuelPricePort`, `fxRatePort`) required by the semantic deltas. Local PostgreSQL `app_settings` reads (`ratesConfigPort.currentRates()`) stay inside `writeTx`, not Phase 2.
3.  **Phase 3 (`writeTx`):**
    *   Acquire locks in canonical order: unconditionally call `userVehicleRepository.acquireUserLock(actorId)` (a PostgreSQL transaction advisory lock `pg_advisory_xact_lock`, not a `users` row lock), then call `expenseReportRepository.findByIdForUpdate(reportId)` (renamed from `findByIdForOcrPromotion` to reuse the existing `PESSIMISTIC_WRITE` query).
    *   Why unconditional advisory locking: `deleteVehicle` runs `ON DELETE SET NULL` cascading row updates onto `mileage_records` without incrementing `mileage_records.version`. Acquiring `acquireUserLock(actorId)` on every `createMileage`, `updateMileage`, and `deleteMileage` serializes mileage writes against `deleteVehicle` (preventing FK `23503` failures on non-vehicle edits) with no circular dependency because vehicle CRUD acquires only the advisory lock while `ExpenseReportLifecycle.submit` locks only `expense_reports` and runs `advancePrimaryVehicleOdometer` after commit.
    *   Load the parent report directly via `findByIdForUpdate(reportId)` and check existence (`404`), ownership (`403`), and draft status (`400`) in order.
    *   Reload `MileageRecord`, verify `freshRec.version == (body.version ?: phase1Version)` (`409` on mismatch), and if `vehicleChanged` verify the reloaded `UserVehicle` still exists (`404`) and matches Phase 1's `(fuelType, fuelConsumptionLitersPer100Km)` (`409` if edited concurrently mid-flight; no HTTP retry loop).
    *   Read `ratesConfigPort.currentRates()` locally when needed (`createMileage`, or modern-row `updateMileage` where `vehicleChanged` and either `clearVehicle` or `resolvedVehicle.fuelConsumptionLitersPer100Km == null`).
    *   Apply field mutations and pure math, call `mileageRecordRepository.saveAndFlush(rec)` so JPA increments `@Version` before `toMileageRecordOut(saved)` serializes the response, and emit the structured audit log.

`deleteMileage` also acquires `acquireUserLock(actorId)` followed by `findByIdForUpdate(reportId)` inside its short write transaction so deletes cannot commit after a concurrent `submit`.

### 3. Semantic Delta Detection, Snapshot Fidelity & Legacy Row Handling

*   **Semantic deltas (never presence-only):**
    *   `distanceChanged`: true only when `body.distanceKm` differs numerically from `rec.distanceKm`.
    *   `dateChanged`: true only when `businessDate(targetStartTime)` differs from `businessDate(rec.startTime)` (using `ZoneOffset.UTC` uniformly).
    *   `vehicleChanged`: true only when clearing a record that has a linked vehicle or any saved `vehicle_*` snapshot field, or when `body.vehicleId` differs from `rec.vehicle?.id`. Resending an unchanged `vehicle_id` or `distance_km` is a pricing no-op.
*   **Modern rows (`hasFuelFields`):**
    *   When `dateChanged` alone (with `!vehicleChanged`), fuel price lookup uses the trip's saved `rec.vehicleFuelType` snapshot.
    *   On `!dateChanged` (distance-only or same-day vehicle edits), `updateMileage` reuses persisted `rec.fuelExchangeRate` whenever it is non-null and positive — requiring zero external FX calls. Missing/non-positive `rec.fuelExchangeRate` triggers `resolveFuelExchangeRate` (the modern fuel-pricing FX helper) only when `distanceChanged || dateChanged || vehicleChanged`, never on metadata-only edits.
    *   On `clearVehicle`, only `fuelConsumptionLitersPer100Km` resets to `defaultFuelConsumption` while creation-time tax and deduction rates remain unchanged. Switching to an active `UserVehicle` with `fuelConsumptionLitersPer100Km == null` also fills `defaultFuelConsumption` from `ratesConfigPort.currentRates()`.
    *   Silent `?: return` guards in `recalculate()` are removed by passing validated non-null calculation settings to `MileageCalculator.calculate`.
*   **Legacy pre-V32 rows (`!hasFuelFields`):**
    *   Evaluated before writing any modern fuel pricing fields.
    *   On `vehicleChanged`, only trip-sheet snapshot fields (`vehicle`, `vehiclePlate`, `vehicleMakeModel`, `vehicleFuelType`, `vehicleCategory`) update; modern fuel columns remain `null`.
    *   On `distanceChanged` or `dateChanged`, fixed `rateBeforeTax`/`rateAfterTax` and `resolveFxRate` (the legacy FX helper, on `dateChanged`) continue to apply.

### 4. Observability, Audit Logging & Error Handling

*   **Structured audit logging:** `VehicleMileage` logs an `INFO` line on every committed create, update, and delete containing `actorId`, `reportId`, `mileageId`, semantic delta flags, `recalcPath` (`none` | `modern` | `legacy`), `startTime`, `businessDate`, and before/after distance, totals, fuel price/source, FX rate, and plate.
*   **Upstream and conflict visibility:** `VehicleMileage` logs FX lookup failures at `WARN` with context and cause, and returns a fixed sanitized HTTP `502` message (`"Exchange rate service unavailable. Please try again."`). `FuelPriceService` logs a `WARN` on `provider_miss` fallback. `VehicleMileage.advancePrimaryVehicleOdometer` logs its outcome or skip reason. `ValidationExceptionHandler` elevates `OptimisticLockingFailureException` from `DEBUG` to `WARN` and logs `5xx` `ResponseStatusException` responses at `ERROR`.

### 5. Frontend Architecture & Unified Modal Contract

*   **Client API (`frontend/lib/api/mileage.ts`):** Centralizes `createMileage`, `updateMileage`, and `deleteMileage` with a `45_000` ms request timeout so normal upstream fallback chains (`HttpFuelPriceProvider` 15s × 3, `HttpFxRateProvider` 10s × 3) are not aborted prematurely by the browser.
*   **Pure helpers (`frontend/lib/format.ts` & `frontend/lib/mileageTripForm.ts`):**
    *   `format.ts` provides `parseStrictDecimal` (accepts `.` or `,`, finite `0.01..100000`) and `formatDistanceKm` (displays 1 decimal minimum and 2 decimals when hundredths are non-zero, replacing all 6 `.toFixed(1)` mileage display sites).
    *   `mileageTripForm.ts` provides `isoToDateTimeLocal`, `shiftEndTimeForStartChange`, `computeTripDurationPreview`, `detectVehicleSnapshotDrift`, and `buildMileagePatchPayload`. All modules imported by `npm run test:mileage:unit` use strictly top-level `import type` / `export type` and zero extensionless runtime local imports so Node's `--experimental-strip-types` runner executes them directly.
*   **Vehicle snapshot drift & 3-state selector:**
    *   `detectVehicleSnapshotDrift(trip, vehicles)` returns `"matched" | "drifted" | "deleted" | "none"`. It compares `vehicle_category` only when `trip.vehicle_category != null` (pre-V109 compatibility) and compares `fuel_consumption_l_per_100km` only when *both* `trip.fuel_consumption_l_per_100km != null` and `vehicle.fuel_consumption_l_per_100km != null` (preventing false positives for active vehicles with `null` consumption that stored the global default `7.5`).
    *   When `drift === "drifted"`, the modal excludes `v.id === trip.vehicle_id` from the selectable active `<option>` list so Technicians cannot select a drifted vehicle under its own ID and trigger a silent backend no-op.
    *   While `/users/me/vehicles` is loading or errored in edit mode, the modal preserves `keep_snapshot` rather than misclassifying the vehicle as deleted.
*   **Unified `<MileageTripModal mode="create" | "edit">`:**
    *   Replaces the inline Add form and scroll-jump behavior in `page.tsx`, following the responsive modal layout and accessibility pattern of `PreflightSubmissionDrawer` (`frontend/app/reports/[id]/ReportDetailClient.tsx`).
    *   Rendered whenever `modalState !== null` (never gated on `canEdit`, so a background refetch after a CUJ 5 `409`/`400` cannot unmount the modal or wipe typed inputs).
    *   Provides duration-preserving `start_time` auto-shift, live duration + `+Nd` preview, single-unit distance label with decimal keyboard, round-trip total-distance helper hint, UTC-aligned recalculation notice in edit mode, dirty-dismiss confirmation, pending-save dismiss lock, focus restoration, and localized inline error alerts (`ECONNABORTED`/`ETIMEDOUT` -> `409` -> `429` -> server `detail` -> generic fallback).
*   **Page state, ownership gating, clipboard & cache updates:**
    *   `canEdit = Boolean(user && report && report.status === "draft" && report.user_id === user.id)` gates all mutating controls, empty draft day rows, weekday paste, odometer editing, and `/users/me/vehicles` fetching.
    *   Clipboard state stores `copiedTripId: number | null` derived from `report.mileage_records`; clipboard `Escape` is disabled while the modal is open; Edit and Delete are disabled while weekday paste (`pastingDates.size > 0`) or delete is in flight.
    *   On create, edit, or delete success, standard `qc.invalidateQueries` for `reportKeys.all` and `mileageKeys.all` refreshes totals from the server (no duplicated client-side `ReportTotals` math). On `PATCH` success, controlled `collapsedWeeks` state expands the target week if collapsed, highlights the updated row for `2500ms`, and displays a toast naming the destination day when moved. On `400`/`404`/`409`/timeout errors in edit mode, the page triggers a background report refetch. Delete failures display via `toast.error(...)`, and report load failures render `QueryErrorNotice`.

## Alternatives Considered

### Alternative A: Dedicated Edit Modal Alongside the Existing Inline Add Form

*   **Pros**: Leaves the top expandable Add trip panel in `frontend/app/reports/[id]/mileage/page.tsx` untouched and narrows the immediate UI diff to editing only.
*   **Cons**: Duplicates eight form inputs, `Vehicle` dropdown formatting, locale decimal parsing, and timestamp validation across two surfaces; keeps the scroll jump whenever a Technician clicks `+` on a day row in a multi-week list; and risks create-vs-edit drift.
*   **Reason for Rejection**: Unifying creation and editing inside `<MileageTripModal mode="create" | "edit">` removes duplicated form markup and preserves scroll position for both per-day additions and trip edits.

### Alternative B: Inline Row and Card Editing Inside `MileageWeeklyList`

*   **Pros**: Avoids overlay chrome and keeps edits visually anchored inside the clicked table row or mobile card.
*   **Cons**: Eight editable fields (origin, destination, two `datetime-local` pickers, `Vehicle` selector, decimal distance, description, and round-trip checkbox) do not fit into a 10-column desktop table or 360–390px mobile cards without horizontal overflow, cramped touch targets, or layout shift.
*   **Reason for Rejection**: A responsive modal gives full-width mobile inputs, safe-area footer actions, and consistent desktop/mobile validation without destabilizing the weekly table layout.

### Alternative C: Adding `clear_description: Boolean = false` to `MileageRecordUpdate`

*   **Pros**: Mirrors the explicit boolean clear flags already used for non-string nullable fields (`clear_vehicle`, `clear_starting_odometer`, `clear_make_model`).
*   **Cons**: Redundant with blank-string clearing already established for `String?` fields in `ExpenseReports.updateReport` (`""` -> `null`, omitted/`null` -> unchanged); introduces contradictory-flag combinations; and adds an extra unknown-property field during deploy skew.
*   **Reason for Rejection**: Blank-string clearing matches existing backend string conventions and keeps the DTO smaller.

### Alternative D: Migrating `VehicleMileage.businessDate()` from `ZoneOffset.UTC` to `Europe/Bucharest`

*   **Pros**: Aligns pricing date boundaries with `TripSheetExporter` (`Europe/Bucharest`), `FuelPriceProvider.resolvePriorityForDate` (Romania daily fuel-price lookup), and Romanian local browser days, preventing trips between `00:00` and `02:59` EEST from crossing UTC midnight on same-day edits.
*   **Cons**: Alters pricing lookup dates for existing midnight-window drafts relative to already-persisted records and breaks locked UTC contract assertions in `VehicleMileageTest.kt` (`L138–159`, `L230–257`).
*   **Reason for Rejection**: Changing business-date timezone semantics expands scope into historical pricing behavior; retaining `ZoneOffset.UTC` uniformly across create and update keeps existing contract tests intact while audit logs record both `startTime` and `businessDate`.

### Alternative E: Upgrading Legacy Pre-V32 Rows to Modern Fuel and Tax Pricing on Edit

*   **Pros**: Converges historical fixed-rate `MileageRecord` rows onto the modern fuel-deduction calculation path when edited.
*   **Cons**: Snapshots today's global tax and deduction rates onto older fixed-rate trips, violating the snapshot-preservation non-goal and causing unexpected net `EUR amount` jumps when a Technician fixes a typo or attaches a `Vehicle`.
*   **Reason for Rejection**: Legacy rows remain on fixed-rate calculation and only update trip-sheet `Vehicle` snapshot fields (`vehicle`, `vehiclePlate`, `vehicleMakeModel`, `vehicleFuelType`, `vehicleCategory`) when vehicle selection changes, without writing modern fuel pricing columns.

### Alternative F: Manual `copiedTrip` Object Synchronization Across Mutation Callbacks

*   **Pros**: Keeps the existing `useState<MileageRecord | null>` declaration in `page.tsx`.
*   **Cons**: Requires imperative synchronization inside `updateMileage.onSuccess`, `deleteMileage.onSuccess`, and any future mutation, and still drifts stale after background React Query refetches.
*   **Reason for Rejection**: Storing only `copiedTripId: number | null` and deriving `copiedTrip` from `report.mileage_records` keeps the clipboard aligned with the query cache automatically.

## Risks & Mitigations

*   **Open-tab and Service Worker rollback skew:** Cached browser tabs (or PWA Service Worker `xpenses-v9`) can continue sending `version` and `description: ""` briefly if the backend is rolled back before clients reload. *Mitigation:* Always roll back frontend before backend, and keep `spring.jackson.deserialization.fail-on-unknown-properties: false` enabled from this release onward.
*   **`V107` -> `V110` Flyway migration boundary on production:** `HANDOFF.md` records live production on `V107` while `main` is on `V110`, and `application-prod.yml` enforces `spring.flyway.validate-on-migrate: true`. *Mitigation:* Verify `flyway_schema_history` before deploying; if `V108`–`V110` run in the same release window, take a verified `pg_dump` backup via `scripts/backup-db.sh` first, since rolling back from `V110` to `V107` requires a database restore.
*   **UTC midnight-window split for `00:00`–`02:59` EEST trips:** Because `VehicleMileage.businessDate()` uses `ZoneOffset.UTC`, editing a trip across `00:00`–`02:59` local time can change the UTC business date. *Mitigation:* The modal's recalculation notice compares UTC dates (`toISOString().slice(0, 10)`) to match the backend, and audit logs record both `startTime` and `businessDate`.
*   **Upstream cold-date latency and timeout recovery:** Concurrent cold-date edits can trigger slow upstream fuel/FX fallbacks. *Mitigation:* External calls run outside DB transactions (no HikariCP pool starvation), the frontend client uses a `45_000` ms timeout, and timeout/network errors trigger a background report refetch so `version` and trip state reconcile if the write committed server-side.
*   **Concurrent `deleteVehicle` / `submit` / `updateMileage` lock ordering:** *Mitigation:* All mileage writes acquire the per-user advisory lock (`acquireUserLock(actorId)`) before `ExpenseReportRepository.findByIdForUpdate(reportId)`, matching vehicle CRUD (advisory lock only) and `submit` (`expense_reports` row lock before post-commit odometer advancement) with zero circular lock dependency.

## Non-Functional Requirements

*   **Security & Privacy:** Server-side authorization (`403` non-owner, `400` non-draft, `404` non-owned vehicle) executes inside `writeTx`. Upstream FX failures return a fixed sanitized HTTP `502` payload without leaking internal exception messages.
*   **Performance & Latency:** External FX/fuel HTTP calls hold zero DB connections; same-date edits with persisted `fuelExchangeRate > 0` perform zero external HTTP calls; frontend mileage mutations use a 45-second request timeout and single-flight Save locking.
*   **Rollout & Rollback:**
    *   **Deploy order:**
        1. Verify `flyway_schema_history` is at `V110` (if advancing from `V107` to `V110` in the same window, run `scripts/backup-db.sh` first).
        2. Deploy backend (activating `fail-on-unknown-properties: false`, `version`, and blank-string `description` clearing).
        3. Deploy frontend.
    *   **Rollback order:**
        1. Roll back frontend first (removing modal payloads sending `version` and `description: ""`).
        2. Roll back backend (container-only between `V110` images; rolling back from `V110` to `V107` requires restoring the pre-deploy DB backup).

## Additional Resources

*   Canonical domain glossary: [CONTEXT.md](../../CONTEXT.md)
*   Production release and schema state: [HANDOFF.md](../../HANDOFF.md)
*   Related editing design convention: [expense-editing-and-ocr-review.md](./expense-editing-and-ocr-review.md)

## Future Improvements

*   **Upstream FX and fuel provider single-flight caching:** Add in-memory yearly XML caching in `BnrRateProvider`, single-flight coalescing in `HttpFuelPriceProvider`, and short-TTL negative caching for out-of-coverage historical fuel dates.
*   **Explicit profile-vehicle refresh action:** Add an explicit `"Refresh from vehicle profile"` action inside the edit modal so a Technician can opt in to re-snapshotting a drifted active `Vehicle` with the same `vehicle_id` in one step.
*   **Canonical `Europe/Bucharest` business-date alignment:** Evaluate migrating `VehicleMileage.businessDate()` from `ZoneOffset.UTC` to `Europe/Bucharest` in a dedicated change covering historical midnight-window drafts and contract tests.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Phase 1: Backend Core Contract, Locking & Logging

#### 1. `backend-kotlin-jpa/src/main/resources/application.yml` (Modify)
*   **Type / Scope**: Spring Boot Configuration
*   **Proposed Changes**: Add `spring.jackson.deserialization.fail-on-unknown-properties: false` under `spring.jackson`.

#### 2. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordOut.kt` (Modify)
*   **Type / Scope**: Kotlin Response DTO
*   **Proposed Changes**: Add `@JsonProperty("version") val version: Int = 0`.

#### 3. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt` (Modify)
*   **Type / Scope**: Kotlin Request DTO
*   **Proposed Changes**:
    *   Text length bounds: `@field:Size(max = 255)` on `origin` and `destination`; `@field:Size(max = 1000)` on `description`.
    *   Numeric bounds: `@field:DecimalMax("100000.0")` on `distanceKm`.

#### 4. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordUpdate.kt` (Modify)
*   **Type / Scope**: Kotlin Request DTO
*   **Proposed Changes**: Keep `origin`, `destination`, and `description` nullable without `@NotBlank`; add `@field:Size(max = 255)` on `origin` and `destination`, `@field:Size(max = 1000)` on `description`, `@field:DecimalMax("100000.0")` on `distanceKm`, and `@JsonProperty("version") val version: Int? = null`.

#### 5. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/mileage/MileageRecordMapper.kt` (Modify)
*   **Type / Scope**: Kotlin Domain Mapper
*   **Proposed Changes**: Map `version = m.version` in `toMileageRecordOut`.

#### 6. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/ExpenseReportRepository.kt` (Modify)
*   **Type / Scope**: Spring Data JPA Repository
*   **Proposed Changes**: Rename `findByIdForOcrPromotion` (`@Lock(LockModeType.PESSIMISTIC_WRITE)`) to `findByIdForUpdate` and update its callers in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt` and `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ocr/AsyncOcrTest.kt`.

#### 7. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/mileage/VehicleMileage.kt` (Modify)
*   **Type / Scope**: Kotlin Domain Service
*   **Proposed Changes**:
    *   Add SLF4J logger and optional `PlatformTransactionManager? = null` (`readTx` and `writeTx` `TransactionTemplate`s when non-null).
    *   Extract shared validation and snapshot helpers for both `createMileage` and `updateMileage`:
        *   Text normalization (`origin`/`destination` trimmed, non-blank, `<= 255` -> `400`; `description` trimmed, blank -> `null`, `<= 1000` -> `400`).
        *   Finite bounded `distanceKm` (`0.01..100000.0` -> `400`).
        *   Timestamp window (`Instant.parse("2020-01-01T00:00:00Z")` through `ZonedDateTime.now(ZoneOffset.UTC).plusYears(1).toInstant()` -> `400`), validated on both timestamps in `createMileage` and only on newly supplied `body.startTime`/`body.endTime` in `updateMileage`. Validate merged `endTime > startTime` (`422`) in Phase 1 and Phase 3 after `400` bounds checks.
        *   Vehicle snapshot assignment and non-null `MileageCalculator.calculate` mapping (removing silent `?: return` guards).
    *   Remove `@Transactional` from `createMileage` and `updateMileage`; implement the 3-phase flow (`readTx` -> external HTTP ports -> `writeTx`):
        *   In `readTx`, capture `phase1Version = rec.version` and target `UserVehicle` pricing inputs (`fuelType`, `fuelConsumptionLitersPer100Km`).
        *   In Phase 2, invoke only external HTTP ports (`fuelPricePort`, `fxRatePort`). Guard missing/non-positive `rec.fuelExchangeRate` fallback behind `distanceChanged || dateChanged || vehicleChanged`.
        *   In `writeTx`, unconditionally call `userVehicleRepository.acquireUserLock(actorId)`, then load the report directly via `expenseReportRepository.findByIdForUpdate(reportId)` (checking `404` -> `403` -> `400`), verify `freshRec.version == (body.version ?: phase1Version)` (`OptimisticLockingFailureException` -> `409`), verify reloaded `UserVehicle` still exists (`404`) and matches Phase 1 pricing inputs (`409` on mismatch), read `ratesConfigPort.currentRates()` locally when needed, apply mutations, call `mileageRecordRepository.saveAndFlush(rec)`, and emit structured `INFO` audit log.
        *   In `deleteMileage`, acquire `userVehicleRepository.acquireUserLock(actorId)` then `expenseReportRepository.findByIdForUpdate(reportId)` before checking ownership (`403`), draft (`400`), and deleting.
    *   In `updateMileage`, reject `clearVehicle && vehicleId != null` (`400`), compute semantic deltas (`distanceChanged`, `dateChanged`, `vehicleChanged`), reuse `rec.fuelExchangeRate` when `!dateChanged && > 0`, protect legacy pre-V32 rows (`!hasFuelFields`) from modern fuel column writes, sanitize FX `502` responses (`"Exchange rate service unavailable. Please try again."`) with `WARN` logs, and log `advancePrimaryVehicleOdometer` outcomes/skip reasons.

#### 8. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fuel/FuelPriceService.kt` (Modify)
*   **Type / Scope**: Kotlin Service
*   **Proposed Changes**: Emit an SLF4J `WARN` log inside `manualFallback` when `provider_miss` triggers fallback pricing.

#### 9. `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/ValidationExceptionHandler.kt` (Modify)
*   **Type / Scope**: Spring MVC Exception Handler
*   **Proposed Changes**: Elevate `handleOptimisticLockingFailure` from `debug` to `warn`, and log `5xx` statuses in `handleResponseStatusException` at `error`.

#### 10. Backend Tests (Modify)
*   `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/mileage/VehicleMileageTest.kt`: Add tests for non-owner `403`, non-draft `400`, trimmed/blank `origin`/`destination` & `description` clearing, contradictory `clear_vehicle` + `vehicle_id`, semantic-delta no-ops, distance-only fuel edit reusing `fuelExchangeRate` with zero FX calls, missing/non-positive `fuelExchangeRate` on distance edit vs origin-only edit, switching to active `UserVehicle` with `fuelConsumptionLitersPer100Km == null`, deleted-vehicle snapshot preservation, legacy pre-V32 row vehicle edit, `version` mismatch `OptimisticLockingFailureException`, finite/upper-bound `distance_km` and timestamp window (including pre-2020 untouched edit safety), sanitized `502` FX error message, and a `@Transactional(propagation = Propagation.NOT_SUPPORTED)` test passing `@Autowired PlatformTransactionManager` to `makeModule(...)` that asserts `TransactionSynchronizationManager.isActualTransactionActive() == false` inside both `fxRatePort` and `fuelPricePort` for `createMileage` and `updateMileage` with `TransactionTemplate` cleanup in a `finally` block.
*   `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt`: Verify `version` in JSON, `409` on stale `version`, `400` on blank `origin` / contradictory flags / out-of-range distance, `200` on blank `description` -> `null`, and `200` on unknown JSON property.
*   `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/config/ValidationExceptionHandlerTest.kt`: Verify `OptimisticLockingFailureException` returns `409` and `502` `ResponseStatusException` returns its sanitized detail.
*   `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/ocr/AsyncOcrTest.kt`: Update `findByIdForOcrPromotion` references to `findByIdForUpdate`.
*   **Phase 1 Checkpoint**: `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.mileage.VehicleMileageTest --tests eu.nt.xpenses.controllers.MileageControllerTest --tests eu.nt.xpenses.config.ValidationExceptionHandlerTest --tests eu.nt.xpenses.mileage.TripSheetExporterTest --tests eu.nt.xpenses.report.ExpenseReportsTest --tests eu.nt.xpenses.ocr.AsyncOcrTest --no-daemon`

---

### Phase 2: Frontend Types, API Client & Pure Helpers

#### 11. `frontend/lib/types/report.ts` (Modify)
*   **Type / Scope**: TypeScript Domain Types
*   **Proposed Changes**: Add `version?: number` to `MileageRecord`; export `MileageCreatePayload` and `MileageUpdatePayload` (`origin?`, `destination?`, `start_time?`, `end_time?`, `distance_km?`, `description?`, `vehicle_id?`, `clear_vehicle?`, `round_trip?`, `version?`).

#### 12. `frontend/lib/api/mileage.ts` (Create)
*   **Type / Scope**: Frontend API Client Module
*   **Proposed Changes**: Export:
    *   `createMileage(reportId: number, payload: MileageCreatePayload): Promise<MileageRecord>` (`POST /reports/${reportId}/mileage`, `{ timeout: 45_000 }`)
    *   `updateMileage(reportId: number, mileageId: number, payload: MileageUpdatePayload): Promise<MileageRecord>` (`PATCH /reports/${reportId}/mileage/${mileageId}`, `{ timeout: 45_000 }`)
    *   `deleteMileage(reportId: number, mileageId: number): Promise<void>` (`DELETE /reports/${reportId}/mileage/${mileageId}`, `{ timeout: 45_000 }`)

#### 13. `frontend/lib/api.ts` (Modify)
*   **Type / Scope**: Frontend API Barrel Exports
*   **Proposed Changes**: Re-export `createMileage`, `updateMileage`, `deleteMileage` from `./api/mileage` and `MileageCreatePayload`, `MileageUpdatePayload` from `./types/report`.

#### 14. `frontend/lib/format.ts` (Modify)
*   **Type / Scope**: Shared Formatting & Parsing Helpers
*   **Proposed Changes**: Export `parseStrictDecimal(raw: string): number | null` (regex `/^\d+([.,]\d+)?$/`, finite, `0.01 <= value <= 100000`) and `formatDistanceKm(km: number): string` (shows 1 decimal when hundredths are `0`, 2 decimals otherwise, e.g. `12.0`, `12.5`, `12.25`, `0.01`).

#### 15. `frontend/lib/mileageTripForm.ts` (Create)
*   **Type / Scope**: Pure Mileage Form Helpers (Node `--experimental-strip-types` compatible: strictly top-level `import type` / `export type`, zero extensionless runtime local imports)
*   **Proposed Changes**: Export:
    *   `VehicleChoice = { kind: "keep_snapshot" } | { kind: "vehicle"; vehicleId: number } | { kind: "none" }`
    *   `MileageDraftValues = { origin: string; destination: string; startTime: string; endTime: string; distanceKm: string; description: string; roundTrip: boolean }`
    *   `isoToDateTimeLocal(iso: string): string`
    *   `shiftEndTimeForStartChange(prevStartLocal: string, prevEndLocal: string, nextStartLocal: string): string` (returns `prevEndLocal` if any input is invalid or `prevEnd <= prevStart`)
    *   `computeTripDurationPreview(startLocal: string, endLocal: string): { durationMinutes: number; formatted: string; dayOffset: number } | null`
    *   `detectVehicleSnapshotDrift(trip: MileageRecord, vehicles: UserVehicle[]): "matched" | "drifted" | "deleted" | "none"`
    *   `buildMileagePatchPayload(original: MileageRecord, draft: MileageDraftValues, vehicleChoice: VehicleChoice, initialVehicleChoice: VehicleChoice): MileageUpdatePayload | null` (minute-precision timestamp comparison; `description: ""` when clearing non-empty description; vehicle fields only when choice changed; attaches `version` only on non-empty diff; returns `null` when unchanged).

#### 16. `frontend/lib/mileageWeeks.ts` (Modify)
*   **Type / Scope**: Calendar Grouping & Copy/Paste Helpers
*   **Proposed Changes**: Replace local `MileageCreatePayload` definition with `import type` / `export type` from `./types/report`.

#### 17. `frontend/tests/reports/mileage-weeks.test.mjs` (Modify)
*   **Type / Scope**: Frontend Unit Tests (`node:test`)
*   **Proposed Changes**: Add unit tests for `parseStrictDecimal`, `formatDistanceKm`, `isoToDateTimeLocal`, `shiftEndTimeForStartChange`, `computeTripDurationPreview`, `detectVehicleSnapshotDrift` (including null-consumption active vehicle and pre-V109 null `vehicle_category`), and `buildMileagePatchPayload` (minute-precision diffs, blank description clearing, no-op returning `null`, `version` attachment).
*   **Phase 2 Checkpoint**: `cd frontend && npm run typecheck && npm run test:mileage:unit`

---

### Phase 3: Frontend Unified Modal, Weekly List, Page & i18n

#### 18. `frontend/messages/en.json` & `frontend/messages/ro.json` (Modify)
*   **Type / Scope**: i18n Catalogs (`reports.*`)
*   **Proposed Changes**: Add matching EN/RO keys:

| Key (`reports.*`) | English (`en.json`) | Romanian (`ro.json`) |
| --- | --- | --- |
| `mileage_edit_title` | `Edit trip` | `Editează cursa` |
| `mileage_save_changes` | `Save changes` | `Salvează modificările` |
| `mileage_saving` | `Saving...` | `Se salvează...` |
| `mileage_action_edit` | `Edit` | `Editează` |
| `mileage_action_copy` | `Copy` | `Copiază` |
| `mileage_action_delete` | `Delete` | `Șterge` |
| `mileage_edit_trip_aria` | `Edit {origin} to {destination}` | `Editează {origin} către {destination}` |
| `mileage_copy_trip_aria` | `Copy {origin} to {destination}` | `Copiază {origin} către {destination}` |
| `mileage_delete_trip_aria` | `Delete {origin} to {destination}` | `Șterge {origin} către {destination}` |
| `mileage_vehicle_saved_on_trip` | `saved on trip` | `salvat pe cursă` |
| `mileage_vehicles_loading_hint` | `Loading vehicles... saved vehicle will be kept.` | `Se încarcă vehiculele... vehiculul salvat va fi păstrat.` |
| `mileage_vehicles_error_hint` | `Could not load vehicles. Saved vehicle will be kept.` | `Nu s-au putut încărca vehiculele. Vehiculul salvat va fi păstrat.` |
| `mileage_duration_preview` | `Duration: {duration}` | `Durată: {duration}` |
| `mileage_round_trip_hint` | `Informational flag only. Enter the total distance traveled (not doubled automatically).` | `Doar marcaj informativ. Introduceți distanța totală parcursă (nu se dublează automat).` |
| `mileage_recalc_hint` | `Amount will be recalculated on save.` | `Suma va fi recalculată la salvare.` |
| `mileage_toast_updated` | `Trip updated.` | `Cursa a fost actualizată.` |
| `mileage_toast_moved` | `Trip updated and moved to {day}.` | `Cursa a fost actualizată și mutată la {day}.` |
| `mileage_error_conflict` | `This trip was modified or the report status changed. Close and review the latest data.` | `Această cursă a fost modificată sau starea raportului s-a schimbat. Închideți și verificați datele actualizate.` |
| `mileage_error_timeout` | `The request timed out. Check if your changes were saved before trying again.` | `Cererea a expirat. Verificați dacă modificările au fost salvate înainte de a încerca din nou.` |
| `mileage_error_rate_limit` | `Too many requests. Please wait a moment and try again.` | `Prea multe cereri. Așteptați un moment și încercați din nou.` |
| `mileage_error_save` | `Could not save trip.` | `Nu s-a putut salva cursa.` |
| `mileage_error_delete` | `Could not delete trip.` | `Nu s-a putut șterge cursa.` |
| `mileage_distance_invalid` | `Enter a valid distance between 0.01 and 100,000 km.` | `Introduceți o distanță validă între 0,01 și 100.000 km.` |
| `mileage_end_before_start` | `End time must be after start time.` | `Ora de sosire trebuie să fie după ora de plecare.` |

(Reuse existing `reports.guard_unsaved_changes` for dirty-dismiss confirmation.)

#### 19. `frontend/components/reports/MileageTripModal.tsx` (Create)
*   **Type / Scope**: React UI Modal Component
*   **Proposed Changes**:
    *   Props: `mode: "create" | "edit"`, `initialDateKey?: string`, `trip?: MileageRecord`, `vehicles: UserVehicle[]`, `vehiclesLoading: boolean`, `vehiclesError: boolean`, `isPending: boolean`, `onClose: () => void`, `onCreate: (payload: MileageCreatePayload) => Promise<void>`, `onUpdate: (mileageId: number, payload: MileageUpdatePayload) => Promise<void>`.
    *   Follow `PreflightSubmissionDrawer` (`frontend/app/reports/[id]/ReportDetailClient.tsx:1084–1255`) for `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `z-50`, `useBodyScrollLock(true)`, `max-h-[90dvh]` scrollable body + sticky safe-area footer, `min-w-0` + `block w-full min-w-0 max-w-full` datetime inputs.
    *   In `mode="create"`: initialize `start_time`/`end_time` via `buildDefaultDateTimeLocal(initialDateKey)`, auto-select default vehicle when `vehicles` loads without dirtying, preserve `endTimeManuallyEdited` auto-shift, suppress edit recalculation hint.
    *   In `mode="edit"`: initialize `vehicleChoice` (`matched` -> `vehicle(id)`, `drifted`/`deleted`/`vehiclesLoading`/`vehiclesError` -> `keep_snapshot`, `none` -> `none`), exclude drifted `trip.vehicle_id` from active `<option>`s, show recalculation hint when distance, UTC date (`toISOString().slice(0, 10)`), or vehicle choice changed.
    *   Single-unit distance label (`t("mileage_distance")` without appending a duplicate `"(km)"`), `type="text" inputMode="decimal"`, live duration + `+Nd` preview, round-trip helper hint, dirty-dismiss `window.confirm(t("guard_unsaved_changes"))`, pending-save dismiss lock, and error precedence (`ECONNABORTED`/`ETIMEDOUT` -> `409` -> `429` -> non-empty `response?.data?.detail` -> `t("mileage_error_save")`).

#### 20. `frontend/components/reports/MileageWeeklyList.tsx` (Modify)
*   **Type / Scope**: React UI List Component
*   **Proposed Changes**: Rename `isDraft` -> `canEdit`; add `mutatingDisabled`, `highlightedTripId`, `onEditTrip`, and controlled `collapsedWeeks` / `onToggleWeek`; extract `TripRowActions` (desktop icon-only buttons, mobile wrapping row with `min-h-11 min-w-11` targets, concise labels, visual divider before Delete, trip-scoped `aria-label`s); replace all 5 `.toFixed(1)` sites with `formatDistanceKm`.

#### 21. `frontend/app/reports/[id]/mileage/page.tsx` (Modify)
*   **Type / Scope**: Next.js Client Page
*   **Proposed Changes**:
    *   Derive `canEdit = Boolean(user && report && report.status === "draft" && report.user_id === user.id)` via `useAuth()`. Gate `/users/me/vehicles` (`enabled: canEdit`, destructuring `isLoading: vehiclesLoading`), starting-odometer editing, Add trip button, `includeEmptyDays`, `handlePasteToDates`, and `MileageWeeklyList`.
    *   Remove the inline Add form and `formRef.scrollIntoView`; manage `modalState` + `triggerRef` for focus restore; render `<MileageTripModal>` whenever `modalState !== null`.
    *   Update `prefillVehicle` after removing `selectedVehicleId`; replace `copiedTrip` with `copiedTripId` + `useMemo`; gate clipboard `Escape` on `modalState === null`; route `handlePasteToDates` through `createMileage`.
    *   Wire `updateMileage` (`qc.invalidateQueries` for `reportKeys.all` & `mileageKeys.all`, expand target week, `2500ms` highlight timer with cleanup, `toast.success` naming target day when moved; background refetch on `400`/`404`/`409`/timeout); wire `deleteMileage.onError` to `toast.error`; render `QueryErrorNotice` on `isError`; replace grand total `.toFixed(1)` (`L428`) with `formatDistanceKm`.
    *   **Phase 3 Checkpoint**: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint && npm run test:mileage:unit`

---

### Phase 4: Package Documentation & Final Audit

#### 22. Backend Package READMEs (Modify)
*   `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/mileage/README.md`
*   `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/README.md`
*   `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/README.md`
*   `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/README.md`
*   `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fuel/README.md`

#### 23. Frontend Package READMEs (Modify)
*   `frontend/lib/api/README.md`
*   `frontend/lib/types/README.md`
*   `frontend/lib/README.md`
*   `frontend/components/reports/README.md`
*   `frontend/app/reports/[id]/mileage/README.md`

*   **Phase 4 Checkpoint**: `python3 scripts/reconcile.py audit`

---

### Verification Plan

*   **Host Guardrails:** Run Gradle with `--no-daemon` and target single test classes; do not run full multi-worker Playwright suites or `docker compose down` on the live production host.
*   **Compilation/Build**:
    *   Backend: `cd backend-kotlin-jpa && ./gradlew compileKotlin compileTestKotlin --no-daemon`
*   **Targeted Unit & Integration Tests**:
    *   Backend: `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.mileage.VehicleMileageTest --tests eu.nt.xpenses.controllers.MileageControllerTest --tests eu.nt.xpenses.config.ValidationExceptionHandlerTest --tests eu.nt.xpenses.mileage.TripSheetExporterTest --tests eu.nt.xpenses.report.ExpenseReportsTest --tests eu.nt.xpenses.ocr.AsyncOcrTest --no-daemon`
    *   Frontend: `cd frontend && npm run test:mileage:unit`
*   **Static Analysis & Linting**:
    *   Frontend: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
    *   Docs reconciliation: `python3 scripts/reconcile.py audit`
*   **Test Coverage Requirement**:
    *   All new pure functions in `frontend/lib/format.ts` and `frontend/lib/mileageTripForm.ts` covered across positive, boundary, and error branches.
    *   All backend `updateMileage` calculation paths (`none`, `modern`, `legacy`), error codes (`400`, `403`, `404`, `409`, `422`, `502`), unknown-property JSON deserialization, and out-of-transaction external port calls covered by automated tests.
*   **Manual / Browser Checklist (375×812 mobile & 1280×800 desktop)**:
    *   Edit a draft trip with comma decimal (`12,25`) and clear `description`; verify 2-decimal display and preserved scroll position.
    *   Reschedule a trip into a collapsed week; verify duration auto-shift, destination week auto-expansion, row highlight, and moved-day toast.
    *   Edit a trip with a deleted or drifted `Vehicle`; verify snapshot preservation and excluded drifted option.
    *   Open another Technician's draft as `Moderator`; verify read-only UI and no `/users/me/vehicles` call.
    *   Trigger a `409` multi-tab edit conflict; verify modal stays open with inline localized alert and preserved inputs.
    *   Verify `Escape` layering with active clipboard and `Trip sheet` `.xlsx` export reflecting edited values.

--------------------------------------------------------------------------------

*Drafted with Engineering Guidance Methodology (EGM)*
