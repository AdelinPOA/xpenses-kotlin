# Design: Top Spacing & Mobile Header Improvements

## 1. AppShell Desktop Top Padding
In `AppShell.tsx`:
Change `main` class `lg:pt-0` to `lg:pt-6` (or `lg:pt-6 sm:pt-6`).

## 2. AppShell Mobile Brand Logo
In `AppShell.tsx`:
Replace `user?.display_name?.charAt(0)` in the center mobile brand header with `Image src="/logo.png" alt="xpenses" width={24} height={24}`.

## 3. Mobile Dashboard Greeting Spacing
In `DashboardClient.tsx`:
Add `pt-2` or `mt-2` to the mobile greeting container row so it doesn't touch the top navbar bottom border.
