## 1. iOS status-bar overlay (viewport-fit + safe-area)

- [ ] 1.1 Add `viewportFit: "cover"` to the `viewport` export in `frontend/app/layout.tsx`
- [ ] 1.2 Add `env(safe-area-inset-top)` top padding (and bottom/left/right insets) to the `AppShell` root container, with a `0`-default fallback in `globals.css` for devices without insets
- [ ] 1.3 Verify the generated `<meta name="viewport">` contains `viewport-fit=cover` (inspect page source)

## 2. Service worker correctness (`frontend/public/sw.js`)

- [ ] 2.1 Bump `CACHE_NAME` from `xpenses-v1` to `xpenses-v2`
- [ ] 2.2 Reduce `SHELL_URLS` to `["/", "/login"]` (remove `/dashboard`, `/expenses`, `/reports`)
- [ ] 2.3 Add `if (url.pathname.startsWith("/api")) return;` after the origin check in the `fetch` handler
- [ ] 2.4 Route `style`, `script`, and `font` destinations through cache-first (merge into the existing cache-first branch alongside `image`)
- [ ] 2.5 Add `if (!response.ok || response.redirected) return response;` guard before every `cache.put` in `networkFirst` and `cacheFirst`
- [ ] 2.6 Add a `message` event listener that calls `self.skipWaiting()` on `{ type: "SKIP_WAITING" }`

## 3. Registration update flow + cleanup (`frontend/components/PwaRegistration.tsx`)

- [ ] 3.1 On detecting an installed new SW with an active controller, post `{ type: "SKIP_WAITING" }` to `registration.waiting`
- [ ] 3.2 Add a `navigator.serviceWorker` `controllerchange` listener that calls `window.location.reload()`
- [ ] 3.3 Store `registration`/`installing` refs and remove `updatefound`/`statechange` listeners in the effect cleanup; guard inner callbacks with `cancelled`

## 4. Hygiene

- [ ] 4.1 Tick the checkboxes in `openspec/changes/ios-pwa-metadata/tasks.md` (work is complete per HANDOFF.md session 106)

## 5. Verify

- [ ] 5.1 Run `npx tsc --noEmit` in `frontend/`
- [ ] 5.2 Run `npx eslint .` in `frontend/`
- [ ] 5.3 Run `npm run build` in `frontend/`
- [ ] 5.4 Manual: confirm `/api/*` requests are not in the SW cache (DevTools → Application → Cache Storage after browsing the app)
- [ ] 5.5 Manual: confirm a SW update activates on a single refresh (DevTools → Application → Service Workers)
