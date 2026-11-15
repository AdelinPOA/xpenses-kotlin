# Current handoff — 2026-11-15

## Start here

Canonical source is GitHub `main`: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin). GitHub issues are the task source of truth. Read [`AGENTS.md`](AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and relevant ADRs under [`docs/adr/`](docs/adr/).

Historical checkpoints and superseded audits (`P2_HANDOFF.md`, `cve.md`, `plans/p2-follow-up.md`, `.planning/`, `docs/astra-production-audit/`, `docs/gpt6-astra-production-audit-prompt.md`, `docs/mobile-ui-remediation-plan.md`) were archived on `2026-11-14` under [`docs/archive/2026-11-14-superseded/`](docs/archive/2026-11-14-superseded/). Earlier integration history remains in [`docs/reviews/2026-10-21-main-integration.md`](docs/reviews/2026-10-21-main-integration.md).

## Source versus production

| Area | Provenance / boundary |
| --- | --- |
| Previous `origin/main` baseline | `947ada5` (prior `34aa5f8` P0–P3 audit remediation + root documentation sync). |
| Audit remediation rollout (`2026-11-15`) | Full 30-item checklist in [`todo.md`](todo.md) (`C1`–`C10`, `M1`–`M11`, `P1`–`P5`, `Q1`–`Q4`): OCR lease/attempt/render/lazy-init/idempotency fixes, storage secret masking & SSRF/path guards, rate-limiting & proxy hardening, advance/report/expense/FX lifecycle fixes, IMAPS timeouts & ingestion caps, Kotlin warning cleanup, and frontend auth-image/useFormGuard/IndexedDB-logout/SSR/a11y fixes. |
| Production backend | `xpenses-backend:audit-fixes-20261115` |
| Production frontend | `xpenses-frontend:audit-fixes-20261115` (built with `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=true`) |
| Production schema | `V107` (`V107__refresh_token_rotation_grace.sql`) applied cleanly on live `postgres:16-alpine`; existing `xpenses-db` and `xpenses-redis` containers and volumes preserved. |

Deployment manifests and release pointers live under the private deployment directory below.

## Verification snapshot (2026-11-15)

- Backend compilation (`./gradlew compileKotlin compileTestKotlin --no-daemon --rerun-tasks`): `0` errors, `0` warnings (`48` compiler warnings resolved).
- Backend container-free unit tests (`26` suites): `175` tests, `0` skipped, `0` failures, `0` errors.
- Backend targeted Testcontainers suites (`21` suites across 3 sequential batches, `spring.jpa.open-in-view: false`): `165` tests (`69` + `71` + `25`), `0` skipped, `0` failures, `0` errors (`7` untouched integration suites skipped per host guardrail).
- Frontend checks (`cd frontend && npm run typecheck && npm run i18n:check && npm run lint`): clean (`1245` i18n keys matched across `en.json` and `ro.json`; `eslint . --max-warnings 0` exited `0`).
- Frontend Node & Playwright regression suites:
  - `npm run test:auth:unit`: `5/5` passed
  - `npm run test:lint-config`: `5/5` passed
  - `npm run test:service-worker:unit`: `9/9` passed
  - `node --test tests/expenses/ocr-source-queue.test.cjs tests/expenses/capture-resume-state.test.cjs tests/expenses/receipt-capture.test.cjs tests/expenses/ocr-recovery-client.test.cjs`: `18/18` passed
  - `npm run test:offline-regressions`: `29/29` passed (`mobile-chromium`, `--workers=1`; `tests/auth/replay-session.spec.ts --repeat-each=3`: `21/21` passed)
- Root script & reconcile checks: `python3 scripts/reconcile.py audit` PASS, `test_verify_ocr_restart.py` `8/8` OK, `check-i18n-parity.test.mjs` & `check-npm-audit.test.mjs` PASS.
- Live production smoke checks after rollout (`xpenses-backend:audit-fixes-20261115` / `xpenses-frontend:audit-fixes-20261115`):
  - `http://127.0.0.1:8001/api/health` and `https://xpenses.nt-automation.cc/api/health`: `{"status":"ok"}`
  - `http://127.0.0.1:3001/login` and `https://xpenses.nt-automation.cc/login`: `HTTP 200`
  - Unauthenticated `GET /api/insurance` and `GET /v3/api-docs`: `HTTP 401`
  - `POST /api/auth/logout` without `Origin`/`Referer`: `HTTP 403` (CSRF enforcement)
  - Flyway schema version: `107`, `OCR_SOURCE_CLEANUP_ENABLED=false`

## Operations and protected evidence

The live host is `xpenses.nt-automation.cc`. Current operational pointer: `/root/xpenses-deployments/current` -> `/root/xpenses-deployments/audit-fixes-20261115`.
Previous rollout artifacts remain preserved under `/root/xpenses-deployments/audit-fixes-20261114` (rollback target in `audit-fixes-20261115/rollback.yml`), `/root/xpenses-deployments/stabilize-20261114`, and `/root/xpenses-deployments/ocr-import-20261114`. Pre-deploy DB dump: `/root/xpenses-deployments/audit-fixes-20261115/backups/pre-deploy.sql.gz`.

- **OCR cleanup stays disabled** (`OCR_SOURCE_CLEANUP_ENABLED=false`) pending `#60`.
- **Host guardrails**: Check `free -h` and `df -h / /tmp` before builds; run Gradle with `--no-daemon`; build Docker images sequentially; never run `docker compose down` or `make down`, and never delete `pgdata`, `redisdata`, or `xpenses-data`.
- Runtime `.env`, DB backups, and user PII remain outside Git.

## Remaining work

- **Live DB accounts**: Active seeded demo accounts (`tech1`, `manager1`, `cfo1`, `mod1`, `tech2`), test users (`test`, `test2`), active accounts with blank email (`cristi`, `bianca`), and potential email typos (`adelin.popesch@nt-automation.eu`, `tudore.vizireanu@nt-automation.eu`, duplicate inactive `Tudorel Vizireanu`) remain in live `users` pending explicit owner confirmation before modification/deactivation.
- **GitHub Issues**: All tracked issues (`#44`, `#45`, `#48`, `#50`, `#51`, `#57`, `#58`, `#59`, `#60`) are closed (`gh issue list --state open` = `0`); live ops guard still keeps `OCR_SOURCE_CLEANUP_ENABLED=false` in `.env` until storage retention reconciliation is verified in production.
