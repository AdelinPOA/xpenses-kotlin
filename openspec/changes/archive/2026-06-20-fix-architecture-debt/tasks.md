## 1. Soft delete for financial records

- [x] 1.1 Write Flyway migration adding `deleted BOOLEAN NOT NULL DEFAULT false` and `deleted_at TIMESTAMP NULL` to `expenses`, `expense_reports`, `receipts`
- [x] 1.2 Add `deleted`/`deletedAt` fields and `@SQLDelete` + `@SQLRestriction("deleted = false")` to `Expense`, `ExpenseReport`, `Receipt` in `Models.kt`
- [x] 1.3 Verify cascade/orphanRemoval children are soft-deleted (not physically removed) when a report is deleted
- [x] 1.4 Add an explicit audit/admin read path (native query) that bypasses the soft-delete restriction
- [x] 1.5 Confirm existing unique constraints tolerate retained soft-deleted rows; adjust migration if needed
- [x] 1.6 Tests: deleted record absent from list/get-by-id (404)/dashboard totals; row retained with `deleted_at`; audit path returns it

## 2. Report state machine → ReportService

- [x] 2.1 Add transition methods (submit, recall, approve, reject, pay) to `ReportService` with `@Transactional`, porting status guards and role checks from `ReportController`
- [x] 2.2 Define domain exceptions (or reuse `ResponseStatusException`) mapping invalid transition → 400, forbidden → 403, missing → 404
- [x] 2.3 Reduce `ReportController` transition endpoints to thin adapters (resolve user, call service, map DTO)
- [x] 2.4 Tests: unit tests for each transition + guard (self-approval, wrong source state, role) with mocked repositories, no MockMvc
- [x] 2.5 Confirm existing MockMvc state-machine integration tests still pass unchanged

## 3. Expense persistence → ExpenseService

- [x] 3.1 Create `ExpenseService` owning create/update/delete (FX conversion + persistence) within `@Transactional`
- [x] 3.2 Move direct `expenseRepository.save/delete` calls out of `ExpenseController` into the service; controller delegates
- [x] 3.3 Enforce "edit/delete only when draft" rule in the service
- [x] 3.4 Tests: create (201 + FX), edit-non-draft rejected (400), delete soft-deletes, with mocked repositories

## 4. Async receipt OCR

- [x] 4.1 Configure a dedicated bounded `ThreadPoolTaskExecutor` (core/max/queue + rejection policy) separate from Tomcat
- [x] 4.2 Add OCR job persistence (status: processing/completed/failed) — decide dedicated `ocr_jobs` table vs reuse; add Flyway migration if new table
- [x] 4.3 Change scan endpoint in `OcrController` to persist job, submit `@Async` OCR work, return `202` + job id/status URL
- [x] 4.4 Add status endpoint returning processing/completed(result)/failed(error)
- [x] 4.5 Ensure OCR failures are caught, logged, and recorded as `failed` job state
- [x] 4.6 (Optional) Add a synchronous-fallback feature flag for transition safety
- [x] 4.7 Tests: scan returns 202 quickly; poll pending→processing, success→completed+result, error→failed; HTTP threads unaffected under enqueue load

## 5. Frontend RSC initial data

- [x] 5.1 Add a server-side fetch helper that forwards the `access_token` cookie (via `next/headers`) to `INTERNAL_API_URL`
- [x] 5.2 Convert `dashboard/page.tsx` to fetch initial data in a server component and wrap the client UI in a `HydrationBoundary` (dehydrated query cache, matching query keys)
- [x] 5.3 Convert `expenses/page.tsx` the same way (server fetch expenses + categories, hydrate)
- [x] 5.4 Verify client `useQuery` adopts hydrated data with no duplicate initial fetch; filters/mutations still work
- [x] 5.5 Update the OCR client to submit-then-poll against the new `202`/status endpoints
- [x] 5.6 Test authenticated render (data in server HTML) and unauthenticated path (graceful redirect/empty)

## 6. Integration & rollout

- [x] 6.1 `make build` + targeted `./gradlew test` (run on JDK 21 toolchain) green
- [x] 6.2 `make test-health` + manual smoke of expenses list, report approve/pay, OCR scan+poll, delete-then-list
- [x] 6.3 Update `HANDOFF.md` and `README.md`; commit on a `fix/architecture-debt` branch and open PR
