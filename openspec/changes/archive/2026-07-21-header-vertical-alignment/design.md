# Design: Header Vertical Alignment & Top Padding

## 1. AppShell Mobile Top Header Flex Centering
In `AppShell.tsx`:
Replace absolute `bottom-2.5` positioning with inner flex row `h-14 px-4 flex items-center justify-between relative`.
Center logo link: `absolute inset-0 flex items-center justify-center gap-2 pointer-events-auto`.
Burger menu button & profile link: relative z-20 for precise vertical baseline centering.

## 2. Sidebar Header Top Padding
In `Sidebar.tsx`:
Set top padding inline style `style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top, 0px))" }}` on the sidebar header container.
