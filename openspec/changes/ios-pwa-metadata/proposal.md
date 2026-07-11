## Why

xpenses currently has zero PWA support — no manifest, no iOS home-screen meta tags, no touch icons, and no service worker. Users who pin the app to their iOS home screen get a bare Safari wrapper with no icon, no splash screen, no standalone-mode experience, and no offline fallback. This degrades the mobile experience for field workers (technicians, managers) who rely on the app on-site.

## What Changes

- Create `public/manifest.json` with required PWA fields (name, short_name, start_url, display, background_color, theme_color, icons)
- Add apple-touch-icon `<link>` tags in the root layout for multiple device sizes
- Add iOS-specific `<meta>` tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`)
- Add dual `theme-color` meta tags with `prefers-color-scheme` media queries for light/dark mode
- Add explicit `viewport` export in `layout.tsx`
- Create PWA icon set (180x180, 152x152, 192x192, 512x512) from the existing logo
- Generate missing `favicon.ico` (currently referenced by middleware but absent, causing 404s)
- Implement a minimal service worker with precaching for the app shell and network-first API strategy
- Register the service worker via a client-side component

## Capabilities

### New Capabilities
- `pwa-manifest`: Web app manifest with icons, theme colors, and PWA display settings
- `ios-pwa-metadata`: Apple-specific meta tags and touch icons for home-screen integration
- `pwa-service-worker`: Service worker registration with precache and offline support
- `pwa-icons`: Generated icon set at standard PWA resolutions

### Modified Capabilities

None.

## Impact

- **Frontend files modified**: `app/layout.tsx` (viewport export, head tags), `next.config.ts` (optional headers for sw.js cache control)
- **Frontend files created**: `public/manifest.json`, `public/favicon.ico`, `public/icons/*.png`, `public/sw.js`, `components/PwaRegistration.tsx`
- **No backend changes required**
- **No new npm dependencies** — Next.js 15 handles manifest linking natively; service worker is vanilla JS
