# Current handoff — 2026-11-19

## Start here

Canonical source is GitHub `main`: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin). GitHub issues are the task source of truth. Read [`AGENTS.md`](AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and relevant ADRs under [`docs/adr/`](docs/adr/).

Historical checkpoints and superseded audits (`P2_HANDOFF.md`, `cve.md`, `plans/p2-follow-up.md`, `.planning/`, `docs/astra-production-audit/`, `docs/gpt6-astra-production-audit-prompt.md`, `docs/mobile-ui-remediation-plan.md`) were archived on `2026-11-14` under [`docs/archive/2026-11-14-superseded/`](docs/archive/2026-11-14-superseded/). Earlier integration history remains in [`docs/reviews/2026-10-21-main-integration.md`](docs/reviews/2026-10-21-main-integration.md).

## Source versus production

| Area | Provenance / boundary |
| --- | --- |
| Previous `origin/main` baseline | `37726ee` (`2026-11-15` audit remediation rollout + CI Playwright stabilization + telemetry sync). |
| AI OCR & email ingestion optimization rollout (`2026-11-19`) | Commit `4081907` + live DB `ocr_config`/`delegation_parsing_config` recalibration: 90s per-model circuit breaker cooldown, `OpenAiCompatibleClient` `5s`/`20s` timeouts + `temperature: 0.0` + `max_tokens: 1024` + 400/422 fallback, bounded receipt `raw_text` & currency/category prompt calibration, 1600px JPEG PDF rendering, `ocrTaskExecutor` `corePoolSize=6` (`allowCoreThreadTimeOut=true`), `RetryableFailure` on transient IMAP AI outages + `60s` default IMAP poll interval, `simulateIncomingEmail` local-only bypass & Technician role parity, `BulkExpenseController` `ocr_comparisons.expense_id` linkage, frontend progressive OCR polling (`250ms`–`1500ms`), and Next.js `proxyTimeout: 90_000`. |
| Production backend | `xpenses-backend:ai-ocr-perf-20261119` |
| Production frontend | `xpenses-frontend:ai-ocr-perf-20261119` (built with `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=true`) |
| Production schema | `V107` (`V107__refresh_token_rotation_grace.sql`) applied cleanly on live `postgres:16-alpine`; existing `xpenses-db` and `xpenses-redis` containers and volumes preserved. |

Deployment manifests and release pointers live under the private deployment directory below.

## Verification snapshot (2026-11-19)

- Backend targeted unit suites (`OpenAiCompatibleClientTest`, `OcrServiceTest`, `EmailImportServiceTest`, `DelegationParsingSettingsServiceTest` with `--no-daemon`): `54/54` passed (`0` failures, `0` errors).
- Frontend checks (`cd frontend && npm run typecheck && npm run i18n:check && npm run lint`): clean (`1245` i18n keys matched across `en.json` and `ro.json`; `eslint . --max-warnings 0` exited `0`).
- Frontend capture unit tests (`node --test tests/expenses/receipt-capture.test.cjs`): `7/7` passed (including progressive polling backoff regression test).
- Root reconcile & audit: `python3 scripts/reconcile.py audit` PASS.
- Live production smoke & headless Chromium E2E checks after rollout (`xpenses-backend:ai-ocr-perf-20261119` / `xpenses-frontend:ai-ocr-perf-20261119`, ephemeral accounts cleaned up):
  - `http://127.0.0.1:8001/api/health` and `https://xpenses.nt-automation.cc/api/health`: `{"status":"ok"}`
  - `https://xpenses.nt-automation.cc/login`: `HTTP 200`
  - Cold JPEG capture (`SHELL`): `4,262ms` (down from `8,118–11,205ms`), cache-hit JPEG capture: `608ms` (down from `1,817ms`), Order Import preview: `1,843ms` (down from `8,396ms`, deterministic English output), Admin simulate `parser=local`: `121ms` (down from `8,035ms`), bulk upload `ocr_comparisons` linked `3/3`, circuit breaker & `OcrWorker-3` verified live.
  - Flyway schema version: `107`, `OCR_SOURCE_CLEANUP_ENABLED=false`

## Operations and protected evidence

The live host is `xpenses.nt-automation.cc`. Current operational pointer: `/root/xpenses-deployments/current` -> `/root/xpenses-deployments/ai-ocr-perf-20261119`.
Previous rollout artifacts remain preserved under `/root/xpenses-deployments/audit-fixes-20261115` (rollback target in `ai-ocr-perf-20261119/rollback.yml`), `/root/xpenses-deployments/audit-fixes-20261114`, `/root/xpenses-deployments/stabilize-20261114`, and `/root/xpenses-deployments/ocr-import-20261114`. Pre-deploy DB dump: `/root/xpenses-deployments/ai-ocr-perf-20261119/backups/pre-deploy.sql.gz`.

- **OCR cleanup stays disabled** (`OCR_SOURCE_CLEANUP_ENABLED=false`) pending `#60`.
- **Host guardrails**: Check `free -h` and `df -h / /tmp` before builds; run Gradle with `--no-daemon`; build Docker images sequentially; never run `docker compose down` or `make down`, and never delete `pgdata`, `redisdata`, or `xpenses-data`.
- Runtime `.env`, DB backups, and user PII remain outside Git.

## Remaining work

- **Live DB accounts**: Active seeded demo accounts (`tech1`, `manager1`, `cfo1`, `mod1`, `tech2`), test users (`test`, `test2`), active accounts with blank email (`cristi`, `bianca`), and potential email typos (`adelin.popesch@nt-automation.eu`, `tudore.vizireanu@nt-automation.eu`, duplicate inactive `Tudorel Vizireanu`) remain in live `users` pending explicit owner confirmation before modification/deactivation.
- **GitHub Issues**: All tracked issues (`#44`, `#45`, `#48`, `#50`, `#51`, `#57`, `#58`, `#59`, `#60`) are closed (`gh issue list --state open` = `0`); live ops guard still keeps `OCR_SOURCE_CLEANUP_ENABLED=false` in `.env` until storage retention reconciliation is verified in production.
