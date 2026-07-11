## 1. Generate Icon Set

- [ ] 1.1 Create `public/icons/` directory
- [ ] 1.2 Generate icon PNGs at all required sizes from `public/logo.png` using sharp
- [ ] 1.3 Generate `public/favicon.ico` (32x32 ICO)
- [ ] 1.4 Verify all icon files exist with correct dimensions

## 2. Create PWA Manifest

- [ ] 2.1 Create `public/manifest.json` with name, short_name, start_url, display, theme_color, background_color
- [ ] 2.2 Add icon entries for 192x192, 512x512, and maskable variants

## 3. Update Root Layout with Metadata

- [ ] 3.1 Add `export const viewport: Viewport` with width, initialScale, themeColor
- [ ] 3.2 Add `<link rel="manifest">` to `<head>`
- [ ] 3.3 Add iOS meta tags (apple-mobile-web-app-capable, status-bar-style, title)
- [ ] 3.4 Add apple-touch-icon `<link>` tags for all 4 sizes
- [ ] 3.5 Add dual theme-color meta tags with prefers-color-scheme media queries
- [ ] 3.6 Add `<link rel="icon">` for favicon.ico

## 4. Implement Service Worker

- [ ] 4.1 Create `public/sw.js` with versioned cache name
- [ ] 4.2 Implement `install` event with app shell precaching
- [ ] 4.3 Implement `activate` event with old cache cleanup
- [ ] 4.4 Implement `fetch` event with network-first and cache-first strategies

## 5. Create Registration Component

- [ ] 5.1 Create `components/PwaRegistration.tsx` client component
- [ ] 5.2 Implement SW registration with update detection
- [ ] 5.3 Wire toast notification for SW updates

## 6. Wire Registration into Layout

- [ ] 6.1 Import and render `<PwaRegistration />` in root layout (client-side only)

## 7. Verify

- [ ] 7.1 Run TypeScript check: `npx tsc --noEmit`
- [ ] 7.2 Run production build: `npm run build`
