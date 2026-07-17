## Context

Privileged roles (Moderators, Managers, CFOs) have options to switch between personal and company-wide views to manage org data. However, the current UX has three main friction points:
1. Inconsistent view toggle styles across pages: Dashboard, Reports, Inventory, and Insurance pages all use simple text buttons with dynamic text labels.
2. Missing functionality: The Expenses page has no company-wide toggle or view, even though the backend `/api/expenses?all=true` endpoint fully supports it.
3. Mobile presentation: Expenses and Reports list layouts on mobile are rendered using basic `divide-y` lists, whereas Inventory and Insurance use clean rounded card containers.

## Goals / Non-Goals

**Goals:**
- Implement a custom, reusable iOS-style `SegmentedControl` component for view toggling.
- Introduce the "Personal | Company" data toggle to the Expenses page.
- Redesign the mobile view of the Expenses and Reports list pages to render items inside premium rounded cards.
- Add an automated mobile viewport E2E test file (`mobile-ui-ux.spec.ts`) in Playwright targeting iPhone 12.

**Non-Goals:**
- Modifying backend schemas or logic. The backend API already handles `all=true` filtering properly.
- Changing desktop table presentations (which are already optimized for large screens).

## Decisions

### 1. Reusable Segmented Control Component
We will create `frontend/components/ui/SegmentedControl.tsx` using CSS-first Tailwind CSS. It will take `options` array, active `value`, and an `onChange` callback.
- *Layout*: Flex row, full height, with full rounding (`rounded-full`), padded inside a light background (`bg-slate-100` / `dark:bg-slate-800`).
- *Active Segment*: White container (`bg-white` / `dark:bg-slate-900`) with subtle shadow and darker text.
- *Animations*: Smooth transition on bg color and hover states.
- *Reasoning*: Standardizing this control in one file reduces code duplication and ensures exact alignment and hover state colors across Dashboard, Expenses, Reports, Inventory, and Insurance.

### 2. Expenses Page Toggle integration
- `ExpensesClient.tsx` will add `showAll` state, defaulting to `true` on mount for `chef_finance` and `mod` (to match Dashboard behavior) and `false` for others.
- Pass `all: showAll` inside the `queryKey` and `api.get` call parameters.
- When `showAll` is active, display the owner's name next to the expense date/merchant in both desktop and mobile views.

### 3. Mobile Card Layout for Expenses and Reports
- Refactor the `md:hidden` sections of both `ExpensesClient.tsx` and `reports/page.tsx`.
- Replace `divide-y` with a vertical space (`space-y-4`) and render each item in a card container:
  - `bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800/80 p-4 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700`
- Make sure action buttons (edit, delete, view, duplicate) are neatly aligned in the card footer.

## Risks / Trade-offs

- **[Risk] State Desync Across Navigation** → Toggle states are page-level React states. Navigating between pages resets them to defaults.
  - *Mitigation*: This is standard behavior for other pages like Inventory/Insurance. A global context is not required since users expect page-specific filters. We will configure role-specific defaults on mount (e.g. `mod` default to `true`).
- **[Risk] Test Flakiness on viewport transitions** → In Playwright, some elements might overlap if height changes.
  - *Mitigation*: Scoping locators properly to cards and segmented controls, using explicit viewports in Playwright mobile project.
