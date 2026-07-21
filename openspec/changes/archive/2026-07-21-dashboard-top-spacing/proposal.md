# Change: Dashboard Top Spacing & Mobile Header Polish

## Why
Visual screenshots revealed that:
1. On desktop viewports, `lg:pt-0` in `AppShell.tsx` removes top padding, placing the search bar and profile header directly against the top window boundary.
2. On mobile viewports, the greeting container sits tight against the bottom border of the fixed top header bar without breathing room.
3. The mobile header renders `user.display_name.charAt(0)` for both the center brand logo and the right profile button, producing duplicate 'A' avatar circles.

## What Changes
1. Change `lg:pt-0` to `lg:pt-6` in `AppShell.tsx` for clean top spacing on desktop.
2. Add top padding/margin (`mt-2`) to the mobile header view in `DashboardClient.tsx`.
3. Replace center initial avatar in mobile top header (`AppShell.tsx`) with `/logo.png`.
