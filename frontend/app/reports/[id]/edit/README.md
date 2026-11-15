# Edit Report Route (`frontend/app/reports/[id]/edit`)

## Overview
Next.js App Router client route (`/reports/[id]/edit`) allowing editing of draft expense report metadata, date bounds, and job delegation details with unsaved-changes protection.

## Interface
- `[page.tsx:EditReportPage]` — Default-exported client route component accepting `{ params: Promise<{ id: string }> }` and rendering the report edit form inside `AppShell`.
- `[page.tsx:Field]` — Internal helper component rendering a labeled delegation text input (`{ id, label, value, onChange }`).
- `[page.tsx:inputCls]` — Internal Tailwind CSS class string applied to form inputs.

## Invariants
- Draft-only edit guard: only reports with `report.status === "draft"` can be edited; non-draft reports render `edit_only_draft` notice and back link; renders loading and not-found states when appropriate `[page.tsx:EditReportPage]`.
- Single hydration & dirty tracking: form state is initialized from `report` once via `initializedRef`; `isDirty` compares current values against `report` (normalizing nullish values to `""`) and feeds `useFormGuard` `[page.tsx:initializedRef, page.tsx:isDirty, page.tsx:useFormGuard]`.
- Submission validation: `handleSave` requires non-empty `title.trim()` and enforces `dateTo >= dateFrom` when both dates are set; `#edit-report-title`, `#edit-report-date-from`, and `#edit-report-date-to` have HTML `required`; submit is disabled while `save.isPending` `[page.tsx:handleSave, page.tsx:EditReportPage]`.
- Conditional delegation fields: delegation fieldset and delegation `PATCH` properties are included only when `hasDelegation` is true (at least one of the 10 delegation fields on `report` is truthy) `[page.tsx:hasDelegation]`.

## Side Effects
- Queries `GET /reports/${id}` (`reportKeys.detail(parseInt(id))`) `[page.tsx:useQuery]`.
- Sends `PATCH /reports/${id}` (`save`); on success calls `clearDirty()`, invalidates `reportKeys.all`, and navigates to `/reports/${id}`; on error sets `error` state `[page.tsx:save]`.
- Registers navigation guard via `useFormGuard`, triggers `window.confirm` on dirty cancel, and navigates via `router.push(`/reports/${id}`)` and `<Link>` `[page.tsx:useFormGuard, page.tsx:EditReportPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
