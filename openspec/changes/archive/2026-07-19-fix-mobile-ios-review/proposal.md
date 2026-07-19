# Proposal: fix-mobile-ios-review

## Why

A full frontend review (mobile/iOS focus) found that the app — which is installed as a home-screen PWA by field technicians on iPhones — has several broken mobile behaviors: safe-area insets are completely non-functional (dead `pb-safe` class + missing `viewportFit`), the signature pad scrolls the page instead of drawing, every form triggers iOS focus zoom, blob downloads silently fail in the PWA, and the service worker caches authenticated API responses. These are daily-use blockers for the primary mobile user group.

## What Changes

- **Safe areas**: add `viewportFit: "cover"` to the root viewport, define real safe-area CSS utilities in `globals.css` (Tailwind 4.3 ships none), apply them to the mobile header, bottom tab bar, toast container, and drawers; replace `min-h-screen` with `min-h-dvh`.
- **Signature pad**: add `touch-action: none` so drawing works on iOS (React passive touch listeners ignore `preventDefault`).
- **Forms**: bump all form controls to ≥16px on mobile (`text-base sm:text-sm`) to stop iOS auto-zoom; add `autoCapitalize`/`autoCorrect`/`autoComplete` to login; use `inputMode="decimal"` for amounts; add `color-scheme` for dark-mode native pickers.
- **Downloads**: make `downloadBlob` iOS-safe (deferred `revokeObjectURL`, `window.open` fallback for iOS/PWA).
- **Service worker**: never cache `/api/*` requests; add `skipWaiting` + reload-based update flow; align manifest `theme_color`; add iOS splash-screen tags.
- **Mobile chrome**: lock body scroll behind sidebar/drawers; remove the dead notification bell; enlarge sub-44px touch targets; fix dropdown backdrop z-index vs header; fix toast container off-screen clipping.
- **Receipt UX**: pointer-event-based pan for zoomed receipts (touch support), dedicated camera-capture button, mobile-appropriate drop-zone copy, fix duplicate React keys for re-added files.
- **Misc fixes**: SpendChart empty state instead of fake dummy data; expense delete confirmation; clear auth loading flash; clean up 2 eslint warnings.

## Capabilities

### New Capabilities
- `mobile-safe-area`: viewport-fit cover, safe-area padding utilities, dvh viewport units, safe placement of fixed chrome (header, tab bar, toasts, drawers) and body scroll-locking.
- `mobile-forms`: iOS-proof form controls (16px minimum font, decimal input mode, login autofill attributes, dark-mode `color-scheme`).
- `signature-capture`: touch-based signature drawing that does not scroll the page.
- `file-downloads`: authenticated blob downloads that work in iOS Safari and the installed PWA.
- `pwa-runtime`: service-worker fetch policy that excludes API traffic, a working update flow, and correct iOS PWA metadata.
- `receipt-capture-preview`: camera capture, touch pan/zoom preview, mobile-appropriate upload copy, stable file-list keys.
- `mobile-ux-polish`: touch-target sizes, removal of dead UI, destructive-action confirmation, dropdown layering, honest empty states, no auth flash.

### Modified Capabilities
<!-- No existing specs in openspec/specs/ — nothing to modify. -->

## Impact

- **Code**: `frontend/app/layout.tsx`, `frontend/app/globals.css`, `frontend/app/login/page.tsx`, `frontend/app/global-error.tsx`, `frontend/components/layout/AppShell.tsx`, `frontend/components/layout/Sidebar.tsx`, `frontend/components/signature/SignaturePad.tsx`, `frontend/components/ToastProvider.tsx`, `frontend/components/AuthProvider.tsx`, `frontend/components/PwaRegistration.tsx`, `frontend/components/expenses/ExpenseForm.tsx`, `frontend/components/expenses/BulkReviewDrawer.tsx`, `frontend/components/dashboard/SpendChart.tsx`, `frontend/app/expenses/ExpensesClient.tsx`, `frontend/lib/api.ts`, `frontend/public/sw.js`, `frontend/public/manifest.json`, plus `inputMode`/font-size touches in admin pages and `eslint.config.mjs`.
- **APIs**: none (frontend-only).
- **Dependencies**: none added.
- **Systems**: PWA behavior changes (service worker v2 cache name — clients update on next launch).
- **Risk**: low; visual/layout only. Verified by `npx tsc --noEmit`, `npx eslint .`, `npm run build`, and the existing Playwright iPhone/iPad responsive suites.
