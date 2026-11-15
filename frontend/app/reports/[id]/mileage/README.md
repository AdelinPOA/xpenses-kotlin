# Report Mileage Route (`frontend/app/reports/[id]/mileage`)

## Overview
Next.js App Router client route (`/reports/[id]/mileage`) for viewing mileage trips and reimbursement calculations on an expense report, and adding or deleting trips while the report is in draft status.

## Interface
- `[page.tsx:MileagePage]` — Default-exported client route component accepting `{ params: Promise<{ id: string }> }` and rendering mileage totals, trip table/cards, and trip creation form inside `AppShell`.
- `[page.tsx:formatDuration]` — Internal helper formatting duration in minutes as hours and zero-padded minutes.
- `[page.tsx:formatDateTime]` — Internal helper formatting ISO timestamps in `en-GB` locale.

## Invariants
- Draft-only mutation guard: trip creation toggle (`showForm`) and trip deletion controls render only when `report.status === "draft"` `[page.tsx:MileagePage]`.
- Form validation: `handleAdd` requires non-empty trimmed `origin` and `destination`, non-empty `startTime` and `endTime`, `new Date(endTime) > new Date(startTime)`, and finite `distance_km > 0`; converts timestamps to ISO strings and omits empty `description` `[page.tsx:handleAdd]`.
- Input & button guards: origin, destination, start time, end time, and distance inputs carry `required` (`#mileage-distance` uses `step="0.1" min="0.1"`); submit and delete buttons are disabled while `addMileage.isPending` / `deleteMileage.isPending` `[page.tsx:MileagePage]`.
- Display formatting: monetary totals format in `"EUR"`; null `fuel_cost_eur` renders `"—"` on desktop and hides the breakdown disclosure on mobile `[page.tsx:MileagePage]`.

## Side Effects
- Queries `GET /reports/${id}` (`reportKeys.detail(reportId)`) `[page.tsx:MileagePage]`.
- Mutations: `POST /reports/${id}/mileage` (`addMileage`) and `DELETE /reports/${id}/mileage/${mileageId}` (`deleteMileage`, gated by `window.confirm`), each invalidating `reportKeys.detail(reportId)` and `mileageKeys.all` `[page.tsx:addMileage, page.tsx:deleteMileage, page.tsx:invalidate, page.tsx:confirmDeleteMileage]`.
- Renders `<Link href="/reports/${id}">` back navigation `[page.tsx:MileagePage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
