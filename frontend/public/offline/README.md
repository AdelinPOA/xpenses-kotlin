# Offline Workspace Shell (`frontend/public/offline`)

## Overview
Standalone, CSP-hardened v9 offline fallback shell served by the Service Worker when the main Next.js application is unreachable. It provides owner-verified local access to cached React Query expenses (`xpenses-cache`) and enables capturing offline expense drafts with compressed receipt photos into IndexedDB (`xpenses-offline`) without executing Next.js runtime code.

## Interface
- `[index.v9.html:data-xpenses-offline-shell]` & `[index.v9.html:offline-app]`: Offline HTML shell (`xpenses-offline-shell="v9"`) exposing status, notice, `#private-workspace`, `#cached-expenses`, `#offline-drafts`, `#check-account`, and `#reconnect-link` (`/dashboard?offline=return`).
- `[index.v9.html:draft-form]`: Local expense capture form (`#draft-form`) with `#amount` (`min="0.01"`, `step="0.01"`), `#currency` (`EUR`, `RON`, `USD`, `GBP`, `CHF`), `#date`, `#merchant` (`maxlength="160"`), `#description` (`maxlength="500"`), `#receipt-photo` (`accept="image/*"`, `capture="environment"`), `#photo-name`, `#form-error`, and `#save-draft`.
- `[messages.v9.json:shellVersion]`, `[messages.v9.json:en]`, `[messages.v9.json:ro]`: Versioned (`shellVersion: 9`) English and Romanian localization dictionaries containing 52 UI status, validation, form, and privacy message keys.
- `[workspace.v9.js:PROFILE_KEY]`: `localStorage` contract key `"xpenses_user_profile"` storing the logged-in user's profile JSON with positive safe integer `id`.
- `[workspace.v9.js:QUERY_DB]`: IndexedDB `"xpenses-cache"` (v1), object store `"react_query"`, key `"persisted_state"` storing cached React Query snapshot (`userId`, `timestamp`, `state.queries`).
- `[workspace.v9.js:QUEUE_DB]`: IndexedDB `"xpenses-offline"` (v2), object store `"pending_expenses"` (`keyPath: "id"`) storing offline drafts (`id`, `userId`, `payload`, `receipts`, `stage: "creation_pending"`, `createdAt`, `updatedAt`, `attempts`, `nextAttemptAt`).
- `[workspace.v9.js:MAX_QUERY_AGE_MS]`: Limits and media constraints: `MAX_QUERY_AGE_MS` (24h), `MAX_QUEUE_SIZE` (20), `MAX_QUEUE_BYTES` (100 MB), `MAX_SOURCE_PHOTO_BYTES` (25 MB), `MAX_RECEIPT_BYTES` (10 MB), and `RECEIPT_TYPES` (`image/jpeg`, `image/png`, `image/webp`).
- `[workspace.v9.js:boot]`: IIFE-encapsulated runtime (no exported globals) orchestrating `loadMessages`, `bindEvents`, `verifyCurrentOwner`, `loadLocal`, `renderLocal`, `onSave`, `addDraft`, `preparePhoto`, and `compressPhoto`.

## Invariants
- `[index.v9.html:Content-Security-Policy]`: Enforces strict CSP (`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; base-uri 'none'; form-action 'none'; object-src 'none'`) and `no-referrer`.
- `[index.v9.html:private-workspace]`: `#private-workspace`, `#expenses-empty`, `#drafts-empty`, `#form-error`, `#check-account`, and `#reconnect-link` initialize `hidden` until owner checks succeed.
- `[messages.v9.json:shellVersion]`: `loadMessages` requires HTTP 2xx, `messages.shellVersion === 9`, and dictionary entries for `state.locale` (`en` or `ro`).
- `[workspace.v9.js:cookieLocale]`: Resolves locale only to `"en"` or `"ro"` from the `lang` cookie, falling back to `"ro"` when `navigator.language.startsWith("ro")` and `"en"` otherwise.
- `[workspace.v9.js:storedOwnerId]` & `[workspace.v9.js:ownerIsCurrent]`: Requires owner ID to be a positive safe integer matching `state.ownerId`, `state.ownerGeneration`, and current `storedOwnerId()` across all async steps.
- `[workspace.v9.js:querySnapshotMatchesOwner]`: Requires cached query snapshots to match `record.userId === ownerId` with `0 <= timestamp <= Date.now() + 5_000`; `querySnapshotIsFresh` hides cached expenses older than `MAX_QUERY_AGE_MS` (24h).
- `[workspace.v9.js:verifyCurrentOwner]`: When online, clears private data and cancels pending writes/photo picker, then requires `/api/auth/me` HTTP 2xx with `user.id === ownerId` before unlocking verified access.
- `[workspace.v9.js:openQueueDatabase]`: Requires `pending_expenses` store `keyPath === "id"`; deletes and recreates `xpenses-offline` only when `rowCount === 0`, refusing to discard non-empty incompatible stores.
- `[workspace.v9.js:readQueue]` & `[workspace.v9.js:addDraft]`: Aborts IndexedDB transactions if any record fails `validQueueItem`/`validStoredReceipt` or owner/generation checks, filters drafts strictly by `item.userId === ownerId` sorted by `createdAt`, and enforces `items.length < 20` and `bytes + newBytes <= 100 MB`.
- `[workspace.v9.js:validPayload]` & `[workspace.v9.js:preparePhoto]`: Requires finite `amount > 0`, 3-uppercase-letter `currency`, valid `YYYY-MM-DD` calendar `date`, source photo `0 < size <= 25 MB` (`image/*`), and compressed receipt `0 < size <= 10 MB` in `RECEIPT_TYPES`.
- `[workspace.v9.js:bindEvents]`: Cross-tab `storage` events on `PROFILE_KEY` (or `null`) increment `state.ownerGeneration`, abort `state.pendingWrites`, invalidate `state.photoPicker`, and wipe private DOM/object URLs.

## Side Effects
- `[index.v9.html:workspace.v9.js]`: Loads `/offline/workspace.v9.css` and executes deferred `/offline/workspace.v9.js`.
- `[workspace.v9.js:loadMessages]` & `[workspace.v9.js:verifyCurrentOwner]`: Issues `fetch("/offline/messages.v9.json", { credentials: "omit", cache: "no-store" })` and `fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })`.
- `[workspace.v9.js:storedOwnerId]` & `[workspace.v9.js:loadMessages]`: Reads `localStorage.getItem("xpenses_user_profile")` and `document.cookie`.
- `[workspace.v9.js:readQueryRecord]`, `[workspace.v9.js:openQueueDatabase]`, `[workspace.v9.js:readQueue]`, `[workspace.v9.js:addDraft]`: Opens, upgrades, reads, writes (`store.put`), and conditionally deletes empty incompatible `"xpenses-offline"` / `"xpenses-cache"` IndexedDB databases.
- `[workspace.v9.js:onSave]`: Calls `navigator.storage.persist()` before persisting a draft.
- `[workspace.v9.js:compressPhoto]` & `[workspace.v9.js:renderDrafts]`: Reads selected `File` via `FileReader`, scales/compresses onto offscreen `<canvas>` (max 1600px, JPEG `0.8`), and manages `URL.createObjectURL` / `URL.revokeObjectURL` previews.
- `[workspace.v9.js:boot]`: Mutates DOM elements, `document.documentElement.lang`, `document.title`, and registers DOM/window listeners (`submit`, `click`, `change`, `online`, `offline`, `storage`).

## Verification
- Run: `cd frontend && npm run test:service-worker:unit && npm run typecheck && npm run i18n:check && npm run lint`
