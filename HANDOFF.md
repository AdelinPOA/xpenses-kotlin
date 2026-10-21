# Current handoff — 2026-10-21

## Start here

Canonical source is GitHub `main`: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin). GitHub issues are the task source of truth. Read `AGENTS.md`, `frontend/AGENTS.md`, the glossary `CONTEXT.md` and relevant ADRs. Communicate concisely in Romanian.

The maintainer requested all pending local work integrated into main and fully documented. The [integration record](docs/reviews/2026-10-21-main-integration.md) identifies every source group, preserved snapshot and conflict decision. The earlier [P2 handoff](P2_HANDOFF.md) and 2026-10-18 audit are historical, not current execution instructions.

## Source versus production

| Area | Provenance / boundary |
| --- | --- |
| Capture/review and platform | PR #64 merged as `3f9c87f`; application repairs `b88817c`, Boot4 migration `bdc0565`, security patches `343ec37`, first-visit login/iOS fixes `7244f58`. |
| Verification tooling | PR #67 merged as `2d040a59`, source `2bee93d`. Real TypeScript lint, fail-closed restart harness and pinned/least-permission CI. |
| Previously local work | Snapshot `33aff88`, reconciled with current source; seven Kotlin test-formatting changes `02f3baf`; bulk/mobile evidence, documentation consolidation, QA tooling and pi-lens config are accounted for in the integration record. |
| Production backend | `xpenses-backend:boot4-343ec37`, patched Boot4/Framework7/Jackson3/Tomcat11 runtime. |
| Production frontend | `xpenses-frontend:capture-7244f58`, immediate review enabled. |
| Production schema | V105 and V106 applied successfully after V104; original database/Redis containers retained. |

Source commits after those image revisions are **not automatically deployed**. This main synchronization does not authorize a new release, overwrite live data or enable cleanup. Check actual image labels/configuration and current source before any later deployment.

## Verification references

- Capture/platform source qualification: [CI39544399462](https://github.com/AdelinPOA/xpenses-kotlin/actions/runs/39544399462), all jobs successful. Post-merge [CI39606456538](https://github.com/AdelinPOA/xpenses-kotlin/actions/runs/39606456538) also succeeded.
- Tooling qualification: [CI39614606952](https://github.com/AdelinPOA/xpenses-kotlin/actions/runs/39614606952), all jobs successful, including real disposable authenticated capture and backend restart.
- Integration-specific results and exact final CI are recorded in the integration PR/record. Check GitHub rather than assuming a pending run is green.
- Detailed evidence: [capture/release repair](docs/reviews/2026-10-21-capture-release-repair.md), [Boot4 compatibility](docs/reviews/2026-10-21-boot4-migration.md), [lint/CI safety](docs/reviews/2026-10-21-pi-lens-follow-up.md), [bulk/mobile evidence](docs/ux/mobile-ios-review/issue-48/EVIDENCE.md), [capture before/after](docs/ux/mobile-ios-review/issue-49/EVIDENCE.md).
- Browser emulation and mocked synthetic receipts are not physical iPhone acceptance. No production business records are used as test fixtures.

## Operations and protected evidence

The live host is `xpenses.nt-automation.cc`. Current operational pointer: `/root/xpenses-deployments/current` → `repair-20261020/`. Read `RELEASE.md`, `OPERATIONS.txt`, `deploy.yml`, `rollback.yml`, and `latest-backup.path` there for exact private backup/image/rollback details. Integration backup/plan: `/root/xpenses-deployments/integrate-main-20261021/`.

The coordinated release took fresh DB/files backups, checked archives, actually restored the DB privately and rehearsed additive migrations before installation. Public login/API health and unauthorized guest behavior passed; live business counts were unchanged. Runtime snapshots, env files, employee data and backup contents remain private and must never be committed or quoted publicly.

**OCR cleanup stays disabled.** Issue #60 still needs source-provenance/recoverability evidence. Never repair historical pointers speculatively. Prefer a frontend-only rollback retaining the patched backend; never reverse applied migrations or restore an old full DB over newer writes merely to revert code. Keep old immutable images.

Check `free -h` and `df -h / /tmp` before heavy work: `/tmp` is a separate RAM disk. Large worktrees/cache/backups belong on disk under `/root`. Run serial browser checks and Gradle with `--no-daemon`; never stop the production Compose stack or delete its persistent volumes. CI teardown commands apply only on disposable CI runners.

## Remaining work

- #45 remains the mobile tracking parent; #50 receipt-modal inspection/accessibility and #51 real iPhone/Safari/PWA/keyboard/camera/VoiceOver require their own acceptance.
- #48 bulk evidence is integrated, but this does not claim its physical-device gate passed. Keep issue status aligned with its actual remaining acceptance.
- #57/#58/#59 and #60 have independent cleanup/privacy/offline acceptance boundaries; read current issues before acting. Historical source mechanisms and old audit claims are not automatically current incidents.
- #49/#54/#56/#61/#62/#65 are integrated fixes. Dependabot76 was fixed automatically, not dismissed. #66 tracks the verified tooling follow-up merged through PR67.

## Next session

Confirm `git status`, `git rev-parse HEAD`, `git rev-parse origin/main`, current CI and actual deployed image labels. After this integration, do not treat old worktree tips or cached pi-lens findings on those paths as canonical main. Do not prune worktrees, delete backups or reset local work merely to make status appear clean.
