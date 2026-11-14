# Current handoff — 2026-11-14

## Start here

Canonical source is GitHub `main`: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin). GitHub issues are the task source of truth. Read [`AGENTS.md`](AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and relevant ADRs under [`docs/adr/`](docs/adr/).

Historical checkpoints and superseded audits (`P2_HANDOFF.md`, `cve.md`, `plans/p2-follow-up.md`, `.planning/`, `docs/astra-production-audit/`, `docs/gpt6-astra-production-audit-prompt.md`, `docs/mobile-ui-remediation-plan.md`) were archived on `2026-11-14` under [`docs/archive/2026-11-14-superseded/`](docs/archive/2026-11-14-superseded/). Earlier integration history remains in [`docs/reviews/2026-10-21-main-integration.md`](docs/reviews/2026-10-21-main-integration.md).

## Source versus production

| Area | Provenance / boundary |
| --- | --- |
| Committed `origin/main` baseline | `2459290` (includes `23b0df8` review edits, `7d3a19f` auth login/rate-limit hardening, `b151269` AI order import base, `3d44cb9` CIDR/Cloudflare trusted proxies, `2459290` immediate OCR review flag default). |
| Local workspace rollout (`2026-11-14`) | AI Import Order (`Import` & `Import & Review` + structured JSON schema / retry fixes) + Expense OCR hardening (parallel bulk OCR, `REQUIRES_NEW` cache/FX upserts, `important-todo.md`) + Stabilization fixes (`general-todo.md`: refresh token rotation grace window `V107`, cross-tab single-flight refresh, atomic `POST /api/reports` with `expense_ids` & `Idempotency-Key`, `open-in-view: false`, `FxRateInput` reset, blank/invalid email guard). *(Pending commit & push to `main`.)* |
| Production backend | `xpenses-backend:stabilize-20261114-2` |
| Production frontend | `xpenses-frontend:stabilize-20261114` (built with `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=true`) |
| Production schema | `V107` (`V107__refresh_token_rotation_grace.sql`) applied cleanly on live `postgres:16-alpine`; existing `xpenses-db` and `xpenses-redis` containers and volumes preserved. |

Source changes not yet committed/pushed to `origin/main` live in `/root/xpenses-kotlin` and are deployed via the private release directory below.

## Verification snapshot (2026-11-14)

- Backend full suite (`./gradlew test --no-daemon`): `59` suites, `387` tests, `0` skipped, `0` failures, `0` errors (running with `spring.jpa.open-in-view: false`).
- Frontend checks (`cd frontend && npm run typecheck && npm run i18n:check && npm run lint`): clean (`1222` i18n keys matched across `en.json` and `ro.json`; `eslint . --max-warnings 0` exited `0`).
- Frontend Node regression suites:
  - `npm run test:auth:unit`: `5/5` passed
  - `npm run test:lint-config`: `5/5` passed
  - `npm run test:service-worker:unit`: `9/9` passed
  - `node --test tests/queryPersister.test.cjs tests/expenses/*.test.cjs`: `45/45` passed
- Live production smoke checks after rollout (`xpenses-backend:stabilize-20261114` / `xpenses-frontend:stabilize-20261114`):
  - `http://127.0.0.1:8001/api/health` and `https://xpenses.nt-automation.cc/api/health`: `{"status":"ok"}`
  - `http://127.0.0.1:3001/login`: `HTTP 200`
  - Unauthenticated `POST /api/reports/import-order/preview`: `HTTP 401`
  - Flyway schema version: `107`, `OCR_SOURCE_CLEANUP_ENABLED=false`

## Operations and protected evidence

The live host is `xpenses.nt-automation.cc`. Current operational pointer: `/root/xpenses-deployments/current` -> `/root/xpenses-deployments/stabilize-20261114`.
Previous rollout artifacts remain preserved under `/root/xpenses-deployments/ocr-import-20261114` (which is also the rollback target in `stabilize-20261114/rollback.yml`). Pre-deploy DB dump: `/root/xpenses-deployments/stabilize-20261114/backups/pre-deploy.sql.gz`.

- **OCR cleanup stays disabled** (`OCR_SOURCE_CLEANUP_ENABLED=false`) pending `#60`.
- **Host guardrails**: Check `free -h` and `df -h / /tmp` before builds; run Gradle with `--no-daemon`; build Docker images sequentially; never run `docker compose down` or `make down`, and never delete `pgdata`, `redisdata`, or `xpenses-data`.
- Runtime `.env`, DB backups, and user PII remain outside Git.

## Remaining work

- **Git sync**: Stage, review, commit, and push the `2026-11-14` workspace changes (`important-todo.md` + `general-todo.md` fixes and doc archival) to `origin/main` when ready.
- **Live DB demo accounts** (`general-todo.md` §3): Active seeded accounts (`tech1`, `manager1`, `cfo1`, `mod1`, `tech2`) and active accounts with blank email (`cristi`, `bianca`) exist in live `users`; awaiting maintainer decision before deactivating demo users.
- **Open tracked GitHub issues**: `#58`/`#59` (PWA/SW offline cold-start on iPhone), `#57`/`#60` (orphan receipt & OCR cleanup reconciliation), `#45`/`#48`/`#50`/`#51` (mobile receipt inspection & physical iPhone acceptance gates).
