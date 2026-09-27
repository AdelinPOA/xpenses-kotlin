## Agent skills

### Issue tracker

GitHub Issues are the source of truth; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Production host guardrails

This machine is the live production server (`xpenses.nt-automation.cc`). Available RAM (~1.9 GB) and disk (~14 GB) are constrained.
- **Keep production up**: Never run `docker compose down` or `make down`. Never prune or delete persistent volumes (`pgdata`, `redisdata`, `xpenses-data`).
- **Avoid resident memory spikes**: Keep Gradle `--no-daemon` (or run `./gradlew --stop` after execution) so persistent 2-4 GB JVM daemons do not trigger the Linux OOM killer on PostgreSQL or Redis.
- **Target single tests**: Avoid running full multi-container test suites or multiple headless Playwright workers on this host.

## Fast verification loop

- **Frontend check**: `cd frontend && npm run typecheck && npm run i18n:check` (fast, avoids heavy `next build` memory/disk spikes).
- **Backend targeted test**: `cd backend-kotlin-jpa && ./gradlew test --tests <ClassName>` (executes targeted test suite).
- **Database migrations**: Check latest version with `ls -1 backend-kotlin-jpa/src/main/resources/db/migration/ | sort -V | tail -n 1`. Never edit applied migrations; always add incremented `V{N}__` migrations.
