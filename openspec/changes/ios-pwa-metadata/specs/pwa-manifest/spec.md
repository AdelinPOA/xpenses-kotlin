# PWA Manifest

## Description

Web app manifest at `public/manifest.json` that enables PWA installation on iOS and Android.

## Requirements

- **REQ-MAN-1**: Manifest MUST be a valid JSON file at `public/manifest.json`
- **REQ-MAN-2**: MUST include `name`, `short_name`, `description`, `start_url`, `display`, `background_color`, `theme_color`, `icons`
- **REQ-MAN-3**: `display` MUST be `standalone` for full-screen experience
- **REQ-MAN-4**: `start_url` MUST be `/`
- **REQ-MAN-5**: `icons` array MUST include 192x192 and 512x512 PNG entries
- **REQ-MAN-6**: `icons` array MUST include separate maskable entries with `"purpose": "maskable"` for both 192x192 and 512x512
- **REQ-MAN-7**: `theme_color` MUST be `#0f172a` (slate-900, matching dark theme)
- **REQ-MAN-8**: `background_color` MUST be `#f8fafc` (slate-50)
- **REQ-MAN-9**: Manifest MUST be linked from the root layout `<head>` via `<link rel="manifest" href="/manifest.json">`

## Acceptance Criteria

- Navigating to `/manifest.json` returns valid JSON with all required fields
- Lighthouse PWA audit passes the "Web app manifest meets installability requirements" check
- iOS "Add to Home Screen" uses the manifest's icon and name
