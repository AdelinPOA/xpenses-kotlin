# Capture release repair — 2026-10-20/21

## Scope and release provenance

This follow-up repairs PR #64 (`f5a1068`) after inspecting the code, GitHub and the actual production images. Backend prerequisites are already integrated through PR #63 (`8c21aed`, merge `c3b9b68`). The original production rollout installed the new enabled frontend while leaving backend revision `2e9f837` and schema V104 in place. Health endpoints passed but that pair could not execute the new review contract.

With the maintainer's explicit selection, only the frontend was temporarily restored to the matching `2e9f837` image. Database, Redis and backend container identities were unchanged. The unintegrated frontend image was retained. A final coordinated release must install the additive backend/migrations before enabling the new frontend. OCR cleanup remains disabled; #60 is independent.

The dirty main checkout was not used as a build source or reset/stashed. Implementation lives in the PR #64 worktree. Worktrees were moved from `/tmp` to disk-backed `/root/xpenses-worktrees/`: `/tmp` is a separate 3.9-GiB tmpfs, despite free disk on `/`. An incomplete baseline dependency copy briefly exhausted it, causing Docker health exec failures while HTTP availability remained intact. Only that generated copy was removed, all health checks recovered without production restarts, and subsequent worktrees/builds remain on disk.

## Correctness repairs

- A disabled feature gate no longer mounts capture/recovery effects, and also gates the alternate edit route.
- Historical `NOT_REQUIRED` Expenses and unrecoverable terminal OCR history are not converted into mandatory local work. Unsynced corrections and uncertain operations are retained.
- Definitively rejected or never-uploaded local files have an explicit discard action. The IndexedDB transaction rejects foreign ownership, live leases, accepted IDs and uncertain acceptance; it never cancels server work implicitly.
- Restored local corrections with an older/unknown server version show conflict rather than silently using a newly fetched version token.
- Crash-interrupted review writes are resolved with their original immutable operation. A confirmation replay returning current `PENDING` state does not clear recovery data or navigate as verified.
- A lost confirmation response remains resolvable after reload even when the server already reports `VERIFIED`.
- Review source IDs are bound to the target Expense, not just its owner. Cleanup uses an observed revision check; acknowledgement cannot overwrite a newer local revision. Local revision stamps advance monotonically.
- Manual recovery after partial Expense promotion omits replacement field values and continues attaching the retained Receipt to the same Expense.
- Confirmation pins/fetches the authoritative Expense independently of the normal list page/filter without discarding that list context.
- The review action group is in document flow rather than a four-button sticky overlay covering mobile inputs. Duplicate edit/review headings were removed. Missing EN/RO pagination/manual-save labels were added.

## Dependency/security gate

`braces@3.0.3` still has no patched registry release. The vulnerability entered through the installed Next lint plugin, but the effective lint config enabled **zero** Next plugin rules; the obsolete `eslint-config-next` package was not imported. The unused registration and dependencies were removed, not downgraded or replaced with an advisory exception. Effective enabled rules were compared programmatically: all **63** previously active rules are identical. Next remains **16.3.8**. At the final check a newly reported `follow-redirects@1.16.0` advisory was also found and resolved with its compatible **1.16.1** patch. `npm audit` reports **0 vulnerabilities**, and the existing strict audit policy is unchanged.

## Verification

- TypeScript `--noEmit --incremental false`, lint and EN/RO parity passed.
- Owner-scoped source/storage/transport Node regressions pass, including discard safety and cleanup CAS.
- Browser regressions exercise historical jobs, rejected upload discard, stale local restore, ambiguous replay, confirmed-response loss/reload, PENDING replay, mismatched source identity, partial promotion and pagination-independent highlighting. Chromium and WebKit are run serially with one worker.
- A separately disabled build exercises queued-source effects and the pending-Expense edit route: **2 passed**.
- Backend controller/source-storage/recovery/migration targeted suites: **34 passed**. Separate repository/state-machine/AsyncOcr suites: **15 passed**. Gradle used `--no-daemon` and bounded workers/heap.
- A real authenticated browser test runs against a disposable PostgreSQL/Redis/backend stack with V105/V106 applied. It does not intercept APIs: acceptance/replay and conflict, owner recovery, editing, SW-enabled offline cold-start after closing the page, online resume, confirmation and idempotent confirmation replay are exercised. It requires both opt-in and the CI-only seeded identity convention before business mutations; localhost alone is not treated as proof of isolation.
- `scripts/verify-ocr-restart.py` injects committed expired-worker fixtures for OCR, EXPENSE and RECEIPT while the **disposable** backend is stopped. After restart all three resume with the same job; RECEIPT preserves its known Expense and produces one Receipt. It accepts only `xpenses-ci`/`xpenses-repair` container prefixes and CI fixture credentials. This is a persisted-state rehearsal, not a claim to crash every CPU instruction or external provider.
- The new browser, disabled-gate, real integration and backend-restart checks are included in CI.

## Visual evidence

See [issue #49 evidence](../ux/mobile-ios-review/issue-49/EVIDENCE.md). Identical synthetic records are shown at capture, review/edit and list stages for EN/RO × light/dark × 375×667/390×844: 24 PNGs before and 24 after. Baseline is the clean merged prerequisite tree `c3b9b68`; there was no immediate-confirmation UI there, so its review frame shows ordinary Expense editing. Only the development-tools overlay is excluded, not product elements. Screenshots and browser emulation do not establish physical iPhone, camera/HEIC, VoiceOver or real-keyboard acceptance; #51 remains a human-device gate.

## Operational limits

No production Expense/Receipt mutations are used for verification. Stage fixtures are synthetic and isolated. Do not enable OCR cleanup or rewrite historical source metadata as part of this release. #60 source provenance and physical-device #51 remain explicitly separate work, not silently declared solved. Applied migrations are never edited or reversed; application rollback preserves V105/V106 and live data.
