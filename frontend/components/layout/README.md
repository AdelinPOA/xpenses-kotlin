# Layout Components

## Overview
Application shell, role-gated navigation sidebar, mobile header and bottom bar, route-title resolution, and keyboard/focus/inert accessibility management.

## Interface
- `[AppShell.tsx:AppShell]` — Default-exported client component `AppShell({ children }: { children: React.ReactNode })` rendering mobile `<header id="app-header">`, `<Sidebar>`, `<main id="main-content">` with `<IosInstallHint />`, and mobile `<nav id="mobile-bottom-nav">`.
- `[Sidebar.tsx:SidebarProps]` — Props interface `{ open: boolean; onClose: () => void }` consumed by `Sidebar`.
- `[Sidebar.tsx:Sidebar]` — Default-exported client component `Sidebar({ open, onClose }: SidebarProps)` rendering the mobile backdrop, `<aside id="app-sidebar">`, role-filtered `NAV` and `ADMIN_NAV` links, separated `/profile/signature` link, user summary, theme switcher, and sign-out button.
- `[FxStatusIndicator.tsx:FxSidebarStatusPill]` — Exported client component `FxSidebarStatusPill({ onNavigate }: { onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void })` rendering the sidebar FX rate/health status pill.
- `[FxStatusIndicator.tsx:FuelSidebarStatusPill]` — Exported client component `FuelSidebarStatusPill({ onNavigate }: { onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void })` rendering the sidebar fuel price/health status pill.
- `[FxStatusIndicator.tsx:FxFallbackBanner]` — Exported client component `FxFallbackBanner()` rendering a dismissible banner when FX rates are in fallback or down state.
- `[FxStatusIndicator.tsx:FuelFallbackBanner]` — Exported client component `FuelFallbackBanner()` rendering a dismissible banner when fuel prices are in fallback state.
- `[nav.ts:NavItem]` — Exported TypeScript interface `{ href: string; labelKey: string; icon: typeof LayoutDashboard; roles: string[] }`.
- `[nav.ts:NAV]` — Exported `NavItem[]` defining primary routes (`/profile`, `/dashboard`, `/expenses`, `/insurance`, `/reports`, `/approvals`, `/advances`, `/payments`, `/categories`, `/admin/settings`, `/profile/signature`) and allowed roles (`technician`, `manager`, `chef_finance`, `mod`).
- `[nav.ts:ADMIN_NAV]` — Exported `NavItem[]` defining admin/directory routes (`/admin/users`, `/admin/ldap`, `/admin/email`, `/admin/imap`, `/admin/ocr`, `/admin/receipts`, `/admin/storage`) and allowed roles (`mod`, `manager`, `chef_finance`).
- `[nav.ts:navLabelKeyFor]` — Exported function `(pathname: string) => string | null` returning the nav translation key for the longest matching route prefix or `null`.

