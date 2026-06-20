## Why

A staff-level architecture review (`readout-2.md`) surfaced four verified, high-impact debts that hurt scalability, testability, and compliance: business logic is tangled inside fat controllers (ReportController 41KB, ExpenseController 30KB) that call repositories directly; receipt OCR runs synchronously on Tomcat worker threads (200-thread pool exhaustion → cascading 503s under load); financial records are hard-deleted (no audit trail, fails financial-compliance expectations); and the Next.js 15 frontend ships every list page as a client SPA, fetching initial data after hydration and degrading Time-to-Interactive.

The previously reported N+1 query issue is **already fixed** (EntityGraph on the expense queries). The "String/Date implicit casting" finding is **excluded** — it rests on a false premise (`Expense.date` is a `varchar` column, not a temporal type, so no cast occurs).

## What Changes

- **Service-layer extraction:** Move the report state machine (submit/recall/approve/reject/pay) and expense persistence/business logic out of controllers into `ReportService` and `ExpenseService`. Controllers become thin HTTP adapters (request/response mapping + auth resolution only). `@Transactional` boundaries move to the service methods.
- **Async OCR:** Convert the synchronous receipt-scan endpoint to enqueue work on a bounded async executor and return `202 Accepted` with a job/status handle. Tomcat threads are no longer held during 5–10s OCR parses. Clients poll a status endpoint for the result. **BREAKING** for the OCR scan API response shape (now `202` + status URL instead of `200` + inline result).
- **Soft delete for financial records:** Introduce a `deleted` flag with Hibernate `@SQLDelete` + `@SQLRestriction` on `Expense`, `ExpenseReport`, and `Receipt`. Delete endpoints stop issuing physical `DELETE`s; rows are retained for audit. Requires a Flyway migration adding the column.
- **Frontend server-rendered initial data:** Migrate `dashboard` and `expenses` route entry points to fetch initial data in React Server Components (cookie-forwarded server fetch), hydrating TanStack Query so client interactivity is preserved without the post-mount waterfall.

## Capabilities

### New Capabilities
- `service-layer-architecture`: Business logic and transaction orchestration for reports and expenses live in dedicated services; controllers only adapt HTTP. Defines the report state-machine contract at the service boundary.
- `async-receipt-ocr`: Receipt OCR is processed asynchronously; the scan endpoint accepts work and returns a pollable job status instead of blocking.
- `financial-record-soft-delete`: Expenses, reports, and receipts are soft-deleted (retained, filtered from normal reads) to preserve audit history.
- `server-rendered-initial-data`: Dashboard and expense list pages fetch their initial data on the server (RSC) and hydrate the client cache.

### Modified Capabilities
<!-- None: existing specs (ocr-sidecar-service, controller-dtos) describe current behavior; new behavior is captured as new capabilities above to keep deltas clean. -->

## Impact

- **Backend code:** `controllers/ReportController.kt`, `controllers/ExpenseController.kt`, `controllers/OcrController.kt`; `services/ReportService.kt` (expanded), new `services/ExpenseService.kt`, `services/OcrService.kt` (async path); `models/Models.kt` (soft-delete annotations); new Flyway migration in `db/migration/`.
- **APIs:** OCR scan endpoint contract changes (202 + status endpoint). Delete endpoints unchanged in signature; behavior changes to soft delete. Repository reads transparently exclude soft-deleted rows.
- **Frontend:** `frontend/app/dashboard/page.tsx`, `frontend/app/expenses/page.tsx`, server-side fetch helper with cookie forwarding, TanStack Query hydration boundary.
- **Tests:** New service-level unit tests (state machine testable without MockMvc); OCR async/polling integration test; soft-delete repository tests.
- **Dependencies:** No new runtime libraries required (Spring `@Async` + executor; Hibernate annotations; Next.js native fetch). A message broker is explicitly out of scope.
