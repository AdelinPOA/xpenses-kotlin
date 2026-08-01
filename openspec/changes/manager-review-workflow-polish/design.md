## Context

Issue #23 is a first-pass manager-facing polish change. The current frontend already has separate `/dashboard`, `/approvals`, and `/reports` surfaces, but the manager dashboard still includes KPI and analytics blocks, `/approvals` cards are missing a dedicated details action, mobile reports filters are always expanded, mobile bottom navigation is not role-specific, and Global Search copy is too narrow.

## Goals / Non-Goals

**Goals:**
- Keep the agreed responsibility split: `/dashboard` is a Manager Work Hub, `/approvals` is the Review Queue, and `/reports` is the browser/archive.
- Improve route-level behavior and layout without introducing a new design system.
- Add only the backend fields needed for manager preview context.
- Cover behavior through Playwright route tests at the existing seam.

**Non-Goals:**
- Bulk approval/rejection.
- Policy warnings or backend rule engines.
- Redesigning technician, finance, admin, inventory, or insurance workflows.
- Full backend search indexing.

## Decisions

- Reuse the existing manager dashboard endpoint and extend `PendingReportSummary` with `date_from`, `date_to`, and `description`. Alternative: fetch full report details for each dashboard row; rejected because it adds request fan-out for preview data already present on the report aggregate.
- Keep approval direct and keep rejection behind the existing required reason form. Alternative: confirmation modals for both actions; rejected because the issue explicitly keeps single-report approval fast.
- Implement mobile reports filters as an in-page collapsible panel. Alternative: a drawer; rejected for this pass because existing controls are simple and can be compacted without a new overlay component.
- Make Global Search render all known arrays from the current API shape plus optional future arrays defensively. Alternative: implement broad backend search across every domain now; deferred because repository support varies and the issue allows a first-pass UI polish scope.

## Risks / Trade-offs

- Backend DTO extension changes the manager dashboard API shape but remains additive.
- Global Search can only show additional product areas when the API returns them; the dropdown is prepared for grouping but backend breadth is incremental.
- Existing dirty worktree changes may already include related i18n and type changes; edits must stay scoped and avoid reverting them.
