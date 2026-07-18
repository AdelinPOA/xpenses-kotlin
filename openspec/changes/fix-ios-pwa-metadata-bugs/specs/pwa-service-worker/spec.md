## MODIFIED Requirements

### Requirement: REQ-SW-2 App shell precaching
On the `install` event, the SW SHALL precache only publicly reachable routes (`/` and `/login`). The SW MUST NOT precache authenticated routes (`/dashboard`, `/expenses`, `/reports`), because the SW registers from the unauthenticated login page and an unconditional `cache.add` of a protected route follows the auth redirect and caches the login HTML under the protected-route key.

#### Scenario: First-time unauthenticated user
- **WHEN** an unauthenticated user visits `/login` and the SW installs
- **THEN** only `/` and `/login` are added to the cache, and no entry is stored under `/dashboard`, `/expenses`, or `/reports`

#### Scenario: Protected route cached lazily when authenticated
- **WHEN** an authenticated user navigates to `/dashboard` online
- **THEN** the response is cached via the network-first strategy on first successful (non-redirected, OK) visit

### Requirement: REQ-SW-4 Network-first scope
The SW SHALL use a network-first strategy for same-origin navigation and dynamic requests, but MUST exclude `/api/*` requests entirely (no interception, no caching). API calls SHALL pass through to the network/browser so axios and its 401-refresh interceptor behave normally.

#### Scenario: API request not intercepted
- **WHEN** the app issues a same-origin `GET /api/expenses`
- **THEN** the SW does not call `event.respondWith` and the request goes directly to the network

#### Scenario: Signature image not persistently cached
- **WHEN** the profile page loads `<img src="/api/users/me/signature">`
- **THEN** the SW does not cache the PNG response in the Cache API

### Requirement: REQ-SW-5 Cache-first for static assets
The SW SHALL use a cache-first strategy for static assets: fonts, icons (images), CSS (`style` destination), and JS (`script` destination). The SW MUST NOT route CSS/JS/fonts through network-first.

#### Scenario: Repeat visit loads CSS/JS from cache
- **WHEN** a user revisits the app and the browser requests a hashed `/_next/static/` CSS or JS asset
- **THEN** the SW serves it from cache without a network round-trip when a cached copy exists

#### Scenario: Fonts served cache-first
- **WHEN** the browser requests a font (`destination === "font"`)
- **THEN** the SW attempts the cache before the network

### Requirement: REQ-SW-7 Update detection and activation
The SW registration SHALL detect new SW versions via `updatefound` and, when a new SW reaches the `installed` state while a controller is active, the registration SHALL activate the new SW by posting `{ type: "SKIP_WAITING" }` and reload the page on `controllerchange`. The SW SHALL handle `SKIP_WAITING` by calling `self.skipWaiting()`. A toast SHALL notify the user that the app is updating.

#### Scenario: New version activates on refresh
- **WHEN** a new SW is downloaded and reaches `installed` while an old SW controls the page
- **THEN** the new SW is activated via `skipWaiting` and the page reloads to use it (a single refresh suffices)

#### Scenario: Browser without service worker support
- **WHEN** the browser does not support service workers (iOS < 16.4)
- **THEN** registration is silently skipped with no user-facing error

## ADDED Requirements

### Requirement: No caching of non-OK or redirected responses
The SW MUST NOT store any response in the Cache API whose `ok` is `false` (status outside 200–299) or whose `redirected` flag is `true`. Such responses SHALL be returned to the caller but never written to the cache.

#### Scenario: Error response not cached
- **WHEN** a navigated route returns HTTP 500 and then the user goes offline and re-requests it
- **THEN** the SW does not serve the cached 500 response (it was never stored)

#### Scenario: Login redirect not cached
- **WHEN** an unauthenticated navigation to a protected route is redirected to `/login`
- **THEN** the redirected response is not written to the cache under the original URL

### Requirement: Registration listener cleanup
The `PwaRegistration` component SHALL remove all `updatefound` and `statechange` event listeners in its effect cleanup, and SHALL avoid invoking the toast after the component has unmounted.

#### Scenario: Unmount does not leak listeners
- **WHEN** the `PwaRegistration` component unmounts
- **THEN** any `updatefound`/`statechange` listeners attached to the registration or installing worker are removed
