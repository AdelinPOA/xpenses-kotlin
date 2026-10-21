# Consolidated main integration — 2026-10-21

## Maintainer request and scope

The maintainer explicitly requested all pending work on `main` and complete documentation. This integrates source, tests, evidence, documentation and development tooling; it is **not** a new production rollout. GitHub remains the canonical source/task tracker.

At inventory, `/root/xpenses-kotlin` was at `9d0277c`, eight commits behind main, with 45 status entries (34 tracked modifications/deletions and 21 individual untracked files grouped into 11 entries), plus 1 subsequent untracked helper script (`scripts/run_graphify_full.py`) created during Graphify indexing (bringing `git status` to 46 entries; backed up and included). The capture worktree held seven uncommitted Kotlin test-formatting changes; other live worktrees were clean. Twelve intentional issue 48 PNGs were hidden by the broad image ignore rule.

## Preservation and source lineage

Before changing source, private binary/index patches, NUL-delimited inventories, untracked-file archive and SHA256 checksums were saved under `/root/xpenses-deployments/integrate-main-20261021/`. The ignored issue48 visuals were separately archived. No reset/stash/blanket add, production restart, live business mutation or persistent-volume deletion was used.

- `33aff88`: exact pending local tracked/untracked snapshot, based on the original `9d0277c` tree. Preserves the old local versions in Git history before reconciliation.
- `0d65e48`: semantic merge with the verified capture/platform/tooling ancestry, including `2bee93d`.
- `02f3baf`: seven pending formatting-only Kotlin test revisions from the capture worktree.
- PR67 source `2bee93d` passed all jobs in [CI39614606952](https://github.com/AdelinPOA/xpenses-kotlin/actions/runs/39614606952) and merged separately as `2d040a59`. This branch incorporates that main ancestry.

The final integration PR and Git history record publication/merge provenance. Main synchronization must use the preserved snapshot and compare trees before advancing the original checkout, not discard its outstanding work.

## Every pending group accounted for

| Group | Disposition |
| --- | --- |
| README, glossary, domain/agent guidance | Retain the consolidation and factual terminology corrections; refresh current platform, migrations, flows, verification and production boundaries. Keep architectural decisions in ADRs and glossary separate. |
| Old FULL_APP_AUDIT/WIP/todo/root documentation | Preserve under dated archive, including original SHA256 records. Historical claims/links are not current instructions. Add current handoff and explicit supersession pointers. |
| `.planning` research/codebase notes | Retain tracked historical pointers and findings; do not convert old audit proposals into accepted requirements. |
| Bulk-review/mobile evidence and tests | Integrate expanded failure/recovery/control-width tests and all12 synthetic EN/RO light/dark mobile/desktop screenshots. Add only the scoped issue48 image exception. Physical-device acceptance remains unclaimed. |
| AuthProvider/proxy/offline workspace/service worker | Retain pending formatting and test revisions. Comparing emitted JavaScript ASTs confirmed unchanged runtime structure for these files; do not falsely call them new privacy fixes. |
| BulkReviewDrawer | Pending changes emit the same runtime AST; retain formatting. New bulk-browser cases remain real additional test coverage. |
| ExpensesClient overlap | Local runtime differences are JSX whitespace literals. Preserve the newer authoritative-fetch/pinned-confirmation/highlight implementation from the repaired main source. |
| IosInstallHint overlap | Preserve the newer in-flow nonblocking hint and existing safe dismissal. The old local duplicate state setter adds no behavior and is redundant; the snapshot preserves it historically. |
| Verification contract add/add | Preserve the newer approved upload-based30-day window, cleanup hold, Receipt prerequisite and safe recovery/category tests; do not resurrect superseded seven-day terminal wording. |
| Seven Kotlin test files | Integrate pending formatting/import ordering; no new backend domain behavior is invented. Full backend CI still verifies compilation/tests. |
| `.pi-lens.json` | Retain generated-artifact exclusions; do not globally suppress substantive diagnostic rules. |
| Root package/lockfile | Retain as a clearly named private, development-only optional Playwright QA toolbox. Application install/build/lint remain under `frontend/`; this is not a second application runtime. |
| `skills/mobile-pwa-qa` | Retain QA instructions, repair frontmatter, keep emulator-versus-device distinction. |
| `scripts/run_graphify_full.py` | Retain Graphify full analysis pipeline script created in the primary checkout after the initial 45-entry snapshot. |
| `P2_HANDOFF.md` and `plans/p2-follow-up.md` | Preserve historical checkpoints; current operational guidance lives in root `HANDOFF.md`. |

## Conflict decisions

Only three files conflicted: verification contract, ExpensesClient and IosInstallHint. Resolutions retain all substantive approved local intent while keeping newer tested behavior. No blanket selection of the stale local tree replaced main. Snapshot33aff88 and private archives make the exact pre-resolution contents recoverable.

## Documentation and privacy checks

The entire original snapshot passed a secret scan before its commit. Archives preserve historical text, not a license to disclose runtime configuration; host env/inspect/backup files remain outside Git. README identifies the dated2026-10-18 audit as historical and corrects superseded statements about Boot generation, V103-only migrations, navigation-HTML caching, missing idempotency, unhandled bulk failures and absent retention scheduling. Current operational facts and unresolved acceptance are in `HANDOFF.md`, not guessed from old checkboxes.

## Verification

Integration checks are performed serially and recorded below/in the integration PR. Do not infer a green full CI from the already successful PR67 run: the consolidated tree has its own required qualification.

- Required: real lint coverage, lint/typecheck/translation parity, Node storage/bulk/service-worker regressions, actual browser service-worker/offline and bulk/mobile/capture checks.
- Required: consistent root/frontend lockfiles, secret/static checks, documentation links/archive/evidence integrity and full remote backend/frontend/Compose CI.
- No real production credentials/business fixtures, external OCR accuracy measurement or physical Safari/VoiceOver acceptance is included.

## Production boundary and remaining work

Production remains the already qualified PR64 pair: backend `boot4-343ec37`, frontend `capture-7244f58`, schema V106. The main integration and PR67 tooling do not silently rebuild or redeploy those images. Private current operations/rollback pointer is `/root/xpenses-deployments/current`; no secrets or backup contents are copied here.

OCR cleanup remains disabled pending #60. #45 stays the tracking parent; #48 evidence does not close physical acceptance, and #50/#51 remain independent. Recheck #57/#58/#59 before claiming all cleanup/privacy/device gates complete. Successful source integration means the repository is synchronized, not that every open issue is resolved.
