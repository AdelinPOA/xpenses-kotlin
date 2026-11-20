# Report Mileage Route (`frontend/app/reports/[id]/mileage`)

## Overview
Next.js App Router client route (`/reports/[id]/mileage`) for viewing mileage trips grouped into ISO weeks (Monday–Sunday) with weekly subtotals, managing the report's starting odometer, downloading the `.xlsx` Trip Sheet, and adding, copying/pasting across days, or deleting trips while the report is in draft status.

## Interface
- `[page.tsx:MileagePage]` — Default-exported client route component accepting `{ params: Promise<{ id: string }> }` and rendering mileage totals, starting odometer form, trip creation form, and `[MileageWeeklyList.tsx:MileageWeeklyList]` inside `AppShell`.
- `[MileageWeeklyList.tsx:MileageWeeklyList]` — Client component rendering week cards (collapsible, weekly km/duration/gross/net subtotals), 7-day breakdown on draft reports (or trip-only days on non-draft reports), sticky copied-trip clipboard bar, per-day Paste / `+` actions, and weekly `Paste Mon–Fri` bulk action.
- `[mileageWeeks.ts:buildMileageWeeks]` — Pure utility grouping trips into sorted Monday–Sunday ISO weeks, building paste payloads (`buildPastePayload`), detecting duplicate Mon–Fri targets (`getWorkdayPasteTargets`), and formatting durations, day headings, and time/week ranges.

## Invariants
- Draft-only mutation guard: trip creation toggle (`showForm`), starting odometer edits, per-day `+` prefill buttons, Copy / Paste / Paste Mon–Fri controls, and trip deletion controls render only when `report.status === "draft"` `[page.tsx:MileagePage, MileageWeeklyList.tsx:MileageWeeklyList]`.
- Weekly grouping & empty days: draft reports materialize all 7 days for every week in `[date_from, date_to]` (capped by `maxSpanWeeks`) plus any weeks containing trips or manually added via `+ Previous week` / `+ Next week`; non-draft reports render only days and weeks with trips `[mileageWeeks.ts:buildMileageWeeks]`.
- Copy/Paste invariants: Copy stores an in-memory snapshot of the selected trip (`Escape` or Clear dismisses it); per-day Paste shifts the trip's local start time and exact duration onto the target calendar day via `POST /api/reports/{id}/mileage`, omits `vehicle_id` when the source vehicle is no longer in `vehicles` (after `vehiclesLoaded`), and deduplicates concurrent in-flight paste dates via `inFlightDatesRef` `[page.tsx:handlePasteToDates, mileageWeeks.ts:buildPastePayload]`.
- `Paste Mon–Fri` skips Saturday/Sunday and workdays already containing a matching trip (`origin`, `destination`, start `HH:mm`, `round_trip`) `[mileageWeeks.ts:getWorkdayPasteTargets]`.
- Form validation: `handleAdd` requires non-empty trimmed `origin` and `destination`, non-empty `startTime` and `endTime`, `new Date(endTime) > new Date(startTime)`, and finite `distance_km > 0`; per-day `+` prefill (`buildDefaultDateTimeLocal`) fills `startTime` and `endTime` on that day and scrolls the form into view `[page.tsx:handleAdd, page.tsx:handleOpenFormForDay]`.
- Display formatting: monetary totals format in `"EUR"`; null `fuel_cost_eur` renders `"—"` on desktop and hides the breakdown disclosure on mobile `[MileageWeeklyList.tsx:MileageWeeklyList]`.

## Side Effects
- Queries `GET /reports/${id}` (`reportKeys.detail(reportId)`) and `GET /users/me/vehicles` (`vehicleKeys.me()` when `report.status === "draft"`) `[page.tsx:MileagePage]`.
- Mutations: `PATCH /reports/${id}` (`saveOdometer`), `POST /reports/${id}/mileage` (`addMileage` and sequential `handlePasteToDates`), and `DELETE /reports/${id}/mileage/${mileageId}` (`deleteMileage`, gated by `window.confirm`), each invalidating `reportKeys.detail(reportId)` and `mileageKeys.all` `[page.tsx:MileagePage]`.
- Downloads `GET /reports/${id}/mileage/trip-sheet` as `.xlsx` `[page.tsx:handleDownloadTripSheet]`.
- Registers a `window` `keydown` listener (`Escape`) while a copied trip is active `[page.tsx:MileagePage]`.
- Renders `<Link href="/reports/${id}">` back navigation `[page.tsx:MileagePage]`.

## Verification
- Run: `cd frontend && npm run test:mileage:unit`
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
