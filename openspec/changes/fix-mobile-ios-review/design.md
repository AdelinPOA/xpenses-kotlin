# Design: fix-mobile-ios-review

## Context

The frontend is a Next.js 15 / React 19 / Tailwind v4 app used heavily as an installed PWA on iPhones (field technicians scanning receipts, signing reports). A review found systemic iOS issues: safe-area support is wired incorrectly in three places at once, React's passive touch listeners break the signature canvas, all form controls use 14px fonts (iOS force-zooms below 16px), blob downloads silently fail in the home-screen PWA, and the hand-rolled service worker caches authenticated `/api/*` GETs. Everything is frontend-only; no API or schema changes.

## Goals / Non-Goals

**Goals:**
- Make the installed PWA respect iPhone safe areas (notch, home indicator) everywhere fixed chrome exists.
- Make signing, downloading, and form-filling actually work on iOS Safari + standalone PWA.
- Stop the service worker from caching authenticated API data.
- Fix the reviewed mobile UX defects without changing desktop appearance or any backend contract.

**Non-Goals:**
- No redesign of screens, navigation, or visual language.
- No new dependencies (e.g., no signature-pad or download library).
- No backend changes, no Playwright test authoring (existing suites must keep passing).
- No offline-support feature work beyond removing API caching (app remains online-first).

## Decisions

### D1 — Safe areas: CSS utilities in `globals.css`, not a Tailwind plugin
Tailwind 4.3 ships flexbox `*-center-safe` keywords but **no** `p-safe`/`pb-safe` inset utilities (verified in `node_modules/tailwindcss/dist`). We define plain CSS utilities in `@layer utilities` (`pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`, and `pb-safe-or-4` style combos as needed) backed by `env(safe-area-inset-*)`, and add `viewportFit: "cover"` to the root `viewport` export — without it every `env()` resolves to 0. Alternatives considered: (a) inline `style={{ paddingBottom: "env(...)" }}` — rejected, scattered and untestable; (b) upgrading Tailwind — rejected, unnecessary risk for four utilities. `min-h-screen` → `min-h-dvh` with a `min-h-screen` fallback line for old WebKit.

### D2 — Signature pad: `touch-action: none`, keep React handlers
React 17+ attaches `touchstart/touchmove` as passive at the root, so `e.preventDefault()` in the existing handlers is ignored on iOS and the page scrolls mid-signature. The robust fix is CSS `touch-action: none` on the `<canvas>` (Tailwind `touch-none`), which prevents the scroll gesture before it reaches the listener model — supported iOS 13+. Alternative considered: native non-passive listeners via `ref` + `{ passive: false }` — rejected as more code for the same result; the existing `preventDefault` calls stay as harmless no-ops.

### D3 — Form font size: `text-base sm:text-sm` per control, no global override
iOS Safari zooms on focus when computed font-size < 16px. We change form controls to `text-base sm:text-sm` (16px mobile, 14px desktop) so desktop density is untouched. Alternatives: (a) global `input { font-size: 16px !important }` media query — rejected, fights Tailwind specificity and surprises desktop; (b) `maximumScale: 1` in viewport — rejected, accessibility anti-pattern (blocks pinch zoom).

### D4 — Downloads: feature-detect iOS, fall back to `window.open`
`downloadBlob` keeps the synthetic-click path for desktop, but (a) defers `URL.revokeObjectURL` via `setTimeout` (~60s) so iOS doesn't revoke mid-navigation, and (b) on iOS/PWA (`/iPad|iPhone|iPod/` or standalone mode + touch) uses `window.open(objectUrl, "_blank")` instead of `a.download`, which silently no-ops in WKWebView/home-screen context. Alternative: FileReader→data-URL — rejected, memory-heavy for ZIP/PDF exports.

### D5 — Service worker: bypass `/api/`, bump cache, claim update flow
`sw.js` gets an early `if (url.pathname.startsWith("/api/")) return;` so API traffic never touches Cache Storage (kills both the stale-data and PII-persistence problems). `CACHE_NAME` bumps to `xpenses-v2`, `install` calls `self.skipWaiting()`, and `PwaRegistration` listens for `controllerchange` to trigger a one-time `location.reload()` — making the existing "new version" toast truthful. Alternative: versioned SW registration prompts — overkill here.

### D6 — Scroll lock: shared `useBodyScrollLock` hook
Sidebar and `BulkReviewDrawer` set `document.body.style.overflow = "hidden"` while open (restored on cleanup). No dependency; iOS scroll-chaining through fixed panels is otherwise unstoppable without `overscroll-behavior` hacks that harm the drawer's own scrolling.

### D7 — Receipt pan: Pointer Events replace mouse handlers
`ExpenseForm`'s zoomed-image drag switches from `onMouseDown/Move/Up` to `onPointerDown/Move/Up/Cancel` (+ `setPointerCapture`, `touch-none` on the drag surface) so touch panning works. Camera capture: a secondary "Take photo" button next to the drop zone targeting a hidden input with `capture="environment"` (primary input stays choice-based). File row keys become stable unique ids (`crypto.randomUUID()` per added file wrapper) instead of `name+size`.

### D8 — Polish batch
Bell button removed from the mobile header (dead UI + fake badge); expense delete gets a `window.confirm` guard; sub-44px icon buttons padded to ≥44px on touch (`p-2` minimum); export dropdown backdrops raised above header z-index; SpendChart renders an empty state when `data` is empty; AuthProvider renders a full-screen spinner while `loading` to kill the user-null flash; login inputs get `autoCapitalize="none" autoCorrect="off" autoComplete="username|current-password"`; amount fields get `inputMode="decimal"`; `:root`/`.dark` get `color-scheme: light/dark`; manifest `theme_color` aligns to the light background; iOS splash via `apple-touch-startup-image` is skipped (asset generation cost > value, noted as follow-up).

## Risks / Trade-offs

- [Safe-area padding shifts layouts on Android/desktop] → `env()` is 0 where unsupported; guarded by `viewportFit` only affecting edge-to-edge devices.
- [`text-base sm:text-sm` changes many files mechanically] → purely presentational; verified by tsc + build + visual pass on key screens.
- [`window.open` on iOS opens receipts in a new tab instead of downloading] → acceptable: viewing is the dominant intent on mobile; desktop keeps true downloads.
- [SW `skipWaiting` + auto-reload could interrupt a form fill] → reload only fires on `controllerchange` after the user acknowledged… actually: reload fires immediately on controller change. Mitigation: keep toast informational and reload only when `document.visibilityState === "visible"` and no pending mutations is too complex — instead we do **not** auto-reload; the toast tells the user to refresh, and new SW activates on next natural navigation. (Revised: skip auto-reload.)
- [Body scroll lock can leave `overflow:hidden` if a component crashes mid-render] → hook restores in `useEffect` cleanup; global-error boundary resets it.

## Migration Plan

1. Apply code changes (see tasks.md).
2. Verify: `npx tsc --noEmit && npx eslint . && npm run build`.
3. Manual smoke on iOS (or Playwright WebKit project): PWA safe areas, signature draw, receipt download, login autofill, expense form zoom-free focus.
4. Rollback: revert the change; SW v2 cache is additive — old clients keep working.

## Open Questions

- iOS splash-screen images (`apple-touch-startup-image` per device size) — defer to a follow-up change with generated assets.
- Whether exports should use the Web Share API (`navigator.share` with files) on iOS — nicer UX, but requires backend MIME correctness checks; follow-up.
