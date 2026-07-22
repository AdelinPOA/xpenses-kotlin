# ssr-prefetch-expansion Specification

## Purpose
TBD - created by archiving change frontend-optimizations. Update Purpose after archive.
## Requirements
### Requirement: Reports list page uses SSR prefetch
The `reports/page.tsx` SHALL be an async server component that prefetches the initial reports list via `serverFetch`, populates a `QueryClient`, and wraps the client component (`ReportsClient.tsx`) in a `HydrationBoundary`.

#### Scenario: Reports list data available on first render
- **WHEN** a user navigates to `/reports`
- **THEN** the page renders with server-prefetched report data without a client-side loading spinner on initial load

### Requirement: Report detail page uses SSR prefetch
The `reports/[id]/page.tsx` SHALL be an async server component that prefetches the report detail by ID via `serverFetch`, populates a `QueryClient`, and wraps the client component (`ReportDetailClient.tsx`) in a `HydrationBoundary`.

#### Scenario: Report detail data available on first render
- **WHEN** a user navigates to `/reports/123`
- **THEN** the page renders with the server-prefetched report detail without a client-side loading state

### Requirement: Profile detail page uses SSR prefetch
The `profile/[id]/page.tsx` SHALL be an async server component that prefetches the user profile data via `serverFetch` and wraps `ProfileDetailClient.tsx` in a `HydrationBoundary`.

#### Scenario: Profile detail data available on first render
- **WHEN** a user navigates to `/profile/5`
- **THEN** the page renders with server-prefetched profile data

### Requirement: Admin users page uses SSR prefetch
The `admin/users/page.tsx` SHALL be an async server component that prefetches the user list via `serverFetch` and wraps `UsersClient.tsx` in a `HydrationBoundary`.

#### Scenario: Users list data available on first render
- **WHEN** an admin navigates to `/admin/users`
- **THEN** the page renders with server-prefetched user list

### Requirement: Admin settings page uses SSR prefetch
The `admin/settings/page.tsx` SHALL be an async server component that prefetches mileage rates and daily allowance rate via `serverFetch` and wraps `SettingsClient.tsx` in a `HydrationBoundary`.

#### Scenario: Settings data available on first render
- **WHEN** an admin navigates to `/admin/settings`
- **THEN** the page renders with server-prefetched settings data

### Requirement: SSR prefetch failures fall back to client fetch
If `serverFetch` fails during SSR prefetch, the error SHALL be caught and logged. The client component SHALL still render and fetch data via its `useQuery` call as a fallback.

#### Scenario: Server prefetch fails gracefully
- **WHEN** the backend is temporarily unreachable during SSR
- **THEN** the page renders without prefetched data, and the client `useQuery` fetches data normally after hydration

