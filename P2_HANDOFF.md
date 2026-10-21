# Historical handoff — P2 release follow-up

**Superseded:** read [HANDOFF.md](HANDOFF.md) for current source, production, CI and remaining gates. The original P2 checkpoint below is retained as dated history, not current execution instructions. The V104/old-image and unverified-backup statements below were superseded by the verified 2026-10-21 coordinated V105/V106 release.

## Continue here

Working directory: `/root/xpenses-kotlin`. Communicate concisely in Romanian.

P2 implementation, review, production deployment and commit/push are complete, with a deliberate production retention hold. The recommended next work, before this handoff, was:

1. Check the final post-push GitHub Actions result.
2. Investigate the source/storage discrepancy in [#60](https://github.com/AdelinPOA/xpenses-kotlin/issues/60), without enabling cleanup or repairing historical records prematurely.

The user has requested a handoff document, not new implementation or another deployment. Do not treat this document as authorization for broader production mutations.

## Authoritative references

Read these rather than reconstructing their contents:

- `AGENTS.md`, `frontend/AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and `CONTEXT.md`.
- **Review, corrections, test evidence and rollout:** `docs/reviews/p2-save-correctness.md`.
- **Save guarantees and compatibility:** `docs/adr/0007-durable-expense-save-idempotency.md`, plus the supersession pointer in ADR 0002.
- **Implemented OCR contract and remaining gaps:** `docs/contracts/ocr-source-resume-and-retention.md` and relevant existing ADRs.
- **Retention investigation/activation prerequisites:** [#60](https://github.com/AdelinPOA/xpenses-kotlin/issues/60).
- **Remaining mobile scope:** #46, #48 and #49, including their latest comments. These issues were not closed or represented as fully complete.

GitHub Issues via `gh` are the project source of truth.

## Git and deployed provenance

Both commits were successfully pushed to `origin/main`:

- Application: `2e9f8372a5be4577425103b654832ddf7aece2b0`.
- Operational retention safeguard and rollout documentation: `9d0277c2c772f9c897d9d5f880d5b738ed4f98cb`.

The latter was the last verified repository HEAD. Production images intentionally carry the **application** revision label; the later commit changes Compose/documentation only. This distinction does not require an application rebuild.

Last observed CI run: [39200180463](https://github.com/AdelinPOA/xpenses-kotlin/actions/runs/39200180463), for the operational commit. It was still running at the last check; obtain its current result rather than assuming success.

Push also reported a preexisting `braces` development-dependency advisory, Dependabot #76. It had no patched version at last inspection and is separate from P2; consult existing tracking issues before duplicating work.

## Production handoff

This checkout is on the live production host. Read and follow `AGENTS.md` guardrails. Check memory/disk before heavy work, never run Compose down or delete persistent volumes, use targeted tests and Gradle `--no-daemon`. Do not expose `.env`, credentials, private source metadata or backup contents.

Persistent operational evidence:

`/root/xpenses-deployments/p2-2e9f8372a5be/`

Read `state.json` and `OPERATIONS.txt` for exact deployed/rollback images, backup locations, checks and commands. `deploy.yml` and `rollback.yml` preserve production bindings and release configuration. These protected files also contain the retention investigation evidence; do not copy private candidate details into public issues or prompts.

At final verification all four production services were healthy and V104 had applied. Database and Redis containers were not replaced. The release was built from a clean committed archive, not the dirty checkout. Refer to the review artifact for tests and qualification details rather than repeating every check.

**OCR source cleanup remains disabled.** Issue #60 explains the failed activation precondition. No candidates were cleaned or repaired. Absence from local storage/backups does not prove absence from a configured remote provider. Investigate actual provider configuration and historical migration/cleanup safely.

Compose defaults cleanup to explicit opt-in. The persistent deployment overlay also forces it off, even if a shell environment flag is true. Preserve these safeguards until the investigation and source/backup verification support an explicitly approved action. Backups were archive-readability checked, not restore-tested. Never restore an entire database over newer live writes merely to roll back application code.

## Working-tree isolation

Many unrelated changes predated P2 and remain uncommitted. They were intentionally excluded from its commits and deployment. Inspect current `git status` and preserve them; do not use `git add -A`, reset, overwrite, casually stash, or deploy the entire dirty checkout.

Important unrelated groups include offline public/service-worker assets and their tests; AuthProvider/proxy/ExpensesClient formatting; and README, AGENTS, CONTEXT, planning/archive/documentation restructuring. P2 paths were clean following its commits. Scope any subsequent commit or build explicitly.

## Remaining work beyond the immediate follow-up

Use the linked issues/contracts for exact requirements. The next sequence proposed was: resolve #60 safely; address unknown OCR acceptance through backend idempotency/lookup; complete the #46 verification/corrections contract before #49 UX; finish #48 screenshot/device acceptance; review unrelated P1/documentation work separately. None should be silently folded into the retention investigation.

## Tooling and user preferences

The user explicitly asked for tool calls inside subagents or in batches. Preserve that workflow.

A previous request to launch `claude --bg --name ...` failed because the executable was not found. A subsequent read-only lookup fork was aborted. **No background Claude agent was started.** The user then requested this file-based handoff instead; do not retry installation or background launch unless requested.

## Suggested skills

The next agent should call the Skill tool for:

- **diagnosing-bugs** — investigate the missing-source discrepancy with a targeted, safe feedback loop.
- **find-docs** — verify provider/framework-specific storage or configuration behavior when needed.
- **code-review** — review any proposed follow-up implementation/configuration before release.
- **domain-modeling** — only if changing retention policy, domain terminology or ADRs.

Start by reporting the current CI result, then an evidence-backed #60 diagnosis or bounded investigation plan. Clearly distinguish read-only evidence, tests, proposed repairs and actions actually taken.
