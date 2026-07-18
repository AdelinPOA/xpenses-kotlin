## 1. Setup

- [x] 1.1 Add `framer-motion` dependency to frontend
- [x] 1.2 Define iOS-specific CSS variables and classes (frosted glass, semantic colors) in `globals.css`

## 2. Core Navigation Components

- [x] 2.1 Implement `BottomTabBar` component with Framer Motion active state animations
- [x] 2.2 Refactor `AppShell` / layout to render `BottomTabBar` on mobile (`md:hidden`) and Sidebar on desktop (`hidden md:flex`)

## 3. iOS Aesthetic Primitives

- [x] 3.1 Create an animated `LargeHeader` component that transitions to an inline title on scroll
- [x] 3.2 Create `GroupedList` and `GroupedListItem` components (inset cards with gray background) for menus and settings

## 4. Expense Flow Modal

- [x] 4.1 Implement a gesture-enabled `SheetModal` primitive using Framer Motion (slides up, drag to dismiss)
- [x] 4.2 Refactor the Expense form layout to conditionally render within the `SheetModal` on mobile breakpoints, keeping the split view for desktop
