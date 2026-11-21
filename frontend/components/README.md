# Frontend Components

## Overview
Root React component package housing top-level application providers (authentication/session verification, React Query persistence, offline sync replay, theming, toast notifications, PWA service worker registration, and query error bridging) alongside feature component subpackages.

## Interface
- `[AuthProvider.tsx:VerifiedSession]` — Exported interface `{ user: User; generation: number; identityMarker: string | null }`.
- `[AuthProvider.tsx:useAuth]` — Exported hook returning `AuthContextType`: `{ user: User | null; loading: boolean; sessionVerified: boolean; verifySession: () => Promise<VerifiedSession | null>; isSessionCurrent: (session: VerifiedSession) => boolean; logout: () => Promise<void>; setUser: (user: User | null) => void }`.
- `[AuthProvider.tsx:AuthProvider]` — Default-exported component accepting `{ children: React.ReactNode; persistence: QueryPersistence }`.
- `[IosInstallHint.tsx:IosInstallHint]` — Default-exported component accepting no props; renders an iOS/iPadOS Safari install hint banner.
- `[OfflineSyncProvider.tsx:useOfflineSync]` — Exported hook returning `OfflineSyncContextValue`: `{ pendingCount: number; failedCount: number; items: PendingExpense[]; refreshCount: () => Promise<void>; retryItem: (id: string) => Promise<void>; discardItem: (id: string) => Promise<void> }`.
- `[OfflineSyncProvider.tsx:OfflineSyncProvider]` — Default-exported component accepting `{ children: React.ReactNode }`.
- `[Providers.tsx:Providers]` — Default-exported component accepting `{ children: React.ReactNode }`.
- `[PwaRegistration.tsx:PwaRegistration]` — Default-exported component accepting no props; renders `null`.
- `[QueryErrorBridge.tsx:QueryErrorBridge]` — Default-exported component accepting no props; renders `null`.
- `[ThemeProvider.tsx:useTheme]` — Exported hook returning `ThemeContextType`: `{ theme: "light" | "dark" | "system"; setTheme: (theme: "light" | "dark" | "system") => void; resolved: "light" | "dark" }`.
- `[ThemeProvider.tsx:ThemeProvider]` — Default-exported component accepting `{ children: React.ReactNode }`.
- `[ToastProvider.tsx:ToastType]` — Exported union type `"success" | "error" | "info" | "warning"`.
- `[ToastProvider.tsx:ToastAction]` — Exported interface `{ label: string; onClick: () => void }`.
- `[ToastProvider.tsx:Toast]` — Exported interface `{ id: string; message: string; type: ToastType; action?: ToastAction }`.
- `[ToastProvider.tsx:useToast]` — Exported hook returning `ToastContextProps`: `{ success: (message: string, action?: ToastAction) => void; error: (message: string, action?: ToastAction) => void; info: (message: string, action?: ToastAction) => void; warning: (message: string, action?: ToastAction) => void }`.
- `[ToastProvider.tsx:ToastProvider]` — Named-exported component accepting `{ children: React.ReactNode }`.
- `./admin/README.md` — Admin OCR provider/model settings and delegation email parsing editor (`DelegationParsingSettings`, `OcrModelSettings`).
- `./dashboard/README.md` — Dashboard KPIs, spend chart, status overview, activity stream, pending advances, pending reports table, and slide-over review drawer.
- `./expenses/README.md` — Expense form, FX rate override input, bulk upload/review, immediate OCR review, receipt scanner/preview/lightbox, authorized image, and offline queue panel.
- `./layout/README.md` — Application shell, role-filtered sidebar, mobile header/bottom navigation, FX/fuel status indicators, and route-title resolution (`AppShell`, `Sidebar`, `FxStatusIndicator`, `nav.ts`).
- `./profile/README.md` — User profile vehicle management section (`VehiclesSection`).
- `./reports/README.md` — Weekly mileage trip list and report receipts inspection drawer (`MileageWeeklyList`, `ReportReceiptsDrawer`).
- `./signature/README.md` — HiDPI canvas signature capture pad (`SignaturePad`).
- `./ui/README.md` — Reusable UI primitives (`Badge`, `EmptyState`, `QueryErrorNotice`, `SearchDropdown`).

