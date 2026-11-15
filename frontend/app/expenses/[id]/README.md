# Expense Detail Route (`frontend/app/expenses/[id]`)

## Overview
Next.js App Router client route (`/expenses/[id]`) displaying full expense details, currency/FX/tax metadata, raw OCR text, attached receipt thumbnails/downloads, and a lightbox viewer, with child route support for editing.

## Interface
- `[page.tsx:ExpenseDetailPage]` — Default-exported client route component accepting `{ params: Promise<{ id: string }> }` and rendering expense metadata, receipts, and `ReceiptLightbox` inside `AppShell`.
- `[page.tsx:lightboxImage]` — Modal state `{ url, title, onDownload }` controlling `ReceiptLightbox`.
- `[page.tsx:handleDownload]` — Async receipt download handler `(receiptId, originalName) => Promise<void>`.
- `[page.tsx:handleBack]` — Back-navigation handler returning to browser history or `/expenses`.
- Subdirectories:
  - `./edit`: [./edit/README.md](./edit/README.md) — Edit existing expense and immediate OCR review route (`/expenses/[id]/edit`).

## Invariants
- Draft-only edit link: link to `/expenses/${id}/edit` renders only when `expense && expense.status === "draft"` `[page.tsx:ExpenseDetailPage]`.
- Conditional metadata rendering: EUR equivalent and optional `fx_rate` render only when `expense.currency_original !== "EUR"`; `description`, `report_id` link, and `raw_ocr_text` require truthiness; tax row requires `expense.tax_amount > 0` `[page.tsx:ExpenseDetailPage]`.
- Receipt preview & download rules: `AuthorizedImage` thumbnail, row click-to-lightbox, and preview button are restricted to `r.original_name` matching `/\.(jpg|jpeg|png|webp)$/i`; `handleDownload` falls back to `receipt-${receiptId}.jpg` when `originalName` is falsy `[page.tsx:isImage, page.tsx:handleDownload]`.
- Error fallback: renders error/not-found view linking to `/expenses` when `!isLoading && (error || !expense)` `[page.tsx:ExpenseDetailPage]`.

## Side Effects
- Queries `GET /expenses/${id}` (`expenseKeys.detail(parseInt(id, 10))`) `[page.tsx:ExpenseDetailPage]`.
- Downloads receipt blobs via `downloadBlob(`/expenses/${id}/receipts/${receiptId}`, {}, filename)` and loads image previews from `${API_BASE_URL}/expenses/${id}/receipts/${r.id}` via `AuthorizedImage` `[page.tsx:handleDownload, page.tsx:ExpenseDetailPage]`.
- Navigates via `router.back()` / `router.push("/expenses")` and `<Link>` to `/expenses/${id}/edit`, `/expenses`, and `/reports/${expense.report_id}` `[page.tsx:handleBack, page.tsx:ExpenseDetailPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
