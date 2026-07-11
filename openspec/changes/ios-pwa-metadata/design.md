## Context

xpenses frontend (Next.js 15, App Router, Tailwind v4) has zero PWA infrastructure. The root layout (`app/layout.tsx`) currently exports `Metadata` with title/description only. `public/` contains only `logo.png`. No manifest, no service worker, no apple touch icons, no favicon. Frontend serves field technicians and managers who access the app from iOS Safari on-site.

## Goals / Non-Goals

**Goals:**
- Enable iOS "Add to Home Screen" with proper icon, name, and standalone mode
- Add web app manifest with correct fields for both iOS and Android
- Provide dual theme-color support matching existing dark/light mode
- Deploy a minimal service worker for app shell precaching and network-first API strategy
- Generate a complete icon set from the existing logo asset
- Fix the missing favicon.ico (referenced by middleware, currently 404)

**Non-Goals:**
- Full offline app (service worker is minimal — precache shell, network-first API)
- Background sync or push notifications
- Android-focused PWA install prompts (incidental benefit is fine)
- Splash screen customization (iOS generates from manifest icons)
- Build-time icon generation (icons are one-time generated and committed)

## Decisions

**1. Vanilla service worker over next-pwa / @serwist**
- `next-pwa` is unmaintained, `@serwist/next` adds complexity and bundling issues with Turbopack
- A vanilla `public/sw.js` is simpler, fully controllable, and avoids dependency churn
- Precaching is done by listing known routes; no build-time manifest injection needed

**2. Dual theme-color via `<meta>` tags with `media` attribute**
- Supports existing dark/light mode toggle without JS
- Light: `#f8fafc` (slate-50), Dark: `#0f172a` (slate-900)
- The manifest `theme_color` uses dark (the more prominent brand color)

**3. Icons generated one-time via script, committed to repo**
- Using `sharp` (already present in node_modules via Next.js) to resize `logo.png`
- Generated icons are static assets — no build step needed
- Maskable icons add padding for Android safe zone

**4. Service worker registration as a dedicated client component**
- `useEffect`-based `PwaRegistration.tsx` component
- Included only in the root layout on the client side
- Shows a toast (using existing ToastProvider) when a new SW is available

**5. No changes to `next.config.ts`**
- Next.js serves `public/` files at root automatically
- Cache-control for `sw.js` can be set via `_headers` file or Next.js headers config if needed, but default TTL is acceptable for initial launch

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Service worker caching stale API responses | Network-first strategy; SW is scoped to same origin, API calls go through network first |
| SW registration fails on older iOS (<16.4) | Registration is wrapped in try/catch, no user-facing error |
| Missing favicon.ico still 404 in some edge cases | Generated from logo.png at 32x32 ICO format |
| Users on slow connections see cached shell but no data | SW fetches fresh data — shell renders immediately, data loads asynchronously (existing behavior) |
| Icon quality: logo.png is 300x300 RGBA — upscaling to 512x512 may show artifacts | Acceptable for initial release; can be replaced with higher-res source later |
