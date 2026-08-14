# Dashboard UI/UX Overhaul for Technicians & Managers

## Why

The current frontend dashboard lacks clear role-optimized user experiences: technicians in the field on mobile lack prominent quick-capture actions and clear reimbursement status visibility, while the desktop view suffers from hardcoded placeholder dashes in report summaries and awkward empty states. For managers, the dashboard mixed review duties with unnecessary enterprise KPI bloat, relied on a detached slide-over drawer instead of quick inline triage, and suffered from mobile scroll traps.

This overhaul delivers a clean, focused, "simple but complex enough" experience tailored to a small-to-mid company: an action-only triage desk for managers with inline accordion inspection, and a fast, field-oriented mobile feed plus master-detail desktop workspace for technicians.

## What Changes

- **Manager Workflow (Web & Mobile)**:
  - Transform manager view into a dedicated **Action-Only Desk** strictly focusing on actionable items (Pending Reports & Pending Advances).
  - Replace detached slide-over drawer with **Inline Accordion Expand** directly inside the pending reports list, allowing managers to inspect expenses, receipts, and notes inline without context switching.
  - Provide direct 1-tap Approve and Reject actions with optional note dialogs.
  - Eliminate nested scroll traps (`max-h-[560px]`) on mobile devices.

- **Technician Workflow (Mobile)**:
  - Add a prominent **Quick Action Bar / Floating Action Button** on mobile for 1-tap receipt photo capture / upload.
  - Introduce a **Reimbursement Status Summary Card** clearly displaying Draft, Submitted (under review), and Paid EUR amounts.
  - Streamline the **Recent Expenses Feed** with category icons, merchant info, EUR amounts, and status badges.

- **Technician Workflow (Web / Desktop)**:
  - Reorganize the dashboard into a **Split Master-Detail Layout**:
    - **Left / Main Column**: Full, searchable recent expenses table with merchant, date, category, amount in EUR, and status.
    - **Right / Sidebar Column**: Real reimbursement status cards (fixing previous `-` dashes with actual EUR amounts), Spend by Category percentage distribution, and month-to-date spend trend.

## Capabilities

### New Capabilities
- `manager-dashboard`: Action-only manager triage desk with inline accordion review for reports, pending advances management, and team activity stream.
- `technician-dashboard`: Field-first mobile feed with prominent receipt capture and reimbursement tracker; master-detail desktop workspace with comprehensive expenses list and accurate status summaries.

### Modified Capabilities
<!-- None: starting baseline specs -->

## Impact

- **Frontend Components**:
  - `frontend/app/dashboard/DashboardClient.tsx`
  - `frontend/components/dashboard/PendingReportsTable.tsx`
  - `frontend/components/dashboard/PendingAdvancesList.tsx`
  - `frontend/components/dashboard/ExpenseStatusOverview.tsx`
  - `frontend/components/dashboard/SpendChart.tsx`
  - New/updated UI components for inline accordion review and floating quick-action buttons.
- **Translations**:
  - `frontend/messages/en.json` and `frontend/messages/ro.json` (dashboard translation keys).
