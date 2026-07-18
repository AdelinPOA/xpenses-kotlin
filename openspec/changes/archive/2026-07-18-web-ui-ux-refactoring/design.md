## Context

The current application frontend is functional but lacks a premium feel and optimal mobile experience. As user engagement relies heavily on a responsive and aesthetic interface, we are initiating a comprehensive web UI/UX refactoring. This aligns with modern web design standards (vibrant colors, smooth gradients, dark mode, micro-animations) utilizing our existing Tailwind CSS v4 and Next.js 15 stack.

## Goals / Non-Goals

**Goals:**
- Deliver a premium, "wow" aesthetic across the application.
- Ensure perfect responsive behavior, especially for mobile devices.
- Refactor the React component library for better reusability and visual consistency.
- Integrate smooth micro-animations to make the UI feel alive and interactive.

**Non-Goals:**
- Changing the backend architecture, APIs, or database schema.
- Migrating to a different frontend framework (we stay on React 19 + Next.js 15).
- Altering the core business logic or features (e.g., OCR flow, report state machine remain functionally identical).

## Decisions

- **Tailwind CSS v4 CSS-first Approach**: We will leverage the new CSS-first configuration (`@import "tailwindcss"`) to manage design tokens like colors and spacing instead of a `tailwind.config.js`.
- **Component Refactoring**: Components will be structured systematically. Shared interactive elements (buttons, inputs, cards) will get standardized hover/focus/active states.
- **Mobile-First Layouts**: We will enforce `flex-col` or grid-based layouts on mobile, expanding to multi-column only at `md` or `lg` breakpoints. The sidebar will remain an overlay drawer on mobile and fixed on desktop.

## Risks / Trade-offs

- [Risk] Extensive UI changes might introduce layout bugs on specific devices.
  - Mitigation: Rigorous testing across mobile emulators and browser viewports before merging.
- [Risk] Performance degradation due to heavy animations.
  - Mitigation: Ensure micro-animations use performant CSS properties (`transform`, `opacity`) and avoid layout thrashing.
