## Why

The current user interface of the xpenses application is standard and generic. Upgrading the aesthetics, typography, layouts, and micro-interactions will provide a wowed, premium SaaS feeling, making the application much more satisfying to interact with and reducing user friction during daily expense reporting operations.

## What Changes

- **Core Typography System**: Install the "Outfit" (headings) and "Inter" (body copy) fonts via Google Fonts, replacing the default browser fallback system fonts.
- **Glassmorphic Layout Elements**: Apply translucent background colors combined with backdrop-blur styling to the main Sidebar panel and mobile navigation headers for a modern macOS/iOS-like look.
- **Premium Accents & Card Styles**: Implement rounded-2xl content card structures featuring micro-scale translation transforms and soft ring-shadow triggers on hover. Set primary buttons and indicators to use dynamic Violet-to-Indigo gradients.
- **Glowing Visual Metrics**: Replace dashboard graphs with area-line charts featuring smooth curves, glow filters, and soft gradient fills, complemented by neon circle indicators.
- **Fade and Slide Transitions**: Introduce page-level entrance transitions (fade-in and vertical slide-up) when navigating between main client views.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `user-profiles-reports-view`: Update the visual theme, typography, page transitions, and card/graph designs of the main layout, sidebar, and dashboard client pages.

## Impact

- **Frontend Assets**: Modifies `frontend/app/globals.css`, `frontend/app/layout.tsx` to load Google Fonts, and the primary sidebar and wrapper components.
- **Dashboard & List Pages**: Modifies Dashboard charts, cards, and active navigation links.
- **E2E Testing**: Requires updating visual screenshot baselines or adjusting element class selectors in responsive tests.