## Invariants
- `[AuthProvider.tsx:AuthProvider]` Initial render keeps `user = null`, `loading = true`, and `sessionVerified = false` without reading `localStorage` in state initializers so SSR and initial client hydration match; renders a full-screen loading spinner instead of `AuthContext.Provider`/children while `loading && pathname !== "/login"`.
- `[AuthProvider.tsx:getStoredUser]` Cached user from `localStorage` is accepted only when `Number.isSafeInteger(user.id) && user.id > 0`, and `AUTH_MARKER_FIELD` is deleted before returning.
- `[AuthProvider.tsx:AuthProvider]` Cached `localStorage` profile and cross-tab storage updates provide local namespace/display state only; `sessionVerified` becomes `true` only after `getMe()` succeeds and `localStorage` `ownerId`/marker match.
- `[AuthProvider.tsx:verifySession]` Monotonic `authRequestId`, `authGeneration`, and `identityAtStart` checks prevent stale or superseded `/auth/me` responses from updating state or marking an invalidated session verified.
- `[AuthProvider.tsx:verifySession]` Non-terminal auth errors set `sessionVerified = false` while keeping local user and persistence intact; only `getAuthFailureKind(error) === "terminal"` triggers `rejectSession`.
- `[AuthProvider.tsx:isSessionCurrent]` Returns `true` only if `sessionVerifiedRef` is `true`, `authDisabled` is `false`, `generation` and `user.id` match current refs, and `storedIdentityMatches(localStorage, session.user.id, session.identityMarker)` holds.
- `[IosInstallHint.tsx:IosInstallHint]` Visible only when `localStorage` key `"xpenses_ios_install_dismissed"` is absent, UA indicates iOS/iPadOS, and the app is not in standalone mode; hidden on `lg+` viewports via `lg:hidden`.
- `[OfflineSyncProvider.tsx:OfflineSyncProvider]` Aborts active replay (`syncAbortRef`) and clears `activeSessionRef` in `useLayoutEffect` whenever `user?.id` changes or `sessionVerified` becomes `false`.
- `[OfflineSyncProvider.tsx:syncOnce]` Replays only when `!syncingRef.current`, `user?.id` is truthy, and `navigator.onLine` is `true`; requires a fresh `verifySession()` matching `syncUserId` and `isSessionCurrent(verified)` before and during `syncPendingExpenses`.
- `[OfflineSyncProvider.tsx:OfflineSyncProvider]` `pendingCount` equals `items.length`, `failedCount` equals the count of items with truthy `item.error`, and backoff timer only schedules items with `!item.error && item.nextAttemptAt > Date.now()` with a minimum `100ms` delay.
- `[OfflineSyncProvider.tsx:ConnectionBanner]` Active whenever `!(online && pendingCount === 0)`, prioritizing `banner_needs_attention` (`online && failedCount > 0`), then `banner_sync_pending` (`online`), then `banner_offline_with_queue` (`pendingCount > 0`), else `banner_offline`.
- `[Providers.tsx:Providers]` Creates singleton `QueryClient` (`staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: true`) and `QueryPersistence` once per mount in provider order: `ThemeProvider > QueryClientProvider > AuthProvider > LocaleProvider > ToastProvider > (QueryErrorBridge + OfflineSyncProvider) > NavigationGuardProvider`.
- `[PwaRegistration.tsx:PwaRegistration]` Emits an update toast only when `installing.state === "installed"` and `navigator.serviceWorker.controller` is already present, gated by the unmount `cancelled` flag.
- `[QueryErrorBridge.tsx:QueryErrorBridge]` Surfaces an error toast only on query cache `"updated"` events with `action.type === "error"`, `status === "error"`, `getObserversCount() > 0`, unseen `errorUpdatedAt` timestamp, and at most once per `TOAST_INTERVAL_MS` (`15000ms`).
- `[ThemeProvider.tsx:ThemeProvider]` Accepts only `"light" | "dark" | "system"` from `localStorage` (defaulting to `"system"` and initial `resolved = "light"`); `"system"` resolves via `prefers-color-scheme: dark`.
- `[ToastProvider.tsx:useToast]` Throws `Error("useToast must be used within a ToastProvider")` if called outside `ToastProvider`.
- `[ToastProvider.tsx:ToastProvider]` Error toasts render with `role="alert"` and `aria-live="assertive"`; success/info/warning toasts render with `role="status"` and `aria-live="polite"`; clicking a toast action invokes `action.onClick()` and dismisses the toast.

