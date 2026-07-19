# Tasks: fix-mobile-ios-review

## 1. Safe areas & viewport (spec: mobile-safe-area)

- [x] 1.1 `app/layout.tsx`: add `viewportFit: "cover"` to the `viewport` export
- [x] 1.2 `app/globals.css`: add safe-area utilities (`pt-safe`, `pb-safe` via `env(safe-area-inset-*)` with 0 fallback) and `color-scheme: light` on `:root` / `color-scheme: dark` on `.dark`
- [x] 1.3 `components/layout/AppShell.tsx`: mobile header gets `pt-safe` (height adjusts), tab bar's dead `pb-safe` now backed by the real utility, root container `min-h-screen` → `min-h-dvh`
- [x] 1.4 `app/login/page.tsx` + `app/global-error.tsx`: `min-h-screen` → `min-h-dvh`
- [x] 1.5 `components/ToastProvider.tsx`: container `left-4 right-4 sm:left-auto sm:right-4 sm:w-full`, add safe-area top offset
- [x] 1.6 Create `useBodyScrollLock` hook; apply in `Sidebar.tsx` (when open) and `BulkReviewDrawer.tsx` (when open)

## 2. PWA runtime (spec: pwa-runtime)

- [x] 2.1 `public/sw.js`: early return for `/api/` paths; bump `CACHE_NAME` to `xpenses-v2`; add `self.skipWaiting()` on install (keep `clients.claim()`)
- [x] 2.2 `public/manifest.json`: `theme_color` → `#f8fafc`
- [x] 2.3 `components/PwaRegistration.tsx`: keep update toast; no auto-reload

## 3. iOS-safe downloads (spec: file-downloads)

- [x] 3.1 `lib/api.ts` `downloadBlob`: defer `URL.revokeObjectURL` (~60s timeout); iOS/standalone detection → `window.open(objectUrl, "_blank")` fallback; desktop keeps `a.download`

## 4. Forms (spec: mobile-forms)

- [x] 4.1 `app/login/page.tsx`: add `autoCapitalize="none" autoCorrect="off" autoComplete="username"` and `autoComplete="current-password"`
- [x] 4.2 `components/expenses/ExpenseForm.tsx`: all inputs/selects/textarea → `text-base sm:text-sm`; amount + fx-rate fields get `inputMode="decimal"`
- [x] 4.3 `components/expenses/BulkReviewDrawer.tsx`: row inputs → `text-base sm:text-sm`; amount input gets `inputMode="decimal"`
- [x] 4.4 Sweep remaining forms (`app/reports/**`, `app/advances`, `app/categories`, `app/inventory`, `app/insurance`, `app/payments`, `app/profile/**`, `app/admin/**`): inputs/selects/textareas → `text-base sm:text-sm` where currently `text-sm`

## 5. Signature & receipt preview (specs: signature-capture, receipt-capture-preview)

- [x] 5.1 `components/signature/SignaturePad.tsx`: add `touch-none` to canvas
- [x] 5.2 `components/expenses/ExpenseForm.tsx`: convert zoomed-image drag from mouse events to Pointer Events with `setPointerCapture` + `touch-none` on the drag surface
- [x] 5.3 `components/expenses/ExpenseForm.tsx`: add "Take photo" button + hidden `capture="environment"` input wired to `processFileScan`
- [x] 5.4 `components/expenses/ExpenseForm.tsx`: mobile-specific drop-zone copy (no "drag & drop" on touch)
- [x] 5.5 `components/expenses/ExpenseForm.tsx`: wrap added files in `{ id: crypto.randomUUID(), file }` for stable unique keys

## 6. UX polish (spec: mobile-ux-polish)

- [x] 6.1 `components/layout/AppShell.tsx`: remove dead notification bell button
- [x] 6.2 `app/expenses/ExpensesClient.tsx`: `window.confirm` guard before expense delete; raise export dropdown backdrop z-index above header (`z-40`/`z-50`)
- [x] 6.3 `app/reports/[id]/page.tsx`: raise export dropdown backdrop z-index above header
- [x] 6.4 Touch targets ≥44px: `Sidebar.tsx` close button, `ExpenseForm.tsx` zoom buttons
- [x] 6.5 `components/dashboard/SpendChart.tsx`: render empty state when `data` is empty (remove dummy points)
- [x] 6.6 `components/AuthProvider.tsx`: render full-screen spinner while `loading` (except on `/login`)
- [x] 6.7 Remove unused eslint-disable in `BulkReviewDrawer.tsx:225`; fix `eslint.config.mjs` anonymous default export warning

## 7. Verify & ship

- [x] 7.1 `npx tsc --noEmit && npx eslint .` — clean
- [x] 7.2 `npm run build` — passes; compiled CSS contains `safe-area-inset` rules
- [x] 7.3 Visual smoke of key mobile screens (expenses, new expense, signature, dashboard) via Playwright WebKit/iPhone project if backend available, else manual review of markup — full Playwright suite 402/402 green; also fixed 6 pre-existing stale dashboard/auth test assertions (dual-view DOM drift)
