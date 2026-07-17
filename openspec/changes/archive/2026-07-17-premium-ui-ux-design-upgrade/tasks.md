## 1. Setup & Assets

- [x] 1.1 Load "Outfit" and "Inter" fonts via `next/font/google` in `frontend/app/layout.tsx` and register custom fonts in body classes.
- [x] 1.2 Add theme font settings, keyframes, page slide animations, and transition utilities to `frontend/app/globals.css`.

## 2. Layout & Component Styling

- [x] 2.1 Re-style the desktop Sidebar (`frontend/components/layout/Sidebar.tsx`) to apply glassmorphism and the active navigation Violet/Indigo gradient indicator.
- [x] 2.2 Re-style the mobile header in `frontend/components/layout/AppShell.tsx` to add glassmorphic translucency and blur.
- [x] 2.3 Apply rounded-2xl layout styles, thin borders, soft shadows, and hover scale transitions to content card containers in Dashboard, Expenses, and Reports client pages.

## 3. Charts & Page Animations

- [x] 3.1 Re-style the dashboard charts in `DashboardClient.tsx` to render glowing curved lines and gradient fills under the data lines.
- [x] 3.2 Integrate page-level entry fade-in and vertical slide-up CSS transition class inside the main content view wrapper.

## 4. Verification & Testing

- [x] 4.1 Run the full Playwright E2E test suite to verify that all layout components, responsive segmented controls, and scoping flows are correct and regressions are avoided.
