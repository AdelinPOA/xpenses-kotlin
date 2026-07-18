## Why

The current web app uses a standard desktop-first UI (sidebar, split panes) which feels clunky on mobile devices. An iOS-focused mobile redesign is needed to provide a premium, native feel with optimized ergonomics for on-the-go data entry, while keeping the data-dense web UI for desktop users like managers and CFOs.

## What Changes

- **Navigation**: Switch mobile navigation to a native-style Bottom Tab Bar (Dashboard, Expenses, Reports, More/Profile), moving secondary links into a Side Drawer or "More" tab.
- **Aesthetics**: Apply a full iOS native look, including translucent materials (frosted glass/blur), large bold headers that adapt on scroll, and grouped inset lists (cards on a gray background).
- **Expense Flow**: Convert the "Add Expense" screen into a Full-Screen iOS Modal Sheet that slides up from the bottom, with vertically scrolling inputs and a tappable receipt thumbnail.
- **Animations**: Introduce Framer Motion to provide complex, gesture-driven iOS-like animations (swipe-to-dismiss modals, smooth page transitions).
- **Desktop Fallback**: Implement a divergent design strategy where desktop users retain a dense, data-heavy web UI and only mobile users get the new iOS UI layout.

## Capabilities

### New Capabilities
- `ios-mobile-ui`: Introduction of iOS-specific UI patterns, layouts, navigation concepts (bottom tabs, sheet modals), and animations for mobile breakpoints.

### Modified Capabilities
- `modern-responsive-ui`: Updating requirements to explicitly handle divergent desktop and mobile UI flows instead of a uniformly scaling responsive design.

## Impact

- Significant changes to global layouts (`layout.tsx`, navigation components).
- Replacement of the current Expense form layout on mobile breakpoints with a modal-based flow.
- Addition of Framer Motion as a new frontend dependency.
- More complex component structure requiring breakpoint-aware rendering to serve divergent UIs to desktop vs. mobile.
