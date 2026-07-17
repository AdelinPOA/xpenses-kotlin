## Why

On mobile viewports (iOS/iPhone), the current user experience has high friction and UI inconsistencies:
1. Privileged users (like the `mod` role) can toggle between personal "My View" and organization "Company Overview" on the Dashboard, Reports, Inventory, and Insurance pages, but cannot do so on the Expenses page—despite the backend API fully supporting it.
2. The toggles themselves are implemented as standard text buttons, which change their text dynamically. This lacks mobile-native feel (e.g. iOS segmented controls) and creates visual noise.
3. List views on mobile (Expenses, Reports) are rendered as plain `divide-y` lists, which look basic and lack the premium card design implemented on the Inventory and Insurance pages.

Providing a premium, low-friction, consistent UI across all pages on mobile viewports will elevate the application to feel modern and native on iOS/iPhone.

## What Changes

- **Premium Segmented View Toggle**: Replace all text-based view toggles (Dashboard, Reports, Inventory, Insurance) with a highly polished, iOS-style segmented control (`[ Personal | Company ]`) that is easy to tap and offers a clear visual state.
- **Expenses Company View**: Add the personal vs. company data toggle to the Expenses page for privileged roles (`mod`, `manager`, `chef_finance`), connecting to the backend's `all=true` parameter.
- **Premium Cards on Mobile**: Refactor the mobile list views on both the Expenses page and the Reports page to use modern rounded card layouts with border, subtle shadow, and consistent spacing instead of the plain `divide-y` lines.
- **Automated Mobile UI/UX Test Suite**: Add a comprehensive Playwright E2E mobile spec (`mobile-ui-ux.spec.ts`) targeting iPhone 12 to verify role-based layouts, view toggles, and ensure zero visual regressions/overflows.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `user-profiles-reports-view`: Extend the role-gated scoping to cover Expenses list view toggles and standardize mobile list UI/UX.

## Impact

- **Frontend**: 
  - `frontend/app/expenses/ExpensesClient.tsx`: Add view toggle state, link to API, and refactor mobile list layout to cards.
  - `frontend/app/dashboard/DashboardClient.tsx`, `frontend/app/reports/page.tsx`, `frontend/app/inventory/page.tsx`, `frontend/app/insurance/page.tsx`: Update view toggles to iOS-style segmented controls.
  - `frontend/app/reports/page.tsx`: Refactor mobile list layout to cards.
  - `frontend/app/profile/[id]/page.tsx` (if user profiles display lists): check and ensure consistent look.
  - `frontend/tests/responsive/mobile-ui-ux.spec.ts`: New Playwright test file.
