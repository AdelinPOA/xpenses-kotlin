## ADDED Requirements

### Requirement: Category queries use extended staleTime
All `useQuery` calls fetching category data SHALL specify `staleTime: 300_000` (5 minutes) and `gcTime: 600_000` (10 minutes).

#### Scenario: Categories cached for 5 minutes
- **WHEN** a user navigates between pages that both query categories within 5 minutes
- **THEN** no refetch occurs; the cached data is served

### Requirement: Settings queries use extended staleTime
All `useQuery` calls fetching admin settings (mileage rates, daily allowance, LDAP config, SMTP config, IMAP config, OCR config, storage config) SHALL specify `staleTime: 300_000` and `gcTime: 600_000`.

#### Scenario: Settings cached for 5 minutes
- **WHEN** an admin navigates between settings pages within 5 minutes
- **THEN** no refetch occurs for config data already in cache

### Requirement: Dashboard queries use 60-second staleTime
The dashboard stats `useQuery` SHALL specify `staleTime: 60_000` and `refetchOnWindowFocus: true`.

#### Scenario: Dashboard data considered stale after 60 seconds
- **WHEN** a user returns to the dashboard tab after 60 seconds
- **THEN** a background refetch is triggered

### Requirement: User list queries use moderate cache
All `useQuery` calls fetching the user list SHALL specify `staleTime: 120_000` (2 minutes) and `gcTime: 300_000` (5 minutes).

#### Scenario: User list cached for 2 minutes
- **WHEN** an admin navigates from users page to IMAP settings (which also queries users) within 2 minutes
- **THEN** no refetch occurs

### Requirement: Global refetchOnWindowFocus enabled
The global `QueryClient` default options SHALL include `refetchOnWindowFocus: true`.

#### Scenario: Stale queries refetch on window focus
- **WHEN** a user switches away from the app and returns after the staleTime has elapsed
- **THEN** all stale queries in mounted components automatically refetch
