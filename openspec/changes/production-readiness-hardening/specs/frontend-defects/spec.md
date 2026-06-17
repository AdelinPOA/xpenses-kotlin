## ADDED Requirements

### Requirement: Storage admin page does not crash on hooks violation
`/admin/storage` SHALL call all React hooks (`useQuery`, `useEffect`, `useMutation`) unconditionally before any early return, and SHALL gate data fetching via the `enabled` option rather than conditional hook invocation.

#### Scenario: mod user opens the storage page after auth loads
- **WHEN** a `mod` user navigates to `/admin/storage` and the `AuthProvider` finishes loading
- **THEN** the page renders without a React hooks error

### Requirement: Receipts admin page requires mod role
`/admin/receipts` SHALL redirect non-`mod` users to `/dashboard` before rendering any UI or triggering the destructive `POST /settings/receipts/clean` endpoint.

#### Scenario: technician navigates to receipts admin
- **WHEN** a `technician` navigates to `/admin/receipts`
- **THEN** they are redirected to `/dashboard` without seeing the scan/clean UI

### Requirement: Global error boundary, 404 page, and loading state exist
The frontend SHALL include `app/global-error.tsx`, `app/error.tsx`, and `app/not-found.tsx` so that unhandled runtime errors and unknown routes show branded UI instead of the Next.js default red/404 pages.

#### Scenario: unhandled error in a route
- **WHEN** a runtime error occurs during rendering of any page
- **THEN** the app-level `error.tsx` boundary displays a retry option (not the raw Next.js error page)

#### Scenario: unknown URL
- **WHEN** a user navigates to a URL with no matching route
- **THEN** the custom `not-found.tsx` renders with a link back to `/dashboard`

### Requirement: Role gates on /advances and /categories pages
`/advances` SHALL restrict to `manager`, `chef_finance`, or `mod`. `/categories` SHALL restrict to `mod`. Non-authorized users SHALL be redirected to `/dashboard`.

#### Scenario: technician opens /advances
- **WHEN** a `technician` navigates to `/advances`
- **THEN** they are redirected to `/dashboard`

#### Scenario: non-mod opens /categories
- **WHEN** a `manager` navigates to `/categories`
- **THEN** they are redirected to `/dashboard`

### Requirement: Dashboard deeplinks apply filters on target pages
`/expenses` SHALL read a `category_id` query parameter and pre-filter the list. `/reports` SHALL read a `status` query parameter and pre-filter the list. This makes the dashboard's "view draft reports" and "view expenses in category X" links functional.

#### Scenario: clicking dashboard category card filters expenses
- **WHEN** the user clicks a category on the dashboard (`/expenses?category_id=5`)
- **THEN** the expenses page loads with the category filter set to that category

### Requirement: Export dropdowns are click-activated and keyboard accessible
Export CSV/XLSX dropdowns SHALL open on click (not hover) and SHALL be operable via keyboard (Enter/Space to toggle, Escape to close), so they work on touch devices and for keyboard users.

#### Scenario: opening export menu on a touch device
- **WHEN** a user taps the "Export" button on `/expenses`
- **THEN** the CSV/XLSX options appear (no hover state required)

### Requirement: setTimeout timers are cleared on unmount
Components using `setTimeout` for navigation or message dismissal SHALL clear the timer in a `useEffect` cleanup to prevent state updates on unmounted components.

#### Scenario: navigating away within the timeout window
- **WHEN** a user saves an expense and navigates away before the 2-second redirect fires
- **THEN** no React state-update warning or unmounted-component error occurs

### Requirement: Error extraction reads both FastAPI detail and Spring message fields
The frontend axios interceptor and per-page catch handlers SHALL read error detail from `response.data.detail` OR `response.data.message` OR `response.data.error`, so Spring `ResponseStatusException` messages surface in toasts instead of being replaced by generic "Failed to save" strings.

#### Scenario: Spring 403 surfaces its message
- **WHEN** the backend returns `403 {"message": "Cannot approve your own report"}`
- **THEN** the toast displays "Cannot approve your own report" (not "Failed to save")

### Requirement: Internal navigation uses next/link
All internal-route anchors SHALL use Next.js `<Link>` instead of bare `<a href>`, to avoid full page reloads. Bare `<a>` is permitted only for cross-port download endpoints where cookies do not forward.

#### Scenario: IMAP page links to OCR admin
- **WHEN** a user clicks the OCR-admin link on `/admin/imap`
- **THEN** the navigation is client-side (no full page reload)
