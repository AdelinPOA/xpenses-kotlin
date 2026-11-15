# Profile Signature Route (`frontend/app/profile/signature`)

## Overview
Next.js App Router client route (`/profile/signature`) allowing the authenticated user to view, draw/upload, and delete their personal signature image.

## Interface
- `[page.tsx:SignaturePage]` — Default-exported client route component managing signature retrieval, upload, deletion, and feedback banners inside `AppShell`.
- `[page.tsx:SignaturePad]` — Dynamically imported client-only (`ssr: false`) signature canvas component invoked with `onSave={(dataUrl) => saveMutation.mutate(dataUrl)}`.

## Invariants
- Client-only canvas: `SignaturePad` is loaded with `ssr: false` `[page.tsx:SignaturePad]`.
- Signature presence & retry guard: `signatureQuery` disables retries (`retry: false`), and `hasSignature` (`signatureQuery.isSuccess`) gates rendering of the existing signature card and toggles heading text between `draw_new` and `draw_heading` `[page.tsx:SignaturePage]`.
- Delete concurrency & feedback timer: delete button is disabled while `deleteMutation.isPending` is `true`; feedback messages auto-clear after `3000ms` via `showMessage`, clearing any prior timeout and cleaning up on unmount `[page.tsx:SignaturePage]`.

## Side Effects
- `GET /users/me/signature` (`signatureQuery`), `PUT /users/me/signature` (`saveMutation`), and `DELETE /users/me/signature` (`deleteMutation`), invalidating `["signature"]` and bumping `cacheBuster` (`Date.now()`) on mutation success `[page.tsx:SignaturePage]`.
- Renders `<img src="${API_BASE_URL}/users/me/signature?${cacheBuster}">` when `hasSignature` is `true` `[page.tsx:SignaturePage]`.
- Manages DOM timers (`setTimeout`/`clearTimeout`) via `messageTimeoutRef` and provides `<Link href="/dashboard">` navigation `[page.tsx:SignaturePage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
