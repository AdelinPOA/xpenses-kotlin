# Offline App Shell and Query Persistence for Mobile Clients

The service worker and client caching architecture is updated to support offline cold-starts and persisted reference data for Technicians operating in low- or no-connectivity environments.

## Context

Technicians often operate in field locations with no cellular signal (substations, basements, rural sites). Previously:
1. `public/sw.js` bypassed all navigation requests (`if (request.mode === "navigate") return;`), causing the browser to render a native "No Internet" page if the app was launched without network.
2. Icons specified in `sw.js` precache did not match disk filenames (`icon-192.png` vs `icon-192x192.png`), breaking offline icon availability.
3. Reference queries (such as expense categories and recent expenses) existed only in in-memory React Query cache and were lost if the browser tab was closed or evicted by mobile OS memory management.

## Decision

1. **Service Worker App Shell Fallback**: `sw.js` implements a Network-First with Cache Fallback strategy for navigation requests. If the network request fails due to offline status, the service worker serves the cached application shell.
2. **Precache Parity**: Correct asset filenames in `sw.js` to match `/public/icons/` (`icon-192x192.png`, `icon-512x512.png`, `apple-touch-icon-180x180.png`).
3. **Persisted Reference Queries**: TanStack Query is configured with an IndexedDB persister for critical read queries (Categories, Profile, Recent Expenses). Cached data is served immediately on launch while background revalidation occurs once network connectivity resumes.
4. **Ambient Offline Indicator**: The application shell provides a non-intrusive status banner indicating offline operation and the count of staged items awaiting synchronization.

## Consequences

- Technicians can launch the PWA from home screen or browser and capture expenses even with no network connection.
- Cache invalidation must be handled carefully across version upgrades (handled by `CACHE_NAME` bumping and `clients.claim()`).
- Sensitive data is prevented from leaking into public caches by strictly excluding authenticated API endpoints from the service worker HTTP cache and keeping persistence inside user-scoped client stores.
