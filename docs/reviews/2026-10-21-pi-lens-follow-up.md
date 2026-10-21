# pi-lens verification follow-up — 2026-10-21

## Repairs

- ESLint now parses `.ts`, `.tsx`, `.mts`, `.cts` with `typescript-eslint@8.72.0`, compatible with installed ESLint10. Existing JavaScript recommended checks remain active. TypeScript recommended checks are enabled; the existing explicit-any policy is unchanged. Generated build/browser artifacts are excluded, not application source. Lint fails on warnings.
- Enabling real TypeScript lint exposed previously unchecked unused imports/bindings, dead initial assignments, unused conditional expressions, invalid exemptions for uninstalled plugins, an empty pointer-release catch and lost error causes. These were corrected without redesigning product flows. React Hook Form watch subscriptions were preserved even when their unused bindings were removed.
- Five executable lint-config regressions check all four TypeScript extensions against an actual forbidden `debugger` statement, plus JavaScript checks. A future config that silently ignores TypeScript fails this gate.
- The disposable restart script is import-safe and uses explicit fail-closed checks, not optimization-removable assertions. It parses and restricts actual backend/origin hosts and ports before HTTP/Docker calls, checks the authenticated fixture before business writes, and uses a fixed-loopback HTTP client which never follows redirects. Cookies/JSON handling remains local to that fixed endpoint.
- Fixture SQL uses psql quoted variables with a constant query via stdin. Polling has an explicit bounded return/timeout rather than a potentially-unbound last-job reference. The disposable backend is restarted in `finally` after fixture preparation.
- Eleven direct workflow action references are pinned to upstream commit SHAs resolved through the GitHub commit API (annotated tag object IDs are not used). Default token permissions are empty, required job permissions are explicit, and all checkout steps disable credential persistence. Isolation tests run normally and with optimized Python in CI. Existing audit/image security policies are not weakened.

## Verification

- `npm run lint`: zero errors/warnings across actual JS/TS source; five lint-config tests pass.
- Typecheck and EN/RO1192-key parity pass; full npm audit zero vulnerabilities.
- Existing source/storage/recovery Node tests:18 pass.
- Chromium capture, hydration and public-mobile regressions:20 pass;17 explicit visual/authenticated opt-in cases skipped in this local mock-backed run. Authenticated full-runtime testing remains in the PR CI workflow; no production business fixtures were used.
- Script safety tests:8 pass both normally and under `python -O`, including userinfo-host bypass, non-CI identity/profile, redirect rejection, parameter binding, timeout and mocked successful three-stage recovery. These tests execute no real Docker/business calls.
- Actual psql binding checked separately against disposable PostgreSQL: an apostrophe/SQL-looking value remains data. Only that disposable DB was started and stopped.
- Ruff targeted safety/undefined-name checks pass. Fresh offline zizmor1.31.1 reports zero workflow findings. Fresh pi-lens all-server probes of script, tests, workflow and ESLint config:4 confirmed clean, zero diagnostics.

## Boundaries

This is a source/verification follow-up, not a new production rollout. Existing production images remain unchanged and healthy. Preexisting main-checkout and previous-worktree changes are untouched. Old diagnostics can still refer to those older worktree paths; this report does not claim every historical cache entry or every structural complexity recommendation is resolved. No global rule suppression or pi-lens configuration change was used to hide findings.
