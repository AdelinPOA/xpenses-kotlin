# PWA Public Assets & Service Worker (`frontend/public`)

## Overview
Hosts the Progressive Web App manifest (`manifest.json`), static public icons, and the v9 Service Worker (`sw.js`) that routes navigation and public static asset requests while coordinating the verified offline workspace shell in `./offline`.

## Interface
- `./offline/README.md`: Standalone CSP-hardened v9 offline workspace shell (`/offline/index.v9.html`, `/offline/workspace.v9.js`, `/offline/messages.v9.json`) served as the offline navigation fallback.
- `[manifest.json:name]` & `[manifest.json:display]`: PWA identity and presentation (`name`/`short_name: "xpenses"`, `id: "/"`, `start_url: "/dashboard"`, `scope: "/"`, `display: "standalone"`, `display_override: ["standalone", "browser"]`, `orientation: "any"`, theme/background `"#f8fafc"`).
- `[manifest.json:icons]`: Declares 4 PNG icon entries (`/icons/icon-192x192.png`, `/icons/icon-512x512.png`, and maskable 192x192 and 512x512 variants).
- `[sw.js:CACHE_NAME]` & `[sw.js:XPENSES_CACHE_PREFIX]`: Active CacheStorage bucket `"xpenses-v9"` and pruning prefix `"xpenses-"`.
- `[sw.js:OFFLINE_DOCUMENT]`, `[sw.js:OFFLINE_ASSETS]`, `[sw.js:STATIC_ASSETS]`, `[sw.js:CACHEABLE_PUBLIC_URLS]`: Fallback shell path `"/offline/index.v9.html"`, mandatory v9 offline shell assets with integrity markers, optional static public assets, and the combined `Set` of cacheable public URLs.
- `[sw.js:OFFLINE_CSP]`: Strict Content-Security-Policy header (`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'`) applied to served offline shell responses.
- `[sw.js:install]`, `[sw.js:activate]`, `[sw.js:message]`, `[sw.js:fetch]`: Service Worker lifecycle and request routing handlers (`CLEAR_CACHE` cache purge/recovery, network-first navigations, cache-first public assets).
- `[sw.js:prepareOfflineWorkspace]`, `[sw.js:fetchPublicAsset]`, `[sw.js:cacheStaticAsset]`: Asset fetching and staging helpers.
- `[sw.js:isSafePublicResponse]`, `[sw.js:isVerifiedShell]`, `[sw.js:isValidAssetResponse]`: Integrity, MIME, header, and schema validators for cached and fetched public assets.
- `[sw.js:networkFirstNavigation]`, `[sw.js:offlineWorkspaceUnavailable]`, `[sw.js:cacheFirstPublicAsset]`: Navigation fallback (including localized 503 `en`/`ro` error page) and cache-first public asset responders.

## Invariants
- `[sw.js:install]`: All `OFFLINE_ASSETS` are mandatory (failure throws and aborts install); `STATIC_ASSETS` are optional and errors are ignored; on install failure only `CACHE_NAME` (`"xpenses-v9"`) is deleted.
- `[sw.js:prepareOfflineWorkspace]`: Executable/supporting assets (`OFFLINE_ASSETS.slice(1)`) must be committed to CacheStorage before `OFFLINE_DOCUMENT` (`/offline/index.v9.html`).
- `[sw.js:activate]`: Refuses to activate (throws `Error`) if `isVerifiedShell(cache)` returns `false` for `CACHE_NAME`.
- `[sw.js:message]`: Acts only on `event.data?.type === "CLEAR_CACHE"`, preserving active `CACHE_NAME` and non-`xpenses-` caches.
- `[sw.js:fetch]`: Cross-origin requests, `/api`, `/api/*`, `/_next/*`, requests with `RSC="1"`, `Next-Router-State-Tree`, `Next-Url`, `Next-Action` headers, or `_rsc` query parameters bypass the Service Worker; non-GET requests, GETs with `url.search !== ""`, and paths outside `CACHEABLE_PUBLIC_URLS` are never served from CacheStorage.
- `[sw.js:networkFirstNavigation]`: Live HTML documents are never cached; non-5xx responses (including 4xx auth failures) pass through unmodified; offline fallback triggers only on 500–599 or network errors and only serves `OFFLINE_DOCUMENT` when `isVerifiedShell` passes, with `Cache-Control: no-store`, `OFFLINE_CSP`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
- `[sw.js:fetchPublicAsset]` & `[sw.js:isSafePublicResponse]`: Public assets are fetched with `credentials: "omit"`, `cache: "reload"`, `redirect: "error"` and rejected unless `ok && status === 200`, `type !== "opaque"`, `!redirected`, no `Set-Cookie`, `Cache-Control` lacks `private`/`no-store`, `Content-Type` matches, and `response.url` matches origin and exact pathname.
- `[sw.js:isVerifiedShell]`: Requires every asset in `OFFLINE_ASSETS` to contain its v9 marker and `/offline/messages.v9.json` to parse with `shellVersion === 9` and truthy `en`/`ro` objects.
- `[manifest.json:scope]`: PWA scope is `"/"` with `start_url: "/dashboard"`.

## Side Effects
- `[sw.js:install]`: Opens CacheStorage `"xpenses-v9"`, fetches `STATIC_ASSETS` and `OFFLINE_ASSETS`, writes validated responses to CacheStorage, calls `self.skipWaiting()`, and deletes `"xpenses-v9"` on error.
- `[sw.js:activate]`: Enumerates CacheStorage keys, deletes stale `"xpenses-*"` caches other than `"xpenses-v9"`, and calls `self.clients.claim()`.
- `[sw.js:message]`: Deletes stale `"xpenses-*"` caches on `CLEAR_CACHE` and restores `OFFLINE_ASSETS` into `"xpenses-v9"` if unverified.
- `[sw.js:fetch]`, `[sw.js:networkFirstNavigation]`, `[sw.js:cacheFirstPublicAsset]`: Intercepts browser requests via `event.respondWith`, performs network `fetch`, reads/writes `"xpenses-v9"` in CacheStorage, and synthesizes HTTP 200/503 `Response` objects.

## Verification
- Run: `cd frontend && npm run test:service-worker:unit && npm run typecheck && npm run i18n:check && npm run lint`
