# Current handoff — 2026-11-14

## Start here

Canonical source is GitHub `main`: [AdelinPOA/xpenses-kotlin](https://github.com/AdelinPOA/xpenses-kotlin). GitHub issues are the task source of truth. Read [`AGENTS.md`](AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and relevant ADRs under [`docs/adr/`](docs/adr/).

Historical checkpoints and superseded audits (`P2_HANDOFF.md`, `cve.md`, `plans/p2-follow-up.md`, `.planning/`, `docs/astra-production-audit/`, `docs/gpt6-astra-production-audit-prompt.md`, `docs/mobile-ui-remediation-plan.md`) were archived on `2026-11-14` under [`docs/archive/2026-11-14-superseded/`](docs/archive/2026-11-14-superseded/). Earlier integration history remains in [`docs/reviews/2026-10-21-main-integration.md`](docs/reviews/2026-10-21-main-integration.md).

## Source versus production

| Area | Provenance / boundary |
| --- | --- |
| Committed `origin/main` baseline | `34aa5f8` (includes `2459290`, `8727cf4` AI order import/OCR/token refresh/report creation hardening, `304f14e` read-only JPA serialization fixes, and `34aa5f8` P0–P3 audit remediation). |
| Audit remediation rollout (`2026-11-14`) | Full P0-P3 audit fixes (insurance lazy-init & safe MIME/XSS download hardening, 409/413/400/405/415 exception mapping, LDAP/OCR cleanup/PDF-ZIP TX-over-I/O separation, `@Async` proxy split, CSRF logout enforcement, open-redirect & auth-image blob loading, UI error/confirm/i18n parity, `minimatch` override) — committed and pushed to `main`. |
| Production backend | `xpenses-backend:audit-fixes-20261114` |
| Production frontend | `xpenses-frontend:audit-fixes-20261114` (built with `NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=true`) |
| Production schema | `V107` (`V107__refresh_token_rotation_grace.sql`) applied cleanly on live `postgres:16-alpine`; existing `xpenses-db` and `xpenses-redis` containers and volumes preserved. |

Deployment manifests and release pointers live under the private deployment directory below.

## Verification snapshot (2026-11-14)

- Backend full suite (`./gradlew test --no-daemon`): `60` suites, `393` tests, `0` skipped, `0` failures, `0` errors (running with `spring.jpa.open-in-view: false`).
- Frontend checks (`cd frontend && npm run typecheck && npm run i18n:check && npm run lint`): clean (`1243` i18n keys matched across `en.json` and `ro.json`; `eslint . --max-warnings 0` exited `0`).
- Frontend Node regression suites:
  - `npm run test:auth:unit`: `5/5` passed
  - `npm run test:lint-config`: `5/5` passed
  - `npm run test:service-worker:unit`: `9/9` passed
  - `node --test tests/queryPersister.test.cjs tests/expenses/*.test.cjs`: `45/45` passed
- Live production smoke checks after rollout (`xpenses-backend:audit-fixes-20261114` / `xpenses-frontend:audit-fixes-20261114`):
  - `http://127.0.0.1:8001/api/health` and `https://xpenses.nt-automation.cc/api/health`: `{"status":"ok"}`
  - `http://127.0.0.1:3001/login`: `HTTP 200`
  - Unauthenticated `GET /api/insurance` and `POST /api/reports/import-order/preview` (with `Origin`): `HTTP 401`
  - `POST /api/auth/logout` without `Origin`/`Referer`: `HTTP 403` (CSRF enforcement)
  - Flyway schema version: `107`, `OCR_SOURCE_CLEANUP_ENABLED=false`

## Operations and protected evidence

The live host is `xpenses.nt-automation.cc`. Current operational pointer: `/root/xpenses-deployments/current` -> `/root/xpenses-deployments/audit-fixes-20261114`.
Previous rollout artifacts remain preserved under `/root/xpenses-deployments/stabilize-20261114` (rollback target in `audit-fixes-20261114/rollback.yml`) and `/root/xpenses-deployments/ocr-import-20261114`. Pre-deploy DB dump: `/root/xpenses-deployments/stabilize-20261114/backups/pre-deploy.sql.gz`.

- **OCR cleanup stays disabled** (`OCR_SOURCE_CLEANUP_ENABLED=false`) pending `#60`.
- **Host guardrails**: Check `free -h` and `df -h / /tmp` before builds; run Gradle with `--no-daemon`; build Docker images sequentially; never run `docker compose down` or `make down`, and never delete `pgdata`, `redisdata`, or `xpenses-data`.
- Runtime `.env`, DB backups, and user PII remain outside Git.

## Remaining work

- **Live DB accounts**: Active seeded demo accounts (`tech1`, `manager1`, `cfo1`, `mod1`, `tech2`), test users (`test`, `test2`), active accounts with blank email (`cristi`, `bianca`), and potential email typos (`adelin.popesch@nt-automation.eu`, `tudore.vizireanu@nt-automation.eu`, duplicate inactive `Tudorel Vizireanu`) remain in live `users` pending explicit owner confirmation before modification/deactivation.
- **GitHub Issues**: All tracked issues (`#44`, `#45`, `#48`, `#50`, `#51`, `#57`, `#58`, `#59`, `#60`) are closed (`gh issue list --state open` = `0`); live ops guard still keeps `OCR_SOURCE_CLEANUP_ENABLED=false` in `.env` until storage retention reconciliation is verified in production.
