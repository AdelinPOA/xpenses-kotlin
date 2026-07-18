## Why

The just-implemented `ios-pwa-metadata` feature has correctness bugs verified by code review: the iOS status-bar overlay won't actually work (missing `viewport-fit=cover` and safe-area handling), the service worker caches login-page HTML under protected-route keys for first-time users, intercepts and persistently caches authenticated `/api` responses (including the user's signature image), never applies updates despite a "Refresh to update" toast, and violates its own spec's cache strategy for static assets. These need fixing before the feature is usable on a real iOS device (device testing is still pending per HANDOFF.md session 106).

## What Changes

- Add `viewportFit: "cover"` to the viewport export and `env(safe-area-inset-*)` padding so the `black-translucent` status bar overlays content correctly (fulfills REQ-IOS-2 acceptance criterion).
- Stop precaching authenticated routes (`/dashboard`, `/expenses`, `/reports`) unconditionally — precache only public routes, or guard `cache.add` against redirects, so login HTML is never cached under protected-route keys.
- Add a `message` handler calling `self.skipWaiting()` in the SW and wire `PwaRegistration` to post `SKIP_WAITING` on update + reload on `controllerchange`, so the "Refresh to update" toast actually applies the update.
- Exclude `/api/*` (same-origin via the Next.js rewrite) from SW interception so authenticated JSON, receipts, and the signature image are not persistently cached and offline mutation failures don't return a 503 text body that breaks axios.
- Route CSS/JS/fonts through cache-first (per REQ-SW-5) instead of network-first.
- Guard `cache.put` with `response.ok` (and reject redirected/error responses) so 4xx/5xx/redirect-to-login pages aren't cached.
- Clean up `updatefound`/`statechange` listeners in `PwaRegistration` on unmount.
- Update the unchecked `tasks.md` checkboxes from the original change for hygiene.

## Capabilities

### New Capabilities

(None — all changes modify capabilities introduced by the `ios-pwa-metadata` change.)

### Modified Capabilities

- `ios-pwa-metadata`: REQ-IOS-2 and REQ-IOS-8 gain the `viewport-fit=cover` + safe-area-inset requirements needed for the status-bar overlay to actually function; adds a new safe-area requirement.
- `pwa-service-worker`: REQ-SW-2 (precache) tightened to avoid caching auth-redirect content; REQ-SW-4 (network-first) excludes `/api/*`; REQ-SW-5 (cache-first) extended to CSS/JS/fonts as originally intended; REQ-SW-7 (update flow) requires `skipWaiting` + reload; adds requirements for not caching non-OK responses and for listener cleanup.

## Impact

- **Code**: `frontend/app/layout.tsx`, `frontend/components/PwaRegistration.tsx`, `frontend/public/sw.js`, `frontend/components/layout/AppShell.tsx` (or `globals.css`) for safe-area padding, `frontend/middleware.ts` (no functional change expected).
- **APIs**: No backend changes; no public API surface changes.
- **Dependencies**: None added.
- **Risk**: Low — all changes are isolated to the PWA layer. The `/api` exclusion is the most behaviorally significant (it intentionally stops the SW from caching API responses, which is the desired behavior). Bumping the SW cache version (`xpenses-v2`) will invalidate the old cache on next activation.
- **Specs affected**: `ios-pwa-metadata`, `pwa-service-worker` (delta specs in this change). `pwa-manifest`/`pwa-icons` are untouched (the single manifest `theme_color` is inherent to the manifest spec and cannot support media queries).
