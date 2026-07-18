## MODIFIED Requirements

### Requirement: REQ-IOS-2 Status bar style
The layout SHALL set `apple-mobile-web-app-status-bar-style` to `black-translucent` AND the viewport SHALL include `viewport-fit=cover` so the web view extends under the status bar, enabling the translucent overlay to render over app content rather than as a solid band.

#### Scenario: Status bar overlays content in standalone mode
- **WHEN** the app is launched from the iOS home screen (standalone mode)
- **THEN** the status bar is translucent and app content renders behind it, with the top chrome offset by `env(safe-area-inset-top)` so no interactive element is hidden

#### Scenario: Non-iOS / no-inset devices unaffected
- **WHEN** the app runs on a device without display insets (desktop, non-notched Android)
- **THEN** `env(safe-area-inset-top)` resolves to `0` and the layout is unchanged

### Requirement: REQ-IOS-8 Viewport export
The layout SHALL export an explicit `viewport: Viewport` with `width: "device-width"`, `initialScale: 1`, and `viewportFit: "cover"`.

#### Scenario: Generated viewport meta tag
- **WHEN** the root layout is rendered
- **THEN** the HTML `<head>` contains `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`

## ADDED Requirements

### Requirement: Safe-area inset padding
The app shell SHALL apply `env(safe-area-inset-top)` as top padding (and the corresponding bottom/left/right insets) so content is never obscured by the status bar or home indicator when `viewport-fit=cover` is active.

#### Scenario: Header not hidden under status bar
- **WHEN** the app runs in iOS standalone mode with `viewport-fit=cover`
- **THEN** the topmost header/navigation element is fully visible below the status bar

#### Scenario: Desktop rendering unchanged
- **WHEN** the app runs in a desktop browser
- **THEN** no extra top padding is added beyond the existing layout (insets resolve to 0)
