## Context

The current user interface uses standard tailwind styling, native default browser fonts, and flat borders/shadows. To upgrade it, we will load modern Google fonts ("Outfit" and "Inter") inside the root layout and update `globals.css` with glassmorphic variables, theme utility declarations, and smooth micro-animations.

## Goals / Non-Goals

**Goals:**
- Upgrade the visual design with Outfit and Inter typography.
- Implement glassmorphic blurs on sidebars and page headers.
- Implement Indigo-to-Violet gradient accents and smooth hover scale effects for all content cards.
- Refactor the dashboard stats, progress charts, and page nav transitions to have high-impact glows and micro-animations.

**Non-Goals:**
- We are not changing the core data structure or backend endpoints.
- We are not redesigning the form fields and form logic themselves, only their boundaries, fonts, and container backgrounds.

## Decisions

### 1. Font Integration via Next.js Metadata and CSS Variables
- **Choice**: Load Outfit and Inter via Next.js `next/font/google` in `frontend/app/layout.tsx` and configure CSS variables mapping to `--font-heading` and `--font-body` respectively in `globals.css` under the `@theme` block.
- **Alternative**: Load them via `<link>` tags in HTML head. Using `next/font` is preferred as it optimizes font files, prevents visual layouts layout-shift (CLS), and automatically hosts fonts locally.

### 2. Glassmorphism for Navigation Components
- **Choice**: Apply backdrop blur using Tailwind v4 custom utilities (`backdrop-blur-md bg-white/70 dark:bg-slate-950/70 border-r border-slate-200/50 dark:border-slate-800/50`) to the desktop Sidebar and mobile layout headers.
- **Alternative**: Apply blurs to all cards. This was rejected because nested backdrop-blurs create legibility and rendering performance degradation on mobile webviews.

### 3. Transition System via CSS keyframes
- **Choice**: Use standard CSS `@keyframes` animations and CSS transitions in `globals.css` and wrap page clients with simple transition classes (`animate-slide-in`) for the fade-in + slide-up effect.
- **Alternative**: Introduce `framer-motion` npm dependency. Adding extra libraries is rejected to keep the JS bundle minimal.

## Risks / Trade-offs

- **[Risk]** Slow initial compilation or bundle size growth due to font loading.
  - *Mitigation*: Specify subsets `["latin"]` to only pack standard characters.
- **[Risk]** Backdrop blur lagging on older mobile viewports.
  - *Mitigation*: Restrict blur overlay size to sidebar/header panels only and fall back to solid background colors if blur is not supported.
