# Phase 7: Dark Mode + Mobile Responsive

**Date:** 2026-06-01
**Status:** Approved

## Overview

Add dark mode with system preference detection + manual toggle, and make the layout mobile-responsive with a collapsible sidebar drawer.

## Tech Context

- Tailwind CSS v4 (CSS-first config, `@import "tailwindcss"`)
- Next.js 15 + React 19
- No `tailwind.config.js` — configuration via CSS custom variants

## Dark Mode

### Strategy

Class-based dark mode using Tailwind v4's `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`. A `ThemeProvider` component manages theme state:

1. On mount: check `localStorage("theme")` — if set, use it
2. If not set: check `window.matchMedia("(prefers-color-scheme: dark)")`
3. Apply `.dark` class on `<html>` element
4. Listen for system preference changes (for users who haven't manually toggled)
5. Toggle button in sidebar switches between light/dark/system

### Theme Values (3-state)

- `"light"` — force light
- `"dark"` — force dark
- `"system"` — follow OS preference (default)

### Color Mapping

| Light | Dark |
|-------|------|
| `bg-white` | `dark:bg-slate-900` |
| `bg-slate-50` | `dark:bg-slate-800` |
| `bg-slate-100` | `dark:bg-slate-950` |
| `text-slate-900` | `dark:text-slate-100` |
| `text-slate-800` | `dark:text-slate-200` |
| `text-slate-700` | `dark:text-slate-300` |
| `text-slate-600` | `dark:text-slate-400` |
| `text-slate-500` | `dark:text-slate-400` |
| `text-slate-400` | `dark:text-slate-500` |
| `border-slate-100` | `dark:border-slate-700` |
| `border-slate-200` | `dark:border-slate-700` |
| `border-slate-300` | `dark:border-slate-600` |
| `bg-blue-600` (buttons) | stays `bg-blue-600` |
| `hover:bg-slate-50` | `dark:hover:bg-slate-800` |
| `bg-red-50` (error) | `dark:bg-red-900/30` |
| `focus:ring-blue-500` | stays the same |

Sidebar (`bg-slate-900`) is unchanged — dark in both modes.

### Files to Modify

- `frontend/app/globals.css` — add custom variant + dark body
- `frontend/components/ThemeProvider.tsx` — NEW: theme state management
- `frontend/components/Providers.tsx` — wrap with ThemeProvider
- `frontend/app/layout.tsx` — add `suppressHydrationWarning` to html tag
- `frontend/components/layout/Sidebar.tsx` — add theme toggle button
- All page files (10) + UI components (4) — add `dark:` classes

## Mobile Responsive

### Strategy

Sidebar becomes an overlay drawer below `lg` breakpoint (1024px). A top header bar with hamburger menu appears on mobile.

### AppShell Changes

- Track `sidebarOpen` state
- Show mobile header bar (`lg:hidden`) with hamburger button + "xpenses" title
- Main content: remove fixed `ml-[220px]`, use `lg:ml-[220px]` instead
- Backdrop overlay when sidebar is open on mobile

### Sidebar Changes

- Accept `open` and `onClose` props
- On desktop (`lg:` and up): fixed sidebar, always visible (current behavior)
- On mobile (`< lg`): `translate-x` based overlay, close on nav click
- Close on backdrop click

### Table Responsiveness

- Wrap all `<table>` elements in `<div className="overflow-x-auto">`
- Tables scroll horizontally on small screens

### Other Responsive Fixes

- Status filter pills: add `flex-wrap` for wrapping on narrow screens
- Stat cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Page headers: stack vertically on mobile (`flex-col sm:flex-row`)
- Form max-width: already `max-w-lg`, works on mobile
- Payments/approvals cards: already flex-wrap friendly

### Files to Modify

- `frontend/components/layout/AppShell.tsx` — mobile header, responsive margin
- `frontend/components/layout/Sidebar.tsx` — drawer behavior, onClose
- All pages with tables: expenses, reports, categories, admin/users — overflow-x-auto wrapper
- Dashboard: responsive grid adjustment

## Dependencies

No new npm packages required. `lucide-react` already has Sun/Moon/Monitor icons.

## Success Criteria

- Dark mode toggle works, persists across page refreshes
- System preference detection works on first visit
- All pages readable in both light and dark mode
- Sidebar collapses on screens < 1024px
- Hamburger menu opens sidebar as overlay
- Tables scroll horizontally on mobile
- No visual regressions on desktop
