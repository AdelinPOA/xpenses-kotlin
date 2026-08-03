# Concerns and Technical Debt

**Analysis Date:** 2026-08-03

## High-Impact Risks

- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/RateLimitingFilter.kt` trusts forwarded IP headers and retains request timestamps without pruning; proxy configuration and memory growth need verification.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/report/lifecycle/ReportLifecycleNotificationAdapter.kt` may bypass Spring `@Async` proxying through self-invocation, keeping email work on request threads.
- `controllers/InsuranceController.kt` serves client-influenced content types; verify magic-byte validation, attachment headers, and `nosniff` behavior to prevent stored XSS.
- `services/OcrService.kt` and `services/FxService.kt` perform external work while transactions/advisory locks may remain open, risking connection-pool exhaustion.
- `frontend/components/expenses/BulkUploadZone.tsx` and `BulkReviewDrawer.tsx` have known drag-overlay and error-reporting failure modes documented in `todo.md`.

## Domain and Data Risks

- Manual FX rates require strict positive validation in `services/FxService.kt` and expense DTO/service paths.
- FX fallback results may be cached against the requested date rather than the actual source date; preserve frozen historical rates and verify cache semantics against the ADR.
- Optimistic locking and concurrent report attachment need explicit conflict tests in `report/lifecycle/ExpenseReportLifecycle.kt`.
- File uploads are stored before all work commits in `services/ExpenseService.kt`, which can orphan files on partial failure.

## Performance Risks

- Lazy receipt/report relationships can create N+1 queries in `services/mapper/ExpenseMapper.kt`, `ReportMapper.kt`, and list controllers.
- Several list/search/dashboard paths are described as unbounded in `todo.md`; validate page/size limits and SQL aggregation before scaling data.
- OCR scan and PDF generation can consume long-lived HTTP threads or large memory buffers.

## Security and Operations

- Local storage path containment, unsupported storage-provider fallback, S3 client lifecycle, and migration recovery need hardening in `services/storage/`.
- Multipart size failures should map to 413 before large content is buffered.
- CSV export must neutralize formula prefixes; email import needs message-id deduplication and sender validation.
- The working tree contains user changes and untracked project/planning material; review the intended diff before committing future fixes.

## Source of Truth

`todo.md` contains the detailed reviewed backlog, including fixed/partial/verify markers. Treat it as a triage input, not proof that every item is currently reproducible. The FX policy and historical-rate requirements are in `docs/adr/0001-bnr-fx-rates-with-margin.md`.

*Mapped from current repository state on 2026-08-03.*
