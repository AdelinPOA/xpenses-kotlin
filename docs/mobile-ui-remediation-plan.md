# Mobile UI Remediation Plan

## Objective

Fix the mobile usability and accessibility issues confirmed on the live application at a 412 x 849 viewport, without regressing desktop behavior.

## Definition of done

- No horizontal overflow on the primary authenticated routes.
- Every visible mobile control has a touch target of at least 44 x 44 CSS pixels, except explicitly documented exceptions.
- All icon-only controls have accessible names.
- Every form field has a programmatically associated label.
- Navigation works through touch and keyboard.
- No critical or serious axe violations on the tested routes.
- Mobile Playwright tests run in CI.

## Phase 1: Establish the UI test baseline

1. Add a Playwright mobile project using a 412 x 849 viewport.
2. Create a dedicated test user and deterministic fixture data.
3. Cover:
   - `/dashboard`
   - `/expenses`
   - `/expenses/new`
   - `/reports`
   - `/profile`
4. Add assertions for:
   - successful authenticated rendering;
   - absence of application console errors;
   - no horizontal overflow;
   - expected page heading;
   - stable loading, empty and error states.
5. Store light and dark visual baselines where useful.

### Acceptance criteria

All five routes load at the target mobile viewport with no horizontal overflow or unhandled JavaScript errors.

## Phase 2: Standardize mobile touch targets

Create a shared style or component for mobile controls:

```tsx
const mobileTouchTarget =
  "min-w-11 min-h-11 inline-flex items-center justify-center";
```

Apply it to:

- mobile menu button;
- profile avatar;
- expense status filters;
- card actions;
- Dashboard links;
- Export and filter controls;
- form buttons;
- sidebar controls.

Icons can remain 16-20 px; the interactive container must be at least 44 x 44 px.

### Acceptance criteria

An automated layout assertion confirms that visible mobile controls meet the minimum target size.

## Phase 3: Repair Expense card actions

1. Increase View, Duplicate, Edit and Delete action targets to 44 x 44 px.
2. Add specific accessible names:
   - `View expense {merchant}`
   - `Duplicate expense {merchant}`
   - `Edit expense {merchant}`
   - `Delete expense {merchant}`
3. Mark decorative SVG icons with `aria-hidden="true"`.
4. Add enough spacing to prevent accidental adjacent taps.
5. Keep a confirmation dialog before deletion.
6. If four actions remain crowded, replace secondary actions with a mobile "More actions" menu.
7. Ensure tapping an action does not trigger a parent card action.

### Acceptance criteria

Each action is independently tappable, has an accessible name and cannot accidentally trigger a neighboring or parent action.

## Phase 4: Repair Expense filters

1. Increase All, Draft, Submitted and Paid controls to at least 44 px high.
2. Add `aria-pressed` to status toggles.
3. Add a visible keyboard focus state.
4. Keep the active state identifiable without relying only on color.
5. Allow controlled horizontal scrolling when the status controls do not fit.
6. Place the category select on its own row at narrow widths.
7. Increase the category select height to at least 44 px.

### Acceptance criteria

Status and category filters work through touch and keyboard, and their current state is exposed semantically.

## Phase 5: Repair the New Expense form

For Amount, Currency, Date, Merchant, Category, Description and Receipts:

1. Add stable `id` and `name` attributes.
2. Associate labels using `htmlFor`.
3. Connect help and error text through `aria-describedby`.
4. Add `aria-invalid` when validation fails.
5. Expose field errors with an accessible alert.
6. Increase inputs, selects and action buttons to at least 44 px high.
7. Retain the correct `inputMode` for numeric input.
8. Ensure required fields are indicated both visually and semantically.

Example:

```tsx
<label htmlFor="expense-amount">
  Amount <span aria-hidden="true">*</span>
</label>
<input
  id="expense-amount"
  name="amount"
  type="number"
  inputMode="decimal"
  aria-describedby="expense-amount-error"
  aria-invalid={Boolean(errors.amount)}
  className="min-h-11 ..."
/>
```

### Receipt upload

1. Provide one clear primary upload control.
2. Give the file input an accessible label.
3. Associate supported formats and the 10 MB limit with the control.
4. Show selected files and their state.
5. Allow a selected file to be removed.
6. Avoid unnecessary duplicate file inputs in the DOM.

### Acceptance criteria

Playwright can locate every field by its visible label, and validation errors are exposed to assistive technology.

## Phase 6: Simplify the New Expense mobile flow

