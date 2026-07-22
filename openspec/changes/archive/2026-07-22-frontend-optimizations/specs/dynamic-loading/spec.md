## ADDED Requirements

### Requirement: ExpenseForm lazy loaded
The `ExpenseForm` component SHALL be imported via `next/dynamic` in all pages that use it (expense edit, expense new). A loading skeleton SHALL be displayed while the component loads.

#### Scenario: Expense edit page lazy loads form
- **WHEN** a user navigates to `/expenses/[id]/edit`
- **THEN** the `ExpenseForm` component is loaded asynchronously via `next/dynamic` with a placeholder skeleton shown during loading

### Requirement: BulkReviewDrawer lazy loaded
The `BulkReviewDrawer` component SHALL be imported via `next/dynamic` in `ExpensesClient.tsx`. A loading skeleton SHALL be displayed while the component loads.

#### Scenario: Bulk upload triggers lazy load
- **WHEN** a user drops files to bulk-upload on the expenses page
- **THEN** the `BulkReviewDrawer` component is loaded asynchronously only at that point

### Requirement: SignaturePad lazy loaded without SSR
The `SignaturePad` component SHALL be imported via `next/dynamic` with `ssr: false` in the signature page, since it relies on the Canvas API which is unavailable during server rendering.

#### Scenario: Signature page lazy loads canvas
- **WHEN** a user navigates to `/profile/signature`
- **THEN** the `SignaturePad` component is loaded client-side only, with a placeholder skeleton shown during loading
