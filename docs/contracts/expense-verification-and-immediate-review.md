# Expense owner verification and immediate review contract (#46)

**Status:** selected integration contract; not implemented by this document. The offline-confirmation decision was confirmed in #46: editing may be retained locally, but confirmation requires connectivity and server acknowledgement. Backend prerequisites are tracked by #61 and #62; #49 must remain blocked until both are closed.

This contract applies to the default, single-receipt capture flow. Any Expense owner may verify that Expense, regardless of role; this does not grant access to verify another User's Expense. It preserves the durable background `OcrJob`, the authoritative promoted Expense/Receipt IDs, existing manual-entry behavior, and the financial Expense lifecycle. It does not change bulk OCR, report submission rules, OCR-provider policy, or the global offline shell.

## ADR alignment

ADR 0004's original continuous-camera/batch-review decision remains the historical rationale for the durable staged OcrJob. The approved #45/#49 UX supersedes only that navigation default for single-receipt capture: the default is now capture → background processing → immediate per-Expense review/confirmation; a second capture is an explicit secondary action after server acknowledgement. Background processing, known-ID reuse, owner recovery, and the rule that leaving the page does not cancel accepted work remain in force. Bulk capture is unchanged. This is a design reconciliation, not an implementation or a claim that the deployed UI has changed.

## Current implementation evidence

Inspected current source, not the earlier line references in #46's initial note:

- `CaptureSession.processCapturedFile` calls `captureReceipt`, consumes the OcrJob's known Expense/Receipt IDs, and does **not** call a second client-side Expense create. The earlier note that the page calls `scanReceipt` then `saveNewExpense` is stale after P2.
- `frontend/lib/ocrSourceQueue.ts` durably stores an owner-scoped photo, client source ID, upload marker and accepted job ID (20 records / 100 MiB). It does not store review values, Expense version or confirmation state. The capture page removes this record as soon as promotion completes, before review.
- The source queue uses a stable client UUID locally, but `POST /api/ocr/scan` does not accept/use it for idempotent acceptance. Lost/unknown 202 acceptance cannot be resolved safely by a new upload.
- `GET /api/ocr/status/{jobId}` and `DELETE /api/ocr/jobs/{jobId}` exist; status and cancel enforce owner checks. There is no owner job list, owner retry or manual-completion action. The completed status response currently includes OCR `result_json`; new recovery responses must not expose it.
- `Expense` already has JPA `@Version`, but `ExpenseOut` omits the version and verification fields. `PATCH /api/expenses/{id}` has no expected-version contract and accepts edits only while financial status is `draft`. `ExpenseForm` rejects existing-Expense edits offline.
- V104 idempotency covers keyed Expense creation, Receipt attachment and bulk source identity—not OCR acceptance, Expense review edits or verification. The ordinary offline queue is for new Expense creation/Receipt upload and is removed after sync.

## Domain state and compatibility

Persist `Expense.verification_state` independently of `Expense.status`:

| Verification state | Meaning |
| --- | --- |
| `NOT_REQUIRED` | No explicit OCR-capture confirmation is required by this flow. |
| `PENDING` | A single-capture OCR Expense awaits its owning User's initial review. |
| `VERIFIED` | The owning User completed the initial OCR review and the server acknowledged it. This records that the first review happened; it does not assert that later-edited values still match the Receipt. |

Add `last_verified_at` and `last_verified_by_user_id` as the acknowledged initial-review metadata. Verification is one-time: later changes to Expense values or attached Receipts do not reset `VERIFIED` or clear that metadata. `Expense.version` remains the current concurrency token.

