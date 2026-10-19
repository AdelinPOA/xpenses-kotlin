# P2 save-correctness review

Base: `22bb07213ebba1f34560267f66c655eb531c793a`, scoped working-tree P2 changes only. Unrelated dirty documentation/offline assets, AuthProvider, proxy and Expense list changes are excluded from the P2 release.

## Standards

No documented-standard violations or standards-based release blockers. Two nonblocking heuristics remain: repeated per-row state updates in BulkReviewDrawer and untyped idempotency source manifest maps. These are maintainability suggestions, not correctness findings.

## Spec and correctness

The narrow P2 scope is backend keyed Expense/Receipt idempotency, truthful bulk save recovery, accepted OCR job observation across navigation, controlled terminal-source retention and requested-Advance field separation. This is not completion of all mobile UX acceptance in #46/#48/#49.

Two blocking bulk findings were reproduced and corrected:

1. Empty text/category values could receive HTTP success without being persisted, yet display Saved. Text clearing now sends empty strings; category clearing uses additive `clear_category=true`. Omitted/null category fields preserve legacy no-change behavior; contradictory selection/clearing returns 400 before mutation. The UI reconciles actual response values while retaining newer edits.
2. Reverting input after an uncertain PATCH outcome could make dirty comparison false and permit closing with unresolved server state. Per-field uncertainty now persists independently of dirty comparison, blocks completion/close/unload, and causes retry to resend current values until acknowledged.

Re-review found no remaining blocker in these fixes or the reviewed P2 implementation. Save guarantees require stable keys and identical payload/Receipt manifests; unkeyed historical attempts are not retroactively deduplicated.

## Executed verification

- Backend: 54 targeted tests passed, zero failures/errors/skips: ExpenseIdempotencyTest (12), BulkExpenseControllerTest (4), ExpenseControllerTest (12), AdvanceControllerTest (11), OcrSourceCleanupServiceTest (12), OcrControllerSourceStorageTest (1), AsyncOcrTest (2). Gradle used one worker, in-process Kotlin compilation, `--no-daemon` and a 1400 MiB heap. Testcontainers database and temporary storage were isolated from production.
- Frontend: typecheck passed; i18n parity passed for 1111 keys; 33 handler/storage-seam tests passed across the six P2 Node test files.
- Browser: 16 bulk review tests passed on mobile Chromium and WebKit with one worker, including explicit clearing, lost-response/reversion recovery and 375/390px control sizing. API mutations were intercepted; server-side prefetch targeted an unused local port. Service workers were blocked.
- Scoped active diagnostics and diff whitespace checks passed. No production write was used as a regression test.

## Release qualifications

OCR acceptance response loss still needs owner-scoped backend idempotency/lookup; unknown acceptance is retained and paused, not blindly uploaded again. Full verification/corrections/confirmation UX, owner retry/manual completion, service-worker cold-start/device acceptance and EN/RO light/dark screenshot evidence remain outside this release. Retention unit tests mock repository candidate SQL/locking; external OCR/S3 behavior is not established by this test run.

Deploy from a clean committed archive, not the dirty checkout. Preserve exact prior image IDs for rollback and back up PostgreSQL plus uploaded files before enabling terminal-source deletion. V104 is additive and may remain if application images are rolled back; never restore a database over newer live writes merely to roll back application code.
