# Admin OCR Route (`frontend/app/admin/ocr`)

## Overview
Next.js App Router client route (`/admin/ocr`) allowing moderators to configure OCR model settings (`OcrModelSettings`) and inspect OCR vs. final expense field comparison history.

## Interface
- `[page.tsx:OcrAdminPage]` — Default-exported client route component rendering OCR model configuration and comparison history inside `AppShell`.
- `[page.tsx:getStatusColor]` — Internal helper `(ocrVal, finalVal) => string` computing CSS status classes for OCR-vs-final field comparisons.

## Invariants
- Role and auth guard: `useEffect` redirects when `!loading && (!user || user.role !== "mod")`, component returns `null` when `!user || user.role !== "mod"`, and `ocrKeys.config()`, `ocrKeys.comparison()`, and `categoryKeys.list()` queries set `enabled: user?.role === "mod"` `[page.tsx:OcrAdminPage]`.
- Render state guards: renders loading spinner while `loading` is `true`, skeleton while `isLoading` is `true`, `<OcrModelSettings initialConfig={data} />` only when `data` is truthy, comparison table only when `compData` is truthy, and empty-state text when `compData.history.length === 0` `[page.tsx:OcrAdminPage]`.
- History row classification: `isLinked` requires `row.final_amount !== null || row.final_date !== null || row.final_merchant !== null`; `isFailed` is truthy when `row.gemini_error || (row.gemini_amount === null && row.gemini_merchant === null)` `[page.tsx:OcrAdminPage]`.
- Field comparison matching: `getStatusColor` returns neutral styling for `null`, `undefined`, `""`, or `"None"`, and compares trimmed lowercased strings when both inputs are strings (otherwise `===`) `[page.tsx:getStatusColor]`.

## Side Effects
- Read queries (`useQuery`) when `user?.role === "mod"`: `getOcrConfig` (`ocrKeys.config()`, `staleTime: 300_000`, `gcTime: 600_000`), `getOcrComparisons` (`ocrKeys.comparison()`), and `api.get("/categories")` (`categoryKeys.list()`, `staleTime: 300_000`, `gcTime: 600_000`) `[page.tsx:OcrAdminPage]`.
- Navigation redirect via `router.replace("/dashboard")` for unauthenticated or non-`mod` users `[page.tsx:OcrAdminPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
