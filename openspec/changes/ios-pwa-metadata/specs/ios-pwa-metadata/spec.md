# iOS PWA Metadata

## Description

Apple-specific meta tags and touch icon links in the HTML `<head>` for proper iOS home-screen integration.

## Requirements

- **REQ-IOS-1**: Layout MUST include `<meta name="apple-mobile-web-app-capable" content="yes">` in `<head>`
- **REQ-IOS-2**: Layout MUST include `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- **REQ-IOS-3**: Layout MUST include `<meta name="apple-mobile-web-app-title" content="xpenses">`
- **REQ-IOS-4**: Layout MUST include `<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180x180.png">`
- **REQ-IOS-5**: Layout MUST include `<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152x152.png">`
- **REQ-IOS-6**: Layout MUST include `<link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-icon-120x120.png">`
- **REQ-IOS-7**: Layout MUST include `<link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167x167.png">`
- **REQ-IOS-8**: Layout MUST have explicit `viewport` export with `width: device-width, initialScale: 1`
- **REQ-IOS-9**: Layout MUST include dual `theme-color` meta tags:
  - `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8fafc">`
  - `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f172a">`

## Acceptance Criteria

- Tapping "Add to Home Screen" on iOS Safari opens the app in standalone mode (no Safari chrome)
- Home screen icon displays the app icon at correct resolution per device
- Status bar is transparent/overlaid on app content
- Browser chrome color changes with system dark/light mode