- New single-capture OcrJob promotion creates `PENDING`, including photo-only/manual completion of that captured source.
- Manual Expenses created through the existing manual-entry flow and bulk-upload Expenses remain `NOT_REQUIRED`; #49 does not add a new confirmation obligation to either flow.
- V105 backfills all existing Expenses to `NOT_REQUIRED`. Do not infer verification need from status, `raw_ocr_text`, `comparison_id`, merchant/amount completeness, or historical OcrJobs. Legacy OCR jobs remain quarantined under V103; no source bytes or verification state are fabricated.
- Verification never changes `Expense.status`, approves/rejects a Report, or gates Report submission. A `PENDING` Expense can remain pending at any financial status and must remain discoverable through a verification-state filter.
- Only the Expense owner may verify, regardless of the owner's role. Verification is available regardless of financial status because it changes neither the Report nor the financial lifecycle. Existing financial authorization/edit restrictions remain in force.
- The initial OCR review can be completed only while an Expense is `PENDING` with no prior `last_verified_at`. Once confirmed, later Expense edits and Receipt additions/deletions preserve `VERIFIED` and its initial-review metadata. The state does not claim those later values were reviewed. Report association/status changes do not affect verification.

## State transitions and truthful UI

| Stage | Durable evidence and transition | User-visible truth |
| --- | --- | --- |
| Photo/file captured | Commit bytes and owner/source metadata in IndexedDB before network work. A failed transaction means the image is not durably saved on this device. | Only after commit: “Saved on this device”. Never say “Expense saved”. |
| Offline or queued | Keep the same source UUID, image and optional report context. On reconnect, submit that source; do not create a new identity. | “Waiting for connection/OCR”. Confirmation is unavailable because no server Expense exists. |
| Upload acceptance unknown | Retry/lookup with the same owner-scoped key and exact fingerprint. Do not post a new key or claim a server draft. | “Upload status not confirmed”; preserve the photo and provide recovery. |
| OcrJob accepted/processing | Backend owns OCR → EXPENSE → RECEIPT; navigation, reload and logout stop observation only. The same job is resumed by ID/key. | “OCR processing”; not “verified”. The camera does not reset to another capture by default. |
| Transient/permanent failure | Transient failure retries the same stage. Permanent failure retains recoverable source for the agreed window and offers explicit retry or manual completion. | Explain OCR vs upload vs auth/quota/storage failures separately; keep known IDs and source. |
| Expense + Receipt promoted | OcrJob commits/reuses exactly one Expense and Receipt, sets `verification_state=PENDING`, and returns authoritative IDs. Client fetches `GET /api/expenses/{id}` before review; it never calls a second create/upload. | “Draft saved to your account — needs review” only after server promotion is acknowledged. This is not confirmation. |
| Review/edit | Persist each edit in the owner-scoped local review record before attempting sync. Online writes are version-checked and idempotent; offline edits remain local. | Server-saved only after a successful review-write response. Local-only edits say “Saved on this device — waiting to sync”. |
| Explicit confirmation | Enabled only online, after every edit is server-acknowledged and no save is uncertain. Confirmation is an idempotent, version-checked command. | Show “Verified” only after the server acknowledges the exact current version. A timeout/response loss stays “confirmation status unknown” and replays the same operation. |
| Interrupted review | On same-owner reload/navigation, restore local values and known IDs; if local state is absent, fetch the pending Expense/Receipt and job through owner-scoped APIs. | Return to the same Expense/review state; never restart OCR or create a replacement. |
| Confirmed | Remove local review/source bytes only after server verification acknowledgement; keep the Expense's Receipt and verification state on the server. | Main action returns to Expenses and highlights the Expense; secondary action starts the next capture only after confirmation. |
| Cancel/discard/expiry | Navigation is not cancellation. Local unaccepted sources can be explicitly discarded; accepted jobs use the owner action. Preserve known partial Expense IDs. Preserve the existing 30-day `expires_at` window measured from upload for active and terminal jobs; 90-day structured OcrJob metadata is separate. Cleanup remains disabled pending #60 provenance/recoverability evidence. | State what is being removed: local copy, OCR job, or Expense. Never imply that discarding local data cancelled/deleted accepted server work. |

## API and persistence contract

### OCR source acceptance and recovery (backend prerequisite #62)

