# Report Mileage Route (`frontend/app/reports/[id]/mileage`)

## Overview
Next.js App Router client route (`/reports/[id]/mileage`) for viewing mileage trips grouped into ISO weeks (Monday–Sunday) with weekly subtotals, managing the report's starting odometer, downloading the `.xlsx` Trip Sheet, and adding, editing, copying/pasting across days, or deleting trips while the report is an owner's draft.

## Interface
- `[page.tsx:MileagePage]` — Default-exported client route component accepting `{ params: Promise<{ id: string }> }` and rendering mileage totals, starting odometer form, `[MileageWeeklyList.tsx:MileageWeeklyList]`, and `[MileageTripModal.tsx:MileageTripModal]` inside `AppShell` (with `QueryErrorNotice` on report load failure).
- `[MileageWeeklyList.tsx:MileageWeeklyList]` — Client component rendering week cards (controlled collapsible state, weekly km/duration/gross/net subtotals), 7-day breakdown for editable drafts (or trip-only days otherwise), sticky copied-trip clipboard bar, per-day Paste / `+` actions, per-trip Edit / Copy / Delete actions, and weekly `Paste Mon–Fri` bulk action.
- `[MileageTripModal.tsx:MileageTripModal]` — Unified create/edit modal preserving scroll position and restoring trigger focus on close.
- `[mileageWeeks.ts:buildMileageWeeks]` & `[mileageTripForm.ts:buildMileagePatchPayload]` — Pure utilities for ISO week grouping, paste payloads, duration auto-shift, vehicle snapshot-drift detection, and sparse `PATCH` diffs.

## Invariants
- Owner+draft mutation guard: `canEdit = Boolean(user && report && report.status === "draft" && report.user_id === user.id)` gates `/users/me/vehicles` fetching, starting odometer edits, Add/Edit/Copy/Paste/Delete controls, and empty draft day rows `[page.tsx:MileagePage, MileageWeeklyList.tsx:MileageWeeklyList]`.
- Weekly grouping & empty days: editable drafts materialize all 7 days for every week in `[date_from, date_to]` (capped by `maxSpanWeeks`) plus any weeks containing trips or manually added via `+ Previous week` / `+ Next week`; non-editable views render only days and weeks with trips `[mileageWeeks.ts:buildMileageWeeks]`.
- Copy/Paste invariants: Copy stores `copiedTripId` derived from `report.mileage_records` (`Escape` dismisses it only when `modalState === null`); per-day Paste shifts the trip's local start time and exact duration onto the target calendar day via `createMileage`, omits `vehicle_id` when the source vehicle is no longer in `vehicles` (after `vehiclesLoaded`), disables Edit/Delete while `pastingDates.size > 0`, and deduplicates concurrent in-flight paste dates via `inFlightDatesRef` `[page.tsx:handlePasteToDates, mileageWeeks.ts:buildPastePayload]`.
- `Paste Mon–Fri` skips Saturday/Sunday and workdays already containing a matching trip (`origin`, `destination`, start `HH:mm`, `round_trip`) `[mileageWeeks.ts:getWorkdayPasteTargets]`.
- Modal & post-save orientation: `<MileageTripModal>` stays mounted while `modalState !== null` (never unmounted by `canEdit` changes during conflict refetches); successful edits invalidate `reportKeys.all` and `mileageKeys.all`, expand the destination week if collapsed, highlight the updated row for `2500ms`, and emit a success toast (naming the destination day if moved); `400`/`404`/`409`/timeout edit errors trigger a background refetch while keeping the modal open `[page.tsx:MileagePage, MileageTripModal.tsx:MileageTripModal]`.
- Display formatting: distances format via `formatDistanceKm` (2 decimals when hundredths are non-zero); monetary totals format in `"EUR"`; null `fuel_cost_eur` renders `"—"` on desktop and hides the breakdown disclosure on mobile `[page.tsx:MileagePage, MileageWeeklyList.tsx:MileageWeeklyList]`.

## Side Effects
- Queries `GET /reports/${id}` (`reportKeys.detail(reportId)`) and `GET /users/me/vehicles` (`vehicleKeys.me()`, gated on `canEdit`) `[page.tsx:MileagePage]`.
- Mutations: `PATCH /reports/${id}` (`saveOdometer`), `POST /reports/${id}/mileage` (`addMileage` and sequential `handlePasteToDates` via `createMileage`), `PATCH /reports/${id}/mileage/${mileageId}` (`editMileage` via `updateMileage`), and `DELETE /reports/${id}/mileage/${mileageId}` (`deleteMileage`, gated by `window.confirm`, errors via `toast.error`), each invalidating `reportKeys.all` and `mileageKeys.all` `[page.tsx:MileagePage]`.
- Downloads `GET /reports/${id}/mileage/trip-sheet` as `.xlsx` `[page.tsx:handleDownloadTripSheet]`.
- Registers a `window` `keydown` listener (`Escape`) while a copied trip is active and `modalState === null` `[page.tsx:MileagePage]`.
- Renders `<Link href="/reports/${id}">` back navigation `[page.tsx:MileagePage]`.

## Verification
- Run: `cd frontend && npm run test:mileage:unit`
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
