## Context
The current app relies on a uniform responsive design where mobile views are just stacked versions of the desktop UI. This creates a clunky experience for mobile users. We aim to introduce a divergent UI strategy: an iOS-focused mobile UI with native paradigms (bottom tabs, sheet modals) and a dense, data-heavy web UI for desktop.

## Goals / Non-Goals
**Goals:**
- Provide a native iOS-like experience on mobile web (navigation, animations, layout).
- Maintain the dense, data-heavy AppShell UI for desktop users without disruption.

**Non-Goals:**
- Creating a React Native or Swift native app.
- Changing the backend APIs or data models.

## Decisions
- **Divergent Layouts**: Use Tailwind's responsive breakpoints (`hidden md:flex`, `flex md:hidden`) to render entirely different layout shells and navigation components for mobile vs desktop.
  - *Rationale*: A single layout can't perfectly serve both a dense desktop dashboard and a premium mobile native feel.
- **Framer Motion for Animations**: Introduce Framer Motion.
  - *Rationale*: Pure CSS cannot easily handle gesture-driven sheet modals (swipe-to-dismiss) or complex layout animations.
- **Bottom Tab Navigation**: Implement a bottom tab bar for mobile.
  - *Rationale*: It's the standard iOS paradigm, improving one-handed usability.

## Risks / Trade-offs
- [Risk] Increased bundle size from Framer Motion → Mitigate by lazy loading animations where possible and utilizing standard CSS for simple state changes.
- [Risk] Maintaining divergent layouts takes more effort → Mitigate by sharing lower-level primitive components (inputs, list items) while keeping the divergence at the page/layout level.
