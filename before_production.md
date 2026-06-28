# Production Readiness Review — xpenses-kotlin

Reviewed 2026-06-28. App has solid bones for production already: bcrypt passwords, JWT with HttpOnly cookies, CORS allowlist, Origin/Referer CSRF defense, bucket4j rate-limiting on login/refresh, non-root Docker user, Flyway migrations, soft-deletes, a backup script, and a JSON-logging prod profile already written. The gaps below are mostly **deployment/ops hygiene**, not code architecture.

## 🔴 Must fix before wider rollout

1. **No TLS anywhere.** Everything is plain HTTP (`xpenses.nt-automation.eu:3001`/`:8001`, `CORS_ALLOWED_ORIGINS` are `http://`). JWTs ride in cookies over an unencrypted connection — trivially sniffable on the same network. Need a reverse proxy (Caddy is easiest — auto Let's Encrypt — or nginx + certbot) terminating HTTPS on 443, then set `COOKIE_SECURE=true` and switch CORS/API URLs to `https://`.
2. **`SEED_DEMO_USERS=true` in the live `.env`**, seeding `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, `mod1/mod1` — trivial-password accounts with real roles (including `chef_finance`/`mod`) on the production database. Flip to `false` and create real accounts with strong passwords for the colleagues currently testing.
3. **`docker-compose.override.yml` is present on the server** and (a) publishes Postgres `5432` to the host network and (b) mounts local build dirs over the backend image for hot-swap. That's a dev convenience file — if it's still applying on the "final server," Postgres is reachable from the LAN with the default `xpenses/xpenses` credentials, and the running container isn't actually the committed image. Confirm whether this file is in use on the production host; if so, remove it there and rebuild clean.
4. **`SPRING_PROFILES_ACTIVE=prod` is never set anywhere** — the JSON structured-logging profile already built in `backend-kotlin-jpa/src/main/resources/logback-spring.xml` is dead code right now; the dev/colorized console profile is running in production instead. Set it in `.env`/compose.
5. **Postgres password is the literal default `xpenses`** in both `.env` and `docker-compose.yml` (hardcoded, not even templated from `.env` for the `db` service). Rotate it and keep it out of the compose file (env-file only).

## 🟡 Should fix soon

6. **Backups exist but aren't scheduled.** `scripts/backup-db.sh` works but there's no crontab entry — nothing is actually running it. Add a daily cron (and ideally ship the dumps off-host, not just to local disk).
7. **No off-box artifact storage** — `xpenses-data` (receipts) and `pgdata` are local Docker volumes on a single server. One disk failure loses both the DB and every receipt. At minimum, back up the data volume alongside the DB dump; consider migrating receipt storage to the already-built S3 provider.
8. **Swagger/OpenAPI UI is publicly reachable** (`/swagger-ui/**`, `/v3/api-docs/**` are `permitAll` in `SecurityConfig.kt`) — fine for internal testing, but exposes the full API surface to anyone who finds the URL. Gate it behind `mod` role or disable in prod.
9. **9 stale AI-audit scratch files** (`glm52.md`, `hermes.md`, `mino25.md`, `nemotron.md`, `todo.md`, `kotlin_migration_plan.md`, `TOKEN_OPTIMIZATION.md`, `reasonix.toml`, `test.kts`) sitting at repo root — already flagged in HANDOFF.md since session 94, still untouched. Not a security issue, just repo hygiene worth clearing before calling this "production."
10. **No external monitoring/alerting.** `/actuator/health` and a Prometheus endpoint are exposed, but nothing scrapes or alerts on them. Even a simple uptime check (UptimeRobot/healthchecks.io hitting `/api/health`) would catch outages before users report them.

## 🟢 Worth a look, lower urgency

- `JWT_SECRET` doubles as `ENCRYPTION_SECRET` (LDAP/OCR/IMAP/storage config encryption) since `.env` never sets the latter — rotating `JWT_SECRET` for a security incident would also silently break decryption of stored credentials. Set a separate `ENCRYPTION_SECRET`.
- No resource alerting on the container memory/CPU limits already defined in compose — if OCR or PDF generation spikes, you'll only find out when something OOMs.
- Single-server deployment (frontend, backend, DB, OCR sidecar all on one box) — fine for "a few colleagues," but worth knowing this is the blast radius until scaling out.