## Side Effects
- `[AuthProvider.tsx:commitUser]` Calls `queryClient.clear()` and `persistence.setOwner(nextId)` on identity change, reads/writes/removes `USER_STORAGE_KEY` in `localStorage`, and calls `writeLangCookie(nextUser.language || "en")`.
- `[AuthProvider.tsx:verifySession]` Calls `getMe()` and schedules a proactive token refresh timer (`50` min) invoking `refreshTokens()`.
- `[AuthProvider.tsx:AuthProvider]` Subscribes to `document` `"visibilitychange"` and `window` `"offline"`, `"online"`, `TERMINAL_AUTH_FAILURE_EVENT`, and `"storage"` events, plus a 5-minute `setInterval` polling `verifySession()`.
- `[AuthProvider.tsx:rejectSession]` Clears the proactive refresh timer, clears user state and `USER_STORAGE_KEY`, and redirects via `router.replace("/login?next=...")` when not already on `/login`.
- `[AuthProvider.tsx:logout]` Calls `apiLogout()`, deletes Cache Storage entries returned by `cachesToPurgeOnLogout(keys)`, posts `{ type: "CLEAR_CACHE" }` to `navigator.serviceWorker.controller`, and navigates via `router.push("/login")`.
- `[IosInstallHint.tsx:IosInstallHint]` Reads `localStorage` key `"xpenses_ios_install_dismissed"` and queries `window.matchMedia("(display-mode: standalone)")`; `dismiss()` writes `"1"` to that key.
- `[OfflineSyncProvider.tsx:refreshCount]` Reads `listPendingExpenses(user.id)` from IndexedDB.
- `[OfflineSyncProvider.tsx:syncOnce]` Calls `verifySession()`, `syncPendingExpenses()`, invalidates `expenseKeys.all`, `dashboardKeys.all`, and `reportKeys.all` on `QueryClient` when `result.synced > 0`, and emits `toast.info`/`toast.success`.
- `[OfflineSyncProvider.tsx:retryItem]` Calls `retryQueuedExpense(id, user.id)` and triggers `syncOnce()`.
- `[OfflineSyncProvider.tsx:discardItem]` Calls `discardQueuedExpense(id, user.id)` and triggers `refreshCount()`.
- `[OfflineSyncProvider.tsx:OfflineSyncProvider]` Registers `window` `"online"`/`"storage"` and `document` `"visibilitychange"` listeners and schedules `setTimeout` retries for queued items.
- `[OfflineSyncProvider.tsx:ConnectionBanner]` Registers `window` `"online"`/`"offline"` listeners, attaches `ResizeObserver` to the banner, and sets/removes `--app-banner-height` and `--app-header-safe-inset` on `document.documentElement.style`.
- `[Providers.tsx:Providers]` Starts query persistence via `persistence.start()` in `useEffect` and invokes its cleanup on unmount.
- `[PwaRegistration.tsx:PwaRegistration]` Calls `navigator.serviceWorker.register("/sw.js")`, attaches `updatefound`/`statechange` listeners, and shows an info toast whose action calls `window.location.reload()`.
- `[QueryErrorBridge.tsx:QueryErrorBridge]` Subscribes to `queryClient.getQueryCache()` and triggers `toast.error` whose action calls `queryClient.refetchQueries({ queryKey: query.queryKey })`.
- `[ThemeProvider.tsx:ThemeProvider]` Reads/writes `"theme"` in `localStorage`, toggles `"dark"` class on `document.documentElement.classList`, and subscribes to `window.matchMedia("(prefers-color-scheme: dark)")` `"change"` events when `theme === "system"`.
- `[ToastProvider.tsx:addToast]` Schedules `4000ms` `setTimeout` timers to auto-dismiss each toast and clears active timers on unmount or manual dismissal.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
