# OCR accepted-job resume and source retention (P2 prerequisite)

Scope: a narrow correctness prerequisite for #46/#49, **not completion of either issue**. This does not introduce Technician verification/confirmation state, immediate-review navigation, offline corrections, a manual fallback API or an owner job-retry API. ADR 0004's background durable pipeline and authoritative Expense/Receipt IDs remain unchanged; its navigation choice still needs reconciliation in #46.

## Implemented client contract

| State | Durable evidence | Resume / navigation |
| --- | --- | --- |
| Local source | `xpenses-ocr-sources.pending_sources`, owner-scoped image + stable source ID | May upload when online; bounded 20 sources / 100 MiB; browser eviction/quota remain limitations. |
| Upload intent / uncertain response | Commit `uploadState=uploading` before POST; network/timeout/5xx without an ID retains uncertainty | Reload/navigation never blindly re-uploads. Show uncertainty and inspection of existing Expenses; backend acceptance lookup/idempotency is still required. |
| Definitive pre-acceptance rejection | Persist `uploadState=rejected` | Visible failure, explicit retry or local discard. Reload does not automatically re-upload. |
| Upload accepted | `/ocr/scan` returns 202 + positive integer `job_id`; `acknowledgeOcrSource` commits `remoteJobId` before polling | `captureReceipt({resumeJobId})` polls `/ocr/status/{id}`, never calls create or uploads again. |
| Reading / promotion | Same job ID; backend owns OCR → EXPENSE → RECEIPT | Unmount/logout aborts observation only, **never DELETEs** the accepted job. Local claim released after acceptance persistence settles. |
| Transient network error | Source + accepted ID retained | Automatic resume on online/visibility/15-second claim recovery; a 10-second heartbeat renews the local 30-second lease. |
| Timeout / terminal job failure | Source + accepted ID retained, visible error | Explicit Retry re-observes the same job; it does not restart a failed backend job or create a replacement Expense. Further owner recovery/manual completion is a prerequisite for full #49. |
| Completed | Status response carries authoritative Expense AND Receipt IDs | Only now remove the local source. Return these IDs; no independent client creation/attachment. |
| Account change | Queue remains owner-scoped | Keyed capture session remount drops prior owner's thumbnails and aborts observation; never deletes accepted background work. |

`AbortSignal` now consistently means stop observation, including legacy `ocrScan.ts` compatibility exports. It is not a destructive cancel API. The capture feed offers local discard before upload or after a definitive pre-acceptance rejection; accepted or ambiguously accepted work is retained. A received acceptance ID is retained in owner-scoped session memory before its fallible IndexedDB commit. Retry first acknowledges that same ID and then observes it, never uploading a replacement.

### Explicit limitations

- A lost 202 response, crash between response arrival and IndexedDB commit, or browser quota/eviction during acceptance can leave a server job without a locally known ID. **This patch does not claim exactly-once OCR acceptance.** A stable owner-scoped request token and backend lookup/idempotency are still needed for that gap. Existing accepted sources with `remoteJobId` are safe to re-observe.
- The upload-intent marker prevents a second tab from blindly repeating a potentially accepted upload after a lease expires. Backend acceptance idempotency/lookup is still needed to resolve that uncertainty. If local acceptance persistence fails and the page closes, its memory-only ID is lost; the retained upload marker pauses rather than reposting.
- Accepted terminal and unknown/ambiguous source entries are retained, not automatically evicted. These can exhaust the bounded queue. Definitively rejected sources support explicit local discard; a future recovery screen must safely handle the remaining states.
- Existing non-job form/manual saves and their offline queue are not changed here. No financial status is repurposed as verification, and report-submission rules are untouched.

## Implemented backend retention contract

`OcrSourceCleanupService.cleanup` runs one bounded batch per interval, with these configuration defaults:

- `ocr.source.cleanup-enabled=true` (operator kill switch)
- `ocr.source.cleanup-interval=3600000` milliseconds
- `ocr.source.cleanup-batch-size=25` (clamped to 1–100)

Eligibility requires an existing source pointer, non-null `expires_at <= now`, no active lease, and a **terminal** state: COMPLETED, CANCELLED, PERMANENT_FAILURE, UNRECOVERABLE or EXPIRED. The existing upload expiry is 30 days. PENDING, PROCESSING, RETRY_WAIT and PAUSED are protected even after the nominal expiry; this job never expires recoverable work.

A process-local cyclic ID cursor advances after every bounded batch, including skipped/protected/erroring candidates, then wraps after an empty page. This prevents protected rows monopolizing every retention pass; restart resets the cursor without deleting anything. Each candidate is rechecked under a pessimistic row lock. Paths outside the direct `ocr-sources/` namespace, or shared by a Receipt, User signature or another OCR job, are protected. `StorageService.deleteOcrSource` rejects source-file/directory symlinks and propagates both remote and strict local deletion errors (unlike general best-effort deletion), so failure leaves the database source pointer available for retry. On success the source metadata is cleared, not the OcrJob/Expense/Receipt. Expired permanent failures become EXPIRED with `OCR_SOURCE_RETENTION_EXPIRED`; completed IDs and successful state are preserved. `/ocr/status` maps expired/cancelled terminal states to a polling failure rather than polling forever.

No schema migration/backfill is needed: `remoteJobId` is an additive IndexedDB record field, and backend retention uses existing V103 fields. Old clients ignore the extra field; old records without it retain their previous acceptance limitations. Disabling the cleanup configuration stops future retention passes; it cannot restore already expired source bytes.

## Verification

- `cd frontend && node --test tests/expenses/receipt-capture.test.cjs tests/expenses/ocr-source-queue.test.cjs tests/expenses/capture-resume-state.test.cjs`: acceptance-before-polling, resume without upload, abort without DELETE, failed local acceptance then retry without another POST, retained upload uncertainty, rejected-source discard, owner isolation, lease fencing, immutable known job ID.
- `OcrSourceCleanupServiceTest`: 12 tests passed in the targeted backend run, including expired failure cleanup, active/recoverable protection, shared paths, real local deletion failure, symlink protection and progress behind protected/erroring batches. Repository mocks do not prove production candidate SQL behavior or cross-process locks.
- Full #46/#49 still require the durable verification/corrections contract, backend owner retry/manual completion/lookup APIs, interrupted acceptance coverage, authenticated isolated integration and browser/device acceptance. No deployment or production mutation is part of this prerequisite.
