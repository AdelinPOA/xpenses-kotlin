# PWA Service Worker

## Description

Minimal vanilla JavaScript service worker for app shell precaching and network-first API strategy, plus a React component for registration.

## Requirements

- **REQ-SW-1**: Service worker file MUST be at `public/sw.js` (served at `/sw.js`)
- **REQ-SW-2**: On `install` event, SW MUST precache the app shell routes: `/`, `/login`, `/dashboard`, `/expenses`, `/reports`
- **REQ-SW-3**: On `activate`, SW MUST clean up old caches (version keyed)
- **REQ-SW-4**: On `fetch`, SW MUST use network-first strategy for same-origin requests (try network, fall back to cache)
- **REQ-SW-5**: On `fetch`, SW MUST use cache-first strategy for static assets (fonts, icons, CSS, JS)
- **REQ-SW-6**: A `PwaRegistration.tsx` client component MUST register the SW via `navigator.serviceWorker.register('/sw.js')`
- **REQ-SW-7**: Registration MUST handle the `updatefound` event and prompt user to refresh when new SW is detected (using existing toast system)
- **REQ-SW-8**: Registration MUST silently catch and log errors (no user-facing error for SW failures)
- **REQ-SW-9**: SW MUST have a version constant for cache naming to enable clean upgrades

## Acceptance Criteria

- Service worker registers successfully (verified in Chrome DevTools > Application > Service Workers)
- App shell loads from cache on repeat visits
- API requests go to network first, fall back to cache on failure
- When SW updates, a toast notification appears offering refresh
- No errors in console on browsers without SW support (iOS <16.4)
