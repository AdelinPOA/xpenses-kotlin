# Reports Components

## Overview
Slide-over drawer components for inspecting receipts attached to expense reports, including multi-expense navigation, multi-receipt switching, zoomed panning, and sanitized image/PDF previewing.

## Interface
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` — Default-exported client component (`"use client"`) accepting `Props`: `{ reportId: number | null; onClose: () => void }`.
- `[ReportReceiptsDrawer.tsx:Props]` — Internal component props interface `{ reportId: number | null; onClose: () => void }`.
- `[ReportReceiptsDrawer.tsx:ReceiptItem]` — Internal receipt descriptor `{ key: string; name: string; url: string; isImage: boolean; isPdf: boolean }` passed to `ReceiptPreview`.

## Invariants
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` Renders `null` when `reportId` is falsy (`!reportId`).
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` `useQuery<Report>` with `queryKey: reportKeys.detail(reportId!)` is gated by `enabled: !!reportId`.
- `[ReportReceiptsDrawer.tsx:receiptsByExpense]` Only expenses with at least one receipt (`items.length > 0`) are included in `receiptsByExpense` and `expensesWithReceipts`; receipt URLs are `${API_BASE_URL}/expenses/${exp.id}/receipts/${r.id}`, `isImage` matches `/\.(jpg|jpeg|png|webp)$/i`, and `isPdf` matches `/\.pdf$/i` against `r.file_path || r.original_name || ""`.
- `[ReportReceiptsDrawer.tsx:sanitizeUrl]` Blocks `javascript:`, `data:`, `file:`, and `vbscript:` protocols (returning `""`), preserves `blob:` URLs directly, and resolves other URLs against `window.location.origin` (returning `""` on parse error).
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` Zoom is clamped to `[1, 4]` in `0.25` steps; pointer drag (`handlePointerDown`) is ignored when `zoom <= 1`; `zoom` resets to `1` and `position` resets to `{ x: 0, y: 0 }` whenever `selectedExpense?.id` changes.
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` `selectedExpenseId` auto-selects `expensesWithReceipts[0]?.id ?? null` on `report?.id` change, falling back to `expensesWithReceipts[0] ?? null` if the selected expense is absent; `activeItem` falls back to `items[0] ?? null`.
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` Clicking the backdrop (`e.target === e.currentTarget`) or pressing `Escape` invokes `onClose`.

## Side Effects
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` Fetches `GET /reports/${reportId}` via `api.get` inside `@tanstack/react-query` `useQuery` when `reportId` is truthy.
- `[ReportReceiptsDrawer.tsx:useBodyScrollLock]` Calls `useBodyScrollLock(!!reportId)` to lock document body scrolling while the drawer is open.
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` Registers and cleans up a `window` `keydown` listener for `Escape` while `reportId` is truthy.
- `[ReportReceiptsDrawer.tsx:handlePointerDown]` Calls `e.currentTarget.setPointerCapture(e.pointerId)` when panning a zoomed receipt (`zoom > 1`).

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