## Invariants
- `[AppShell.tsx:AppShell]` Mobile bottom nav renders 4 items (`/dashboard`, `/approvals`, `/reports`, `/profile`) when `user?.role === "manager"`, and 5 items (`/dashboard`, `/expenses`, elevated `/expenses/capture`, `/reports`, `/profile`) otherwise.
- `[AppShell.tsx:AppShell]` Mobile bottom nav marks an item active only when `pathname === href || (href !== "/dashboard" && pathname.startsWith(href))`.
- `[AppShell.tsx:AppShell]` Offline badge renders when `!isOnline`; pending sync badge linking to `/expenses` renders when `isOnline && pendingCount > 0`, using rose styling when `failedCount > 0` and pulsing blue styling otherwise.
- `[AppShell.tsx:AppShell]` Header links, bottom nav links, and the `Cmd/Ctrl+K` shortcut are gated by `allowNavigation()` (`e.preventDefault()` on `false`).
- `[AppShell.tsx:AppShell]` Mobile menu button maintains `aria-expanded={sidebarOpen}` and `aria-controls="app-sidebar"`.
- `[Sidebar.tsx:Sidebar]` `NAV` and `ADMIN_NAV` entries are shown only when `user` is present and `roles.includes(user.role)`; the admin/directory section renders only for roles `mod`, `manager`, or `chef_finance` (`admin_section` label for `mod`, `directory_section` otherwise).
- `[Sidebar.tsx:Sidebar]` `/profile/signature` is filtered out of the primary `NAV` list and rendered below an `<hr>` divider only if included in `visibleNav`.
- `[Sidebar.tsx:Sidebar]` Desktop breakpoint is `(min-width: 1024px)`; when `!isDesktop && !open`, `<aside id="app-sidebar">` sets `aria-hidden="true"` and `inert={true}`.
- `[Sidebar.tsx:Sidebar]` All sidebar `<Link>` elements invoke `guardedNavigate(e)` (calling `e.preventDefault()` if `!allowNavigation()`) and `onClose()`, and Sign Out invokes `logout()` only if `allowNavigation()` returns `true`.
- `[Sidebar.tsx:Sidebar]` When `open` is `true`, `Tab`/`Shift+Tab` wraps focus within enabled focusable elements inside `sidebarRef.current` and `Escape` triggers `onClose()`.
- `[Sidebar.tsx:Sidebar]` Theme switcher cycles strictly through `["light", "dark", "system"]`.
- `[nav.ts:TITLE_ROUTES]` Combines `NAV`, `ADMIN_NAV`, and internal `EXTRA_TITLE_ROUTES` (`/expenses/capture`, `/search` with `roles: []`) sorted descending by `href.length` so the longest route prefix matches first.
- `[nav.ts:navLabelKeyFor]` Matches routes only on exact equality (`pathname === href`) or segment boundary (`pathname.startsWith(`${href}/`)`).
- `[FxStatusIndicator.tsx:FxSidebarStatusPill]` & `[FxStatusIndicator.tsx:FuelSidebarStatusPill]`: Return `null` when `!user || !data`; format `activeProvider.ron_per_eur` with `toFixed(4)` and `activeProvider.diesel_ron` with `toFixed(2)` when non-null.
- `[FxStatusIndicator.tsx:FxFallbackBanner]` & `[FxStatusIndicator.tsx:FuelFallbackBanner]`: `FxFallbackBanner` renders only when `data.fallback_active || data.status === "DOWN"`, `FuelFallbackBanner` renders only when `data.fallback_active` is truthy, and both suppress rendering when `dismissedKey === \`${data.status}:${data.active_source ?? "none"}:${data.primary_error ?? ""}\``.
- `[FxStatusIndicator.tsx:SidebarStatusLink]`: Settings links (`/admin/settings#fx-providers`, `/admin/settings#fuel-prices`) render only when `user.role === "mod" || user.role === "chef_finance"`.

## Side Effects
- `[AppShell.tsx:AppShell]` Mutates `document.title` on `pathname` or `tNav` changes using `navLabelKeyFor(pathname)` (`${tNav(key)} · xpenses` or `xpenses`).
- `[AppShell.tsx:AppShell]` Registers a `window` `keydown` listener for `(metaKey || ctrlKey) && key.toLowerCase() === "k"` that calls `event.preventDefault()` and `router.push("/search")` when `allowNavigation()` is `true`.
- `[AppShell.tsx:AppShell]` Reads `navigator.onLine` on mount and attaches `window` `online` and `offline` event listeners to update `isOnline`.
- `[AppShell.tsx:AppShell]` `closeSidebar` calls `requestAnimationFrame(() => menuButtonRef.current?.focus())` to restore focus after closing.
- `[Sidebar.tsx:Sidebar]` Locks document body scroll when `open` is `true` via `useBodyScrollLock(open)`.
- `[Sidebar.tsx:Sidebar]` Subscribes to `window.matchMedia("(min-width: 1024px)")` `change` events and calls `onClose()` if the viewport becomes desktop while `open` is `true`.
- `[Sidebar.tsx:Sidebar]` When `open` is `true`, sets `inert` on `#main-content`, `#app-header`, and `#mobile-bottom-nav`, focuses `sidebarRef.current`, attaches a `document` `keydown` listener, and removes `inert` and the listener on cleanup.
- `[Sidebar.tsx:Sidebar]` Theme button calls `setTheme(...)` via `useTheme()` and Sign Out calls `logout()` via `useAuth()`.
- `[FxStatusIndicator.tsx:FxSidebarStatusPill]` & `[FxStatusIndicator.tsx:FxFallbackBanner]`: Subscribe to FX status via `useFxStatus(Boolean(user))`; banner dismiss updates local `dismissedKey` state.
- `[FxStatusIndicator.tsx:FuelSidebarStatusPill]` & `[FxStatusIndicator.tsx:FuelFallbackBanner]`: Subscribe to fuel price status via `useFuelPriceStatus(Boolean(user))`; banner dismiss updates local `dismissedKey` state.
- `[FxStatusIndicator.tsx:SidebarStatusLink]`: Invokes optional `onNavigate` handler and client-side `Link` navigation when `canManageSettings` is `true`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