- `POST /api/ocr/scan` accepts an `Idempotency-Key` equal to the persisted client source UUID. Scope uniqueness by authenticated owner and operation. Fingerprint file SHA-256, size, filename/content type, and optional `report_id`. Same key + same fingerprint returns the same OcrJob ID; same key + changed payload returns `409`. Persist the key/fingerprint with the durable job/source before returning `202`.
- Keep the header optional during rollout for old clients; unkeyed requests retain their documented at-least-once limitation. New clients always use it. A lost 202 can be safely replayed with the same key; it must not create a second OcrJob.
- Add owner-only `GET /api/ocr/jobs` and `GET /api/ocr/jobs/{id}` for recovery after local IndexedDB loss. Responses expose the #42 safe fields (job ID, stage/status, safe error code/message, retryability, allowed actions, expiry, known Expense/Receipt IDs and report-link result), never source bytes, raw result JSON, provider diagnostics or secrets. Preserve the existing polling response shape during the compatibility window; new recovery UI uses safe job data plus `GET /api/expenses/{id}` for authoritative fields.
- Add owner-only `POST /api/ocr/jobs/{id}/retry` and `POST /api/ocr/jobs/{id}/complete-manually`. Retry resumes the same persisted stage and job. Manual completion uses the accepted OCR source and known job identity, skips provider OCR, and reuses any existing Expense/Receipt IDs; it never creates a replacement after partial promotion. Repeated action keys/payloads are idempotent. Existing `DELETE /api/ocr/jobs/{id}` remains explicit cancel, not navigation cleanup.
- A captured flow's optional `report_id` is owner-validated as a draft at acceptance. Persist it on the OcrJob. If it is no longer attachable at promotion, preserve the Expense/Receipt as an unattached draft and return an explicit report-link conflict; do not silently attach elsewhere, delete the Expense, or block confirmation/report submission.

### Expense review and confirmation (backend prerequisite #61)

