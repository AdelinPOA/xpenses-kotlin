# Tasks: Dashboard UI/UX Overhaul

## 1. Manager Inline Review & Action Desk

- [x] 1.1 Update `PendingReportsTable.tsx` to support inline accordion expansion of report details, itemized expenses, and note input.
- [x] 1.2 Update `PendingAdvancesList.tsx` for fluid responsive cards and remove nested scroll traps.
- [x] 1.3 Refactor manager view in `DashboardClient.tsx` into a dedicated action-only desk without modal drawer dependency.

## 2. Technician Mobile Field Experience

- [x] 2.1 Add prominent Floating Quick Action Button for 1-tap receipt capture / upload on mobile viewports.
- [x] 2.2 Create active Reimbursement Status summary card for mobile showing Draft, Submitted, and Paid EUR amounts.
- [x] 2.3 Polish mobile Recent Expenses feed with clear typography, category icons, and touch targets.

## 3. Technician Desktop Master-Detail Workspace

- [x] 3.1 Restructure desktop layout to 2-column Master-Detail (Left: full Recent Expenses table; Right: Status cards & Categories).
- [x] 3.2 Update Report Summary cards to display real computed EUR amounts for Draft, Submitted, and Paid statuses instead of placeholder dashes.
- [x] 3.3 Refine Spend by Category and Monthly Spend Trend widgets.

## 4. Internationalization & Verification

- [x] 4.1 Update translation keys in `frontend/messages/en.json` and `frontend/messages/ro.json`.
- [x] 4.2 Verify frontend build and run tests to ensure flawless execution.
