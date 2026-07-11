# PWA Icons

## Description

Icon files at standard PWA and Apple touch-icon resolutions, generated one-time from `public/logo.png` and committed to the repo.

## Requirements

- **REQ-ICO-1**: All icon files MUST reside in `public/icons/`
- **REQ-ICO-2**: Required sizes (generated from `public/logo.png` 300x300 source):
  - `public/icons/icon-192x192.png` — 192x192 PNG
  - `public/icons/icon-512x512.png` — 512x512 PNG
  - `public/icons/icon-192x192-maskable.png` — 192x192 PNG with padding for safe zone
  - `public/icons/icon-512x512-maskable.png` — 512x512 PNG with padding for safe zone
  - `public/icons/apple-touch-icon-180x180.png` — 180x180 PNG
  - `public/icons/apple-touch-icon-152x152.png` — 152x152 PNG
  - `public/icons/apple-touch-icon-120x120.png` — 120x120 PNG
  - `public/icons/apple-touch-icon-167x167.png` — 167x167 PNG
- **REQ-ICO-3**: `favicon.ico` MUST be at `public/favicon.ico` (32x32 multi-size ICO)
- **REQ-ICO-4**: Icons SHOULD preserve the original logo's aspect ratio and visual content
- **REQ-ICO-5**: Maskable icons SHOULD include padding (~10% on each side) so the icon content fits within the safe zone

## Acceptance Criteria

- All icon files exist in `public/icons/` with correct dimensions
- `public/favicon.ico` exists and resolves without 404
- Apple touch icons render correctly when inspecting `<head>` in Safari DevTools
- Lighthouse PWA audit passes icon size checks
