## Context

The `ios-pwa-metadata` change (session 106) shipped the iOS meta tags, web manifest, icon set, and a vanilla service worker. A follow-up code review found 9 issues; the 6 that change runtime/spec behavior are addressed here. Device testing on iOS is still pending (per HANDOFF.md), so this fix lands before any real PWA users exist.

Baseline code:
- `frontend/app/layout.tsx` — `metadata` + `viewport` exports
- `frontend/public/sw.js` — SW with `xpenses-v1` cache, precaches `/ /login /dashboard /expenses /reports`, network-first for nav/style/script/font, cache-first for images
- `frontend/components/PwaRegistration.tsx` — registers SW, toasts on `updatefound`
- `frontend/lib/api.ts:3-5` — browser `API_BASE_URL = "/api"` (same-origin; `next.config.ts` rewrites `/api/*` → backend)
- `backend .../SignatureController.kt:46-48` — returns raw `IMAGE_PNG`, loaded as `<img src="/api/users/me/signature">` (`app/profile/signature/page.tsx:93`)

Key constraint: browser API calls are same-origin (`/api`), so the SW's origin check does **not** exclude them. Protected images (signature, receipts) are served through `/api`, not as static files.

## Goals / Non-Goals

**Goals:**
- Make the iOS `black-translucent` status bar overlay actually work (viewport-fit + safe-area).
- Stop the SW from caching login HTML under protected-route keys.
- Stop the SW from persistently caching authenticated `/api` responses (signatures, receipts, expense JSON).
- Make SW updates actually apply (skipWaiting + reload).
- Conform to REQ-SW-5 (cache-first for CSS/JS/fonts).
- Avoid caching error/redirect responses.

**Non-Goals:**
- Workbox / build-time precache manifest (the hand-rolled SW stays).
- Offline mutation support (POST/PUT/DELETE continue to fail when offline — only GET caching is in scope).
- Changing the manifest single `theme_color` (inherent to the manifest spec; no media-query support). Tracked as a known limitation.
- Backend changes.

## Decisions

### Decision 1 — `viewport-fit=cover` + safe-area padding (over a different status-bar style)
Add `viewportFit: "cover"` to the `viewport` export and apply `env(safe-area-inset-top)` padding to the top of the app shell (and bottom/left/right for notched devices). 
- **Why over alternatives**: Switching `black-translucent` → `default` would also avoid the hidden-content problem but abandons REQ-IOS-2's "overlay" acceptance criterion. The intended design is a translucent overlay, which strictly requires `viewport-fit=cover`.
- **Where**: add the insets on the `AppShell` root container (the single consistent top chrome) plus a body-level fallback in `globals.css`. Avoids touching every page.

### Decision 2 — Precache only public routes, plus a global redirect/ok guard
Reduce `SHELL_URLS` to `["/", "/login"]` (the only routes reachable unauthenticated). Protected routes will be cached lazily on first authenticated visit via `networkFirst`, which is correct. Independently, add `if (!response.ok || response.redirected) return response;` before every `cache.put` so no redirect-to-login or error body is ever stored under any key.
- **Why over alternatives**: Keeping protected routes in the precache list and relying only on a redirect guard would still issue unauthenticated fetches at install time (wasteful + relies on guard correctness). The combination (smaller precache + guard) is defense-in-depth.

### Decision 3 — Exclude `/api/*` from SW interception entirely
Add `if (url.pathname.startsWith("/api")) return;` right after the origin check in the fetch handler.
- **Why**: API responses are authenticated, frequently changing, and some (signature, receipts) are sensitive. The SW provides no value caching them and actively harms (stale data, persisted credentials, 503 text breaking axios). Letting the browser/axios handle API calls (including its 401-refresh interceptor) directly is correct.

### Decision 4 — Cache-first for CSS/JS/fonts (per REQ-SW-5)
Move `style`, `script`, and `font` destinations from the `networkFirst` branch into a shared cache-first path alongside `image`. Next.js emits these under `/_next/static/` with content hashes, so cache-first is strictly better (instant loads, no freshness loss — the URL changes when content changes).
- **Alternative considered**: leaving them network-first — rejected because it contradicts REQ-SW-5 and adds a network round-trip on every navigation for immutable assets.

### Decision 5 — `skipWaiting` + `controllerchange` reload for updates
Add a `message` listener in the SW that calls `self.skipWaiting()` on `{ type: "SKIP_WAITING" }`. In `PwaRegistration`, when the new SW reaches `installed` with an active controller, post `SKIP_WAITING` to `registration.waiting` and reload on `navigator.serviceWorker` `controllerchange`.
- **Why**: Without this the waiting SW never activates on refresh (Finding 2), making the toast misleading. This is the standard reliable update pattern.

### Decision 6 — Bump cache version to `xpenses-v2`
The `activate` handler already deletes caches whose name differs from `CACHE_NAME`. Bumping to `v2` evicts the polluted `v1` cache (which contains login HTML under protected keys and any cached signatures) on next activation.
- **Risk**: One-time re-fetch of the app shell after upgrade. Acceptable.

### Decision 7 — Listener cleanup in `PwaRegistration`
Store the `registration` and `installing` references and call `removeEventListener` in the effect cleanup; also guard the inner callbacks with the existing `cancelled` flag. Low severity but closes the leak.

## Risks / Trade-offs

- **[Safe-area padding double-counts on non-iOS]** → Use `env(safe-area-inset-*)` which resolves to `0` on devices without insets, so desktop/Android are unaffected.
- **[/api exclusion means no offline API fallback]** → Accepted; the prior behavior (cached stale/sensitive API data + 503 text) was worse. Offline is still functional for the app shell (cached HTML/CSS/JS).
- **[skipWaiting activates new SW on all open tabs]** → Intended; `controllerchange` reload keeps them in sync. The toast + auto-reload is the expected UX.
- **[Cache bump drops offline cache once]** → Self-heals on next online visit; minor one-time cost.
- **[Original `ios-pwa-metadata` change not yet archived]** → Delta specs reference the same capability names (`ios-pwa-metadata`, `pwa-service-worker`); when both changes are archived the deltas apply on top of the base specs.

## Migration Plan

1. Land code changes (no feature flags).
2. Bump `CACHE_NAME` to `xpenses-v2`; on next visit the old cache is purged by the `activate` handler.
3. Deploy; existing users automatically get the new SW (browser checks for SW updates on navigation). The new SW's `skipWaiting` ensures rapid rollout.
4. **Rollback**: revert the commit; `xpenses-v2` would remain (harmless — it only contains correct entries). No data migration needed.

## Open Questions

- Should the update toast offer a manual "Reload now" button (instead of auto-reload on `controllerchange`)? Current design auto-reloads, which is least-surprising for an internal tool. Resolve during implementation if UX feedback differs.
