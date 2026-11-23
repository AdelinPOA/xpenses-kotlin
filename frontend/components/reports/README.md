# Reports Components

## Overview
Components for expense reports, including weekly-grouped mileage trip lists with copy/paste actions and slide-over drawers for inspecting receipts attached to expense reports (multi-expense navigation, multi-receipt switching, zoomed panning, and sanitized image/PDF previewing).

## Interface
- `[MileageTripModal.tsx:MileageTripModal]` — Default-exported client component (`"use client"`) providing a unified create/edit responsive modal (`MileageTripModalProps`: `mode`, `initialDateKey?`, `trip?`, `vehicles`, `vehiclesLoading`, `vehiclesError`, `isPending`, `onClose`, `onCreate`, `onUpdate`) with duration-preserving `start_time` auto-shift, 3-state vehicle snapshot selector, dirty-dismiss confirmation, pending-save dismiss lock, and localized inline error alerts.
- `[MileageWeeklyList.tsx:MileageWeeklyList]` — Default-exported client component (`"use client"`) rendering weekly-grouped mileage trips with mobile day cards, desktop table/empty-week rows, sticky trip clipboard bar, shared `TripRowActions` (Edit / Copy / Delete), and grand total card; accepts `MileageWeeklyListProps` (`weeks`, `totalRecords`, `totalKm`, `totalDuration`, `totalGross`, `totalNet`, `canEdit`, `locale`, `copiedTrip`, `pastingDates`, `mutatingDisabled`, `highlightedTripId`, `collapsedWeeks`, `pasteNotice`, `pasteError`, `onToggleWeek`, `onEditTrip`, `onCopyTrip`, `onClearClipboard`, `onPasteToDates`, `onAddForDay`, `onDeleteTrip`, `onAddPreviousWeek`, `onAddNextWeek`).
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
- `[MileageTripModal.tsx:MileageTripModal]`: Blocks backdrop/close/Escape dismissal while `isPending`, prompts `window.confirm(t("guard_unsaved_changes"))` on dirty close, excludes drifted `trip.vehicle_id` from active dropdown options, preserves `keep_snapshot` while vehicles are loading/errored, and maps errors in `timeout -> 409 -> 429 -> detail -> fallback` order.
- `[MileageWeeklyList.tsx:MileageWeeklyList]`: Mutation and clipboard controls (sticky clipboard bar, prev/next week buttons, Mon–Fri workday bulk paste, per-day `DayActionControls`, per-trip `TripRowActions` Edit/Copy/Delete buttons, and desktop Actions column, keeping `desktopColCount = canEdit ? 10 : 9`) render only when `canEdit` is `true`.
- `[MileageWeeklyList.tsx:MileageWeeklyList]`: Workday bulk paste button is disabled while `workdayTargets.some((dateKey) => pastingDates.has(dateKey))`; per-trip edit/delete buttons are disabled while `mutatingDisabled` is `true`; per-day Paste button (`DayActionControls`) renders only when `hasCopiedTrip` is `true` and is disabled while `isPasting` is `true`; distance values format via `formatDistanceKm`.
- `[MileageWeeklyList.tsx:MileageWeeklyList]`: Renders `mileage_no_records` empty state when `weeks.length === 0`, Grand Total card only when `totalRecords > 0`, and formats monetary totals in `"EUR"` and fuel price in `"RON/L"` when `fuel_cost_eur != null`.

## Side Effects
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` Fetches `GET /reports/${reportId}` via `api.get` inside `@tanstack/react-query` `useQuery` when `reportId` is truthy.
- `[ReportReceiptsDrawer.tsx:useBodyScrollLock]` Calls `useBodyScrollLock(!!reportId)` to lock document body scrolling while the drawer is open.
- `[ReportReceiptsDrawer.tsx:ReportReceiptsDrawer]` Registers and cleans up a `window` `keydown` listener for `Escape` while `reportId` is truthy.
- `[ReportReceiptsDrawer.tsx:handlePointerDown]` Calls `e.currentTarget.setPointerCapture(e.pointerId)` when panning a zoomed receipt (`zoom > 1`).

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
