# Spec: signature-capture

## ADDED Requirements

### Requirement: Signature drawing does not scroll the page
The signature canvas SHALL set `touch-action: none` (Tailwind `touch-none`) so touch drawing works on iOS, where React's passive touch listeners ignore `preventDefault()`.

#### Scenario: Signing on iPhone
- **WHEN** a user draws a signature with a finger on an iPhone
- **THEN** the stroke renders on the canvas and the page does not scroll

#### Scenario: Mouse signing still works
- **WHEN** a user draws with a mouse on desktop
- **THEN** the signature renders exactly as before

### Requirement: Drawing surfaces use pointer-compatible gestures
Interactive drag surfaces implemented for touch devices SHALL use Pointer Events (`onPointerDown/Move/Up`) rather than mouse-only events.

#### Scenario: Touch pan on zoomed receipt
- **WHEN** a user zooms a receipt image in the expense form and drags with a finger
- **THEN** the image pans with the finger
