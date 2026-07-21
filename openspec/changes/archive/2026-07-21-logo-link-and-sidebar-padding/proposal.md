# Change: Sidebar & Mobile Header Logo Link & Top Padding

## Why
1. The sidebar header logo and title (`xpenses`) currently lack top spacing, sitting tightly near the top edge.
2. Neither the sidebar header logo/title nor the mobile top header logo/title are clickable. Users expect clicking the logo & brand name to navigate back to `/dashboard`.

## What Changes
1. Increase top padding of the sidebar header in `Sidebar.tsx` to `pt-6 pb-4 pt-safe` for comfortable breathing room on both desktop and mobile burger menu.
2. Wrap the logo image and brand title `xpenses` in `<Link href="/dashboard">` in both `Sidebar.tsx` and `AppShell.tsx` (Mobile header).
