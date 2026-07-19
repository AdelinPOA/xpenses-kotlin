# Spec: pwa-runtime

## ADDED Requirements

### Requirement: Service worker never caches API traffic
The service worker fetch handler SHALL return early for any same-origin request whose path starts with `/api/`, performing no cache read or write. Static assets and navigations MAY continue to use the existing network-first/cache-first strategies.

#### Scenario: Expenses never served stale from SW cache
- **WHEN** the device goes offline and back online
- **THEN** expense/auth API responses are never replayed from Cache Storage

#### Scenario: Logout leaves no cached PII
- **WHEN** a user signs out
- **THEN** no authenticated API response remains in the SW cache (API responses were never written there)

### Requirement: Cache version rolls forward
`CACHE_NAME` SHALL be bumped (e.g., `xpenses-v2`) and old caches deleted on activate, so existing installs pick up the new fetch policy.

#### Scenario: Existing installs update
- **WHEN** a user with the v1 service worker next launches the app
- **THEN** the v2 worker installs, deletes `xpenses-v1`, and takes control

### Requirement: Update flow activates new worker predictably
The service worker SHALL call `self.skipWaiting()` on install and `clients.claim()` on activate; the registration component SHALL keep informing the user via toast when an update is ready. The app SHALL NOT force-reload the page automatically.

#### Scenario: Update toast on new deploy
- **WHEN** a new frontend version is deployed and an installed client fetches it
- **THEN** the user sees the "new version available" toast and the new worker is active after the next natural reload

### Requirement: Manifest colors are consistent
`manifest.json` `theme_color` SHALL match the app's light background (`#f8fafc`) used at launch, consistent with `background_color`.

#### Scenario: PWA launch screen
- **WHEN** the PWA launches on iOS/Android
- **THEN** the splash/title-bar color matches the app's light background instead of dark navy