1. Increase Details and Receipt tabs to at least 44 px.
2. Show a receipt preview only when a receipt exists.
3. Reduce the empty preview space on mobile.
4. Consider a sticky Create expense / Cancel action bar.
5. Position sticky actions above the bottom navigation and safe-area inset.
6. Show clear validation feedback instead of failing silently.
7. Prevent repeated submissions while the request is pending.

### Acceptance criteria

A user can complete the expense flow with one hand and reach the save action without searching through a long page.

## Phase 7: Repair the mobile header

1. Increase the menu target from 36 x 36 to 44 x 44 px.
2. Increase the profile target from 28 x 28 to 44 x 44 px.
3. Ensure the logo link does not cover unrelated header space.
4. Add clear focus states.
5. Preserve iOS safe-area alignment.
6. Verify that menu, logo and profile targets do not overlap.

## Phase 8: Make the sidebar accessible

1. Add `aria-expanded` and `aria-controls` to the menu button.
2. Move focus into the sidebar when it opens.
3. Trap focus while the sidebar is open.
4. Prevent interaction and scrolling behind it.
5. Close it through:
   - the close button;
   - Escape;
   - the backdrop;
   - selecting a route.
6. Restore focus to the menu button after closing.
7. Ensure hidden sidebar elements cannot receive focus.

### Acceptance criteria

The full sidebar flow works with touch and keyboard, and background content is inert while it is open.

## Phase 9: Verify bottom navigation

The current 64 x 64 px navigation targets are adequate. Preserve their dimensions and:

1. add `aria-current="page"` to the active destination;
2. mark decorative icons as hidden from assistive technology;
3. verify touch navigation to Dashboard, Expenses, Reports and Profile;
4. maintain sufficient contrast in light and dark mode;
5. preserve safe-area padding;
6. ensure it does not overlap sticky form actions or the last content item.

## Phase 10: Improve Dashboard mobile actions

1. Increase Quick Add Expense to at least 44 px high.
2. Expand See all to a practical touch target rather than making only its text interactive.
3. Prefer full-card links where the whole card represents one action.
4. Improve the empty state with a clear primary action.
5. Distinguish zero values from unavailable or still-loading data.

## Phase 11: Normalize loading, empty and error states

Create reusable components:

- `LoadingState`
- `EmptyState`
- `ErrorState`
- `FormError`
- `Toast`
- `ConfirmDialog`

Requirements:

1. Render a page skeleton instead of a blank Profile screen.
2. Use `role="status"` for neutral loading updates.
3. Use `role="alert"` for important failures.
4. Provide Retry where an API request can be repeated safely.
5. Do not confuse empty data with loading or error states.
6. Restore focus correctly after dialogs close.
7. Show pending action labels such as "Saving...".

## Phase 12: Automated accessibility checks

Add `@axe-core/playwright` and run it against every primary mobile route.

Verify:

- accessible names for icon buttons;
- label and input relationships;
- color contrast;
- heading hierarchy;
- `aria-current`;
- `aria-expanded`;
- dialog semantics and focus;
- field error announcements;
- focusability of visually hidden navigation.

### Acceptance criteria

No axe violations with `critical` or `serious` impact.

## Phase 13: Mobile Playwright flows

### Navigation

- Open and close the sidebar.
- Navigate through every bottom navigation destination.
- Verify URL and main heading after each action.

### Expenses

- Select every status.
- Change category.
- Open View and Edit.
- Open Duplicate without completing a persistent action.
- Open Delete and cancel confirmation.

### New Expense

- Submit an empty form and verify field errors.
- Complete all supported fields.
- Verify numeric input behavior.
- Attach a test receipt.
- Cancel without saving.
- In an isolated test, create and clean up a generated expense.

### Profile

- Verify the skeleton state.
- Verify field labels.
- Save a harmless change with the test account.
- Verify success and failure feedback.

## Phase 14: CI integration

Run checks in this order:

1. TypeScript
2. ESLint
3. frontend production build
4. unit tests
5. Playwright desktop
6. Playwright mobile Chromium
7. Playwright mobile WebKit
8. axe accessibility checks
9. selected visual regression checks

Cover light and dark mode. Upload traces and screenshots only for failed tests.

## Recommended implementation PRs

1. `fix/mobile-touch-targets`
2. `fix/expense-actions-accessibility`
3. `fix/new-expense-form-accessibility`
4. `fix/mobile-navigation-and-sidebar`
5. `fix/loading-empty-error-states`
6. `test/mobile-playwright-and-axe`
7. `ci/run-mobile-ui-tests`

## Recommended execution order

Start with shared touch targets and Expense card actions because they have the largest immediate effect on mobile usability. Then fix form semantics and navigation. Add the complete regression suite before changing loading and visual states broadly.