- V105 (owned by #61) adds `verification_state` (default/check constraint `NOT_REQUIRED`), nullable last-verification actor/time, the minimal review-operation idempotency ledger, and an index supporting owner + verification state. V106 (owned by #62, after V105) adds nullable owner-scoped OCR acceptance key/fingerprint and optional report context on OcrJob. Do not edit applied V103/V104 migrations.
- Extend `ExpenseOut` with `version`, `verification_state`, `last_verified_at`, and `last_verified_by_user_id`. Add `verification_state` to the existing paged/unpaged `GET /api/expenses` filters, across all financial statuses.
- Add `PUT /api/expenses/{id}/review` with body `{ expected_version, values, confirm }` and an `Idempotency-Key`. `values` are the allowed reviewable Expense fields with explicit category-clear semantics. In one transaction, the owner-scoped handler compares `expected_version`, applies allowed corrections, recomputes existing FX fields through current service logic, and—only if `confirm=true`—sets `VERIFIED` plus actor/time. The operation accepts only an outstanding initial review (`PENDING` with no prior verification timestamp) linked to a non-terminal OcrJob owned by the same User and associated with that Expense; a new operation cannot review an already verified or `NOT_REQUIRED` Expense. Replaying the original idempotency key remains safe after confirmation. `confirm=false` saves values but leaves the initial review pending. `confirm=true` requires at least one associated Receipt; an Expense promoted ahead of its Receipt cannot be verified in the gap. Confirmation and the values it confirms cannot race into separate versions. Applying edits continues to obey the existing financial edit restrictions.
- Same owner/key/body replay returns the current acknowledged state without reapplying; same key with a different fingerprint returns `409`. A stale expected version returns `409` with the current safe Expense snapshot and makes no mutation. Do not silently merge or overwrite: the client keeps its local values, shows a conflict, reloads the server version, and requires explicit reapplication.
- The review operation ledger stores owner, operation key, payload hash, Expense ID and resulting version—not receipt bytes, OCR text or a frozen sensitive response snapshot. Retain keys long enough to resolve retries; an expired key cannot bypass `expected_version`.
- Existing `PATCH /api/expenses/{id}` remains compatible for other clients and preserves `VERIFIED` and its initial-review metadata when values change. Receipt attach/delete paths likewise preserve verification. The initial OCR review UI uses the versioned review operation.
- `confirm=true` is rejected while offline or while local/server edits are pending/uncertain. The UI may retain edits locally, but it must not label them confirmed. If connectivity drops after sending, keep the same operation key and resolve the result before allowing another confirmation.

## Local retention, account scope, and offline behavior

- Extend the existing owner-scoped OCR IndexedDB record (additive DB version; preserve legacy records) with known Expense/Receipt IDs, last acknowledged server version, local review values, sync state and the current immutable operation key/body. Do not create a second generic workflow store or reuse the new-Expense queue for updates to an existing OCR Expense.
- Commit local review values before attempting network writes. Keep the same key/body while an operation outcome is uncertain; new edits wait until that outcome is resolved, then receive a new key. A confirmed response removes the local review record; the server's Expense, Receipt and verification state remain.
- Retain the existing 20-source / 100 MiB cap. Never silently evict an accepted job, unresolved review, uncertain write or unaccepted image to make room; reject new captures with actionable quota feedback. Browser eviction/private mode/device loss remain possible and must not be described as guaranteed durability. Storage-persistence prompts are best effort, not a guarantee. No `beforeunload` flush guarantee.
- Pending local records survive navigation, reload and logout, remain keyed by owner, and are restored only for the matching authenticated owner. Account switching revokes old object URLs/callbacks and never syncs an old owner's data under the new identity. Logout does not cancel accepted backend work or silently delete local data. A deliberate “clear local captures” action must explain whether it removes only local data or also explicitly requests owner-authorized backend cancellation.
- The server is the recovery source once a Receipt is committed. The local photo/review record is retained until confirmation acknowledgement, explicit clear, or the eligible 30-day local-photo expiry described below; the server may delete the OCR source after the final Receipt commit under #38/#43. Local photo bytes can be removed after 30 days only when the server Receipt/Expense is known and no unsynced edits/uncertain operation remain. Unaccepted or unsynced work is never silently expired by the application; explicit discard is required. Browser eviction remains an external limitation.
- If the app is offline at initial capture, OCR and server verification cannot complete. Store the source and any manual-completion values locally, label them device-local/queued, and resume the same source when online. A manual entry selected without an OCR source remains the existing manual flow and is `NOT_REQUIRED`.

## Failure, conflicts, and navigation rules

- **Definitive upload rejection:** preserve local source, show reason, allow correction/retry using the same source identity or explicit local discard.
- **Unknown upload acceptance:** replay/lookup with same key and fingerprint. Never generate a second source key automatically.
- **OCR/provider failure:** retry only by explicit action for permanent failure; transient retry uses existing stage/backoff. Manual completion uses the retained source and same OcrJob. No fake Expense/Receipt success.
- **Expense or Receipt promotion error:** resume the same OcrJob stage and known IDs; never call client create after a known server Expense ID.
- **PATCH/review 4xx:** retain attempted local values, show field/actionable error, and keep confirmation disabled. **409 stale version:** preserve values and show conflict. **5xx/network after request:** outcome uncertain; replay same key/body, do not mark saved/verified prematurely.
- **Auth/account change:** pause the old owner's queue; do not retry with current account credentials. Reauthenticate the owner to resume.
- **Repeated taps/tabs:** disable duplicate in-flight UI actions; backend operation key + expected version is authoritative. Stale tabs receive conflict and cannot overwrite newer data.
- **Report status changes:** no verification gate is introduced. If a report becomes non-draft during OCR, save the Expense/Receipt as an unattached draft with a visible link conflict. Verification does not submit/approve a Report.
- **Destination:** after server confirmation, return to Expenses and highlight the Expense even if current filters/sort/page would hide it. “Confirmă și scanează următorul” opens capture only after the same acknowledgement. Closing/navigation before confirmation leaves the Expense `PENDING` and resumable.

## Retention clarification

Approved 2026-10-19: preserve the existing 30-day OCR source expiry measured from upload for terminal recovery as well as active work. Do not reset the source expiry on terminal failure. This supersedes the earlier seven-day terminal wording; automatic cleanup remains disabled until #60 establishes source provenance and recoverability.

## Compatibility, rollout, and rollback

1. Additive V105 migration after V104 adds verification fields/ledger; V106 adds OCR acceptance/report-context metadata. All existing Expenses default `NOT_REQUIRED`; existing OcrJobs with no acceptance key remain unchanged, including V103 `UNRECOVERABLE` quarantine. No fabricated data or automatic historical verification.
2. Deploy backend support before the new frontend. New DTO fields are additive; old clients ignore them. Old clients without OCR idempotency keys retain at-least-once behavior. Old PATCH callers keep working, and edits to an already verified Expense preserve its one-time initial-review state.
3. Deploy the new client with a feature gate disabled until acceptance idempotency, recovery/manual completion, review CAS, owner isolation, migration rehearsal, and restart/failure tests pass. Rollback removes no columns/data; old clients continue using existing routes. If a new route is unavailable after rollback, keep local data and report “not synced”; never silently create a replacement.
4. Do not enable OCR-source cleanup merely because V105 or the new capture flow ships. Preserve the #60 production hold until source/backup provenance is established and separately approved.

## Verification plan pinned for #49/backend issues

Extend these existing suites and add the named cases before rollout:

- `OcrControllerSourceStorageTest`: `same acceptance key and fingerprint returns the existing OcrJob`; `same acceptance key with changed fingerprint returns 409`; acceptance persists the key before `202`.
- `OcrJobStateMachineTest`: retry/manual completion stays on the same stage and rejects stale leases; promotion retry reuses persisted Expense/Receipt IDs.
- New `OcrRecoveryControllerTest`: owner list/detail/actions, safe payload (no bytes/result JSON/provider diagnostics), cross-owner denial, repeated retry/manual-completion requests, and rejection of invalid manual categories.
- `OcrJobMigrationRegressionTest`: V105 defaults historical/manual/bulk Expenses to `NOT_REQUIRED`, new OcrJob promotion to `PENDING`, preserves V103 legacy quarantine, and leaves old nullable acceptance keys valid.
- `ExpenseControllerTest`: `PUT review` returns 409 without mutation for stale version or before a Receipt is attached; owner-only confirmation is independent of financial status; replay of the same operation does not create a second attestation.
- `ExpenseServiceTest`: changing reviewable Expense/Receipt data after `VERIFIED` preserves its state and metadata; only an outstanding initial OCR review can be confirmed.
- `ExpenseIdempotencyTest` or a focused `ExpenseReviewIdempotencyTest`: same key/body replays, changed body conflicts, response-loss recovery keeps the exact current version.
- Frontend module tests: extend `ocr-source-queue.test.cjs`, `capture-resume-state.test.cjs`, and `expense-saving-idempotency.test.cjs` for edit persistence, same-key retry, owner switch and confirmation gating. `capture-review.spec.ts` covers reload, navigation, manual completion, conflict, report-link conflict and both confirmation destinations. `offline-queue.spec.ts` gets an explicit service-worker-enabled offline cold-start case.
- Follow #36's release gate: migration rehearsal plus controlled restart at every persisted stage, concurrent workers/stale-token rejection, authenticated owner recovery, permanent/transient failures, and local-storage scope. Emulated WebKit is not physical iPhone acceptance; #51 remains a separate human gate.

## Blocking work

- **#61** — Expense verification state, versioned/idempotent initial-review writes and V105 migration/compatibility. Land before #62.
- **#62** — OCR acceptance idempotency, owner recovery list/actions, same-job manual completion and V106 migration/report context. Blocked by #61 so promotion can call the durable verification service.
- **#49** remains blocked by #47, #61 and #62; #46's contract is complete. This document resolves the design choices; it does not claim those backend prerequisites are delivered or authorize production deployment.
