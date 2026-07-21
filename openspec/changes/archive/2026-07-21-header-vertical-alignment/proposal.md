# Change: Mobile Header Baseline Centering & Sidebar Top Padding Fix

## Why
1. `.pt-safe` utility class in CSS was evaluating `padding-top: env(safe-area-inset-top, 0px)` to `0px` in standard browsers, overriding `pt-6` and leaving the sidebar logo touching the top edge.
2. In the mobile top header, absolute positioning with `bottom-2.5` caused 36px burger button and 24px logo/avatar elements to sit on different vertical baselines, placing the center logo too low.

## What Changes
1. Refactor mobile top header in `AppShell.tsx` to use flex container `h-14 items-center justify-between` for 100% precise vertical alignment across burger menu, center logo, and right profile avatar.
2. Update sidebar header in `Sidebar.tsx` to use explicit `style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top, 0px))" }}` so it is guaranteed 24px top padding and never touches the top browser edge.
