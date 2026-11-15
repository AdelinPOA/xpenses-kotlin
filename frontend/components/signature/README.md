# Signature Components

## Overview
HTML5 canvas signature capture widget supporting mouse and touch drawing, HiDPI scaling across window resizes, and normalized dark-ink PNG export.

## Interface
- `[SignaturePad.tsx:"use client"]` — Next.js client component module.
- `[SignaturePad.tsx:SignaturePad]` — Default-exported React component accepting `SignaturePadProps`: `{ onSave: (dataUrl: string) => void; width?: number; height?: number }` (defaults `height = 200`; `width` is declared on `SignaturePadProps` but unused in destructuring).
- `[SignaturePad.tsx:SignaturePadProps]` — Internal props interface `{ onSave: (dataUrl: string) => void; width?: number; height?: number }`.
- `[SignaturePad.tsx:useTranslations]` — Consumes `next-intl` `"profile"` namespace keys `"signature_pad_clear"` and `"signature_pad_save"`.

## Invariants
- `[SignaturePad.tsx:resize]` Canvas backing store size is `Math.floor(Math.max(1, Math.floor(rect.width)) * dpr)` by `Math.floor(height * dpr)` with `dpr = window.devicePixelRatio || 1`, and `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` maps drawing coordinates to CSS pixels.
- `[SignaturePad.tsx:isEmptyRef]` `isEmptyRef` mirrors `isEmpty` state (initially `true`, `false` in `draw`, `true` in `handleClear`) so resize snapshots strokes without re-subscribing the resize listener.
- `[SignaturePad.tsx:resize]` Existing strokes are preserved across resize via an offscreen snapshot canvas only when `canvas.width > 0 && canvas.height > 0 && !isEmptyRef.current`.
- `[SignaturePad.tsx:draw]` Stroke segments are drawn only while `isDrawingRef.current` is `true` (set `true` in `startDrawing`, `false` in `stopDrawing`).
- `[SignaturePad.tsx:getContext]` Stroke style is fixed to `lineCap = "round"`, `lineJoin = "round"`, `lineWidth = 2`, and `strokeStyle = "#ffffff"` when `document.documentElement` has class `"dark"`, otherwise `"#1e293b"`.
- `[SignaturePad.tsx:handleClear]` Resets the context transform to identity inside `save`/`restore` before calling `clearRect(0, 0, canvas.width, canvas.height)` so the entire backing store is cleared even when `dpr < 1`.
- `[SignaturePad.tsx:handleSave]` Save button is disabled while `isEmpty` is `true` and `handleSave` returns early if `!canvas || isEmpty`.
- `[SignaturePad.tsx:handleSave]` Normalizes all pixels with `alpha > 0` on an offscreen canvas to RGB `(15, 23, 42)` (`#0f172a`) preserving alpha before calling `onSave(offscreen.toDataURL("image/png"))`, falling back to `canvas.toDataURL("image/png")` if the offscreen 2D context is unavailable or image data access throws.

## Side Effects
- `[SignaturePad.tsx:useEffect]` Registers and removes a `window` `"resize"` event listener keyed on `[height]`.
- `[SignaturePad.tsx:resize]` Mutates `canvas.width`, `canvas.height`, 2D context transform/style state, and creates a temporary offscreen `<canvas>` via `document.createElement("canvas")`.
- `[SignaturePad.tsx:handleTouchStart]` Calls `e.preventDefault()` when `e.cancelable` is `true` (likewise in `handleTouchMove` and `handleTouchEnd`).
- `[SignaturePad.tsx:handleSave]` Creates a temporary offscreen `<canvas>` via `document.createElement("canvas")` and invokes `onSave(dataUrl)` with an `"image/png"` data URL.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
