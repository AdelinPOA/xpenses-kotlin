## Why

Managers need the app to prioritize review work instead of competing dashboard metrics, broad report browsing, and buried mobile navigation. Issue #23 captures the first polish pass to make the Manager Review Workflow faster, clearer, and less sparse without redesigning unrelated workflows.

## What Changes

- Refocus `/dashboard` for manager-like roles into a Manager Work Hub with pending report review first, pending advances second, and recent activity below.
- Remove KPI-first manager dashboard cards and demote unrelated analytics from manager dashboard views.
- Make `/approvals` the focused Review Queue with compact, decision-oriented cards and required Rejection Reason flow.
- Keep `/reports` as the company report browser/archive with desktop table behavior and compact mobile filter controls.
- Put Approvals in the manager mobile bottom navigation while keeping Expenses for technician mobile navigation.
- Keep Global Search visible, use neutral placeholder copy, and group cross-application result types.
- Add minimal backend response fields needed for Review Queue previews.

## Capabilities

### New Capabilities
- `manager-review-workflow`: Manager-facing review surfaces, role-specific mobile navigation, reports browser filter ergonomics, and global search grouping.

### Modified Capabilities
- `manager-dashboard`: Change the manager dashboard from KPI-first metrics to a Manager Work Hub ordered around pending review work.

## Impact

- Frontend: dashboard, approvals, reports list, shell navigation, global search dropdown, i18n messages, Playwright tests.
- Backend: manager dashboard DTO/controller fields for report period and description; search result DTO may expose additional grouped result arrays if repository support is practical.
- Tests: route-level Playwright coverage for manager dashboard, approvals, reports responsiveness, navigation, and search.
