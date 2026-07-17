## 1. Segmented Control UI Component

- [x] 1.1 Create the reusable `SegmentedControl` component at `frontend/components/ui/SegmentedControl.tsx` with iOS style aesthetics.

## 2. Expenses Page Upgrades

- [x] 2.1 Integrate the `showAll` state and `all` parameter inside the API query and cache key of `frontend/app/expenses/ExpensesClient.tsx`.
- [x] 2.2 Add the `SegmentedControl` view toggle at the top of the Expenses page for privileged roles.
- [x] 2.3 Refactor the mobile view (`md:hidden`) in `ExpensesClient.tsx` to render expenses as card layout blocks and include owner name label when showing all company expenses.

## 3. UI Alignment Across Other Pages

- [x] 3.1 Replace the text-based toggle button in `frontend/app/dashboard/DashboardClient.tsx` with the new `SegmentedControl` component.
- [x] 3.2 Replace the text-based toggle button in `frontend/app/reports/page.tsx` with `SegmentedControl`, and refactor the mobile view (`md:hidden`) list to use rounded cards with consistent shadows.
- [x] 3.3 Replace the toggle button in `frontend/app/inventory/page.tsx` with `SegmentedControl`.
- [x] 3.4 Replace the toggle button in `frontend/app/insurance/page.tsx` with `SegmentedControl`.

## 4. Playwright E2E Tests for Mobile Viewport

- [x] 4.1 Create `frontend/tests/responsive/mobile-ui-ux.spec.ts` to test `mod` user's standard vs. company view transitions across all major pages (Dashboard, Expenses, Reports, Inventory, Insurance) on the mobile device profile.
- [x] 4.2 Run the new mobile E2E test suite to verify implementation correctness and confirm no horizontal overflows.
