# Admin Receipts Cleanup Route (`frontend/app/admin/receipts`)

## Overview
Next.js App Router client route (`/admin/receipts`) enabling moderators to scan for and delete orphaned receipt files on storage.

## Interface
- `[page.tsx:ReceiptsCleanupPage]` — Default-exported client route component rendering orphan receipt scan and cleanup controls inside `AppShell`.

## Invariants
- Role and auth guard: redirects unauthenticated or non-`mod` users when `!loading`, renders a loading spinner while `loading` is `true`, and returns `null` when `!user || user.role !== "mod"` `[page.tsx:ReceiptsCleanupPage]`.
- Action mutual exclusion: both scan and clean buttons are disabled whenever `scanMutation.isPending || cleanMutation.isPending` `[page.tsx:ReceiptsCleanupPage]`.
- Clean confirmation guard: the clean button renders only when `scanned && orphans.length > 0` and opens `showConfirmClean` modal confirmation before `cleanMutation.mutate()` can run `[page.tsx:ReceiptsCleanupPage]`.
- Response contracts: `scanMutation` expects `res.data.orphans` (`string[]`) and `cleanMutation` expects `res.data.cleaned_count` (`number`) `[page.tsx:scanMutation, page.tsx:cleanMutation]`.

## Side Effects
- `POST /settings/receipts/scan` via `scanMutation`; updates `orphans`, `scanned`, `errorMsg`, and `successMsg` state `[page.tsx:scanMutation]`.
- `POST /settings/receipts/clean` via `cleanMutation` (deletes orphaned receipt files on the server); clears `orphans` and updates `successMsg`/`errorMsg` `[page.tsx:cleanMutation]`.
- Client-side redirect via `router.replace("/dashboard")` when `!loading && (!user || user.role !== "mod")` `[page.tsx:ReceiptsCleanupPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
