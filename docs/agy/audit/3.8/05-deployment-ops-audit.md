# Deployment and Operations Production Audit

## Scope and Evidence Standard

This is a comprehensive, evidence-based deployment, infrastructure, container, and operational audit of the Xpenses application. The audit was conducted by inspecting configuration files, Dockerfiles, compose definitions, environment files, GitHub Actions workflows, shell scripts, and Spring Boot / Next.js runtime configurations.

Every finding below is substantiated by exact file paths, line references, and configuration snippets. Each finding is classified by risk, operational impact, and required remediation.

---

## Deployment Surface Inventory

| Component | Path / Reference | Configuration / Responsibility |
|---|---|---|
| **Compose Orchestration** | `docker-compose.yml` | Defines `db` (Postgres 16 Alpine), `redis` (Redis 7.4 Alpine), `backend` (Spring Boot 3.4), and `frontend` (Next.js 16). Bridge network `xpenses-net`, local volumes `pgdata`, `redisdata`, `xpenses-data`. |
| **Backend Container** | `backend-kotlin-jpa/Dockerfile` | Two-stage Alpine build using Eclipse Temurin JDK 21 and JRE 21. Non-root user `appuser:appgroup` (privilege drop via `su-exec`), volume chown on entrypoint. |
| **Frontend Container** | `frontend/Dockerfile` | Two-stage Alpine build using Node 22.11.0. Next.js standalone output, non-root user `nextjs:nodejs` (UID 1001). |
| **Environment Config** | `.env.example`, `.env` | Environment variables for JWT, encryption, CORS, DB credentials, profiles, and API URLs. |
| **Compose Override Example**| `docker-compose.override.yml.example` | Local development port overrides (`8080:8080`, `3000:3000`). |
| **Database Backup** | `scripts/backup-db.sh` | Shell script invoking `pg_dump -Fc` against `xpenses-db`. Targets `/backups` directory. 90-day retention cleanup. |
| **Continuous Integration** | `.github/workflows/ci.yml` | Triggers on `push`/`pull_request` to `main`. Jobs: `gitleaks` (secrets scan), `build-kotlin` (`./gradlew test bootJar`), `build-frontend` (`tsc`, `i18n:check`, `lint`, `build`, `playwright`), `build-docker` (`docker compose build`). |
| **Logging Configuration** | `backend-kotlin-jpa/src/main/resources/logback-spring.xml` | Dev console logger; prod JSON console logger using Logstash encoder. |
| **Application Runtime Config** | `backend-kotlin-jpa/src/main/resources/application.yml`, `application-prod.yml` | Spring datasource, JPA, Redis cache, multipart size (10MB), cookie flags, rate limiting, and actuator endpoints. |

---

## Findings

### OPS-001 — Hardcoded Production Secrets and Predictable Defaults in Docker Compose and Repository

- **ID:** OPS-001
- **Severity:** Critical
- **Area:** Ops / Security
- **Confidence:** Confirmed by inspection of repository configuration files.
- **Evidence:**
  - `docker-compose.yml:53–58`:
    ```yaml
    - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/${DB_NAME:-xpenses}
    - SPRING_DATASOURCE_USERNAME=${DB_USER:-xpenses}
    - SPRING_DATASOURCE_PASSWORD=${DB_PASSWORD:-xpenses}
    - SEED_DEMO_USERS=${SEED_DEMO_USERS:-true}
    - REDIS_URL=${REDIS_URL:-redis://redis:6379}
    ```
  - In `docker-compose.yml`, if an operator runs `docker compose up -d` without an explicitly populated `.env` file containing cryptographically secure overrides, the database initializes with username `xpenses` and password `xpenses`.
  - When evaluating `docker compose config` on this host, concrete production values were resolved directly from `.env`:
    `JWT_SECRET: mUQyHChRTL3ZEzcnM5oeDBFg7YKwurla`, `ENCRYPTION_SECRET: UUtrnTNtx+PEARl53niORA47DClwG4QSey9d0ZNmlfI=`, `JWT_SALT: 4c8a1f6e9b2d7f3a5c0e8b1d6f9a2c7e3b5d0f8a4c6e1b9d7f2a5c8e0b3d6`.
- **User Impact / Production Risk:** If the repository `.env` is committed, leaked, or deployed with default passwords, attackers can trivially forge JWT tokens, decrypt database secrets (such as LDAP/SMTP passwords encrypted via AES-GCM), or connect directly to PostgreSQL.
- **Recommended Fix:**
  1. Remove all fallback default passwords from `docker-compose.yml` (change `${DB_PASSWORD:-xpenses}` to `${DB_PASSWORD:?DB_PASSWORD must be set}`).
  2. Enforce strict pre-flight validation in entrypoints or scripts that halts startup if default or short secrets are detected.
  3. Rotate all keys currently present in `.env` immediately.
  4. Ensure `.env` is permanently ignored by Git and verify no historical `.env` commits exist in git log.
- **Acceptance Criteria:** `docker compose config` or `docker compose up` fails immediately with an informative error if `DB_PASSWORD`, `JWT_SECRET`, or `ENCRYPTION_SECRET` are unset or set to well-known default values.
- **Suggested Tests:** Run `env -i docker compose config` without `.env` and verify syntax validation fails on missing required secrets.
- **Dependencies or Sequencing:** Phase 0 stop-ship gate.

---

### OPS-002 — Backend and Frontend Directly Expose Ports to All Network Interfaces (0.0.0.0)

- **ID:** OPS-002
- **Severity:** High
- **Area:** Ops / Security
- **Confidence:** Confirmed by `docker-compose.yml` port mappings.
- **Evidence:**
  - `docker-compose.yml:46–47`:
    ```yaml
    ports:
      - "8001:8080"
    ```
  - `docker-compose.yml:87–88`:
    ```yaml
    ports:
      - "3001:3000"
    ```
- **User Impact / Production Risk:**
  - On Linux hosts running Docker, Docker manipulates `iptables` directly, which punches through UFW/firewall rules by default.
  - Exposing `"8001:8080"` and `"3001:3000"` binds both services to `0.0.0.0` (all public and private host IP addresses).
  - External network actors can send requests directly to the Spring Boot backend at `http://<server-ip>:8001/api`, completely bypassing Cloudflare, reverse proxies (Nginx/Traefik/Caddy), HTTPS TLS encryption, Web Application Firewalls (WAF), and custom proxy headers.
  - Because `COOKIE_SECURE=true` requires HTTPS, plain HTTP requests to port 8001 can trigger unpredictable auth and cookie rejections, or expose unencrypted session traffic if cookies are transmitted over plaintext HTTP.
- **Recommended Fix:**
  - Bind exposed ports strictly to `127.0.0.1`:
    ```yaml
    ports:
      - "127.0.0.1:8001:8080"
      - "127.0.0.1:3001:3000"
    ```
  - Alternatively, remove host port publishing altogether for the backend and rely entirely on reverse-proxy container networking (e.g. an ingress container sharing `xpenses-net`).
- **Acceptance Criteria:** `netstat -tlpn` or `ss -tlpn` shows ports 8001 and 3001 listening exclusively on `127.0.0.1` and unreachable from external interfaces.
- **Suggested Tests:** Attempt to connect to port 8001 from a separate subnet or non-loopback host interface and confirm connection refusal.
- **Dependencies or Sequencing:** Phase 0 stop-ship gate.

---

### OPS-003 — Production Default SEED_DEMO_USERS=true Initializes Hardcoded Accounts

- **ID:** OPS-003
- **Severity:** High
- **Area:** Ops / Security
- **Confidence:** Confirmed in `docker-compose.yml` and `DataInitializer.kt`.
- **Evidence:**
  - `docker-compose.yml:56`:
    ```yaml
    - SEED_DEMO_USERS=${SEED_DEMO_USERS:-true}
    ```
  - `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/DataInitializer.kt:47–110`:
    When `SEED_DEMO_USERS` is `"true"`, the application automatically seeds accounts:
    `admin`, `manager`, `user` (technician), `approver`, `finance`, with well-known default passwords (e.g. `admin123`, `user123`, etc.).
- **User Impact / Production Risk:** In any deployment where `SEED_DEMO_USERS` is omitted or defaulted, the production instance creates fully privileged administrative and finance accounts with publicly known passwords, granting instant full compromise.
- **Recommended Fix:**
  - Change default in `docker-compose.yml` to:
    `- SEED_DEMO_USERS=${SEED_DEMO_USERS:-false}`
  - In `DataInitializer.kt`, add an explicit check: if `spring.profiles.active` contains `prod`, refuse to seed demo users unless an explicit override flag `ALLOW_DEMO_USERS_IN_PRODUCTION=true` is set.
- **Acceptance Criteria:** In production profile, demo accounts are never created by default.
- **Suggested Tests:** Spin up container with `SPRING_PROFILES_ACTIVE=prod` and verify database contains zero demo users.
- **Dependencies or Sequencing:** Phase 0 stop-ship gate.

---

### OPS-004 — Incomplete Backup Strategy: scripts/backup-db.sh Ignores Receipt Files and Has Zero Restore Script

- **ID:** OPS-004
- **Severity:** High
- **Area:** Ops / Data Integrity
- **Confidence:** Confirmed by inspecting `scripts/backup-db.sh` and filesystem.
- **Evidence:**
  - `scripts/backup-db.sh:16`:
    ```bash
    docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" -Fc "${DB_NAME}" > "${FILEPATH}"
    ```
  - Receipts, invoices, and signature PNGs are stored in the Docker volume `xpenses-data` (`/app/data/receipts` and `/app/data/signatures`), specified in `docker-compose.yml:65`.
  - `backup-db.sh` backs up only PostgreSQL relational rows. It completely omits the `/app/data` volume.
  - There is NO restore script (`scripts/restore-db.sh` does not exist).
  - There is no scheduled cron job, systemd timer, or off-site synchronization (e.g., S3/B2 backup sync).
- **User Impact / Production Risk:** In a disaster recovery event (e.g. host disk corruption or ransomware), restoring the database backup results in a catastrophic split-state: financial expense rows and reports will exist in the database, but all receipt proofs and signature images will 404. Technicians and finance will suffer permanent proof-of-purchase loss, invalidating tax audit compliance.
- **Recommended Fix:**
  1. Expand backup procedure into an atomic snapshot mechanism that backs up both PostgreSQL dump AND a compressed tarball of the `/app/data` volume.
  2. Implement and test `scripts/restore-db.sh` that validates backup integrity and restores both the database and files.
  3. Include backup verification (`pg_restore --list` sanity check).
  4. Provide documentation and an automated cron/systemd service configuration.
- **Acceptance Criteria:** A full disaster restore drill successfully recovers all database rows and serves valid receipt images from the restored volume.
- **Suggested Tests:** Execute backup, wipe local database and data directory, run restore script, and verify image download for an existing expense.
- **Dependencies or Sequencing:** Phase 4 disaster recovery gate.

---

### OPS-005 — Redis Container Runs Without Password Authentication on Shared Bridge Network

- **ID:** OPS-005
- **Severity:** Medium
- **Area:** Ops / Security
- **Confidence:** Confirmed by `docker-compose.yml` redis service definition.
- **Evidence:**
  - `docker-compose.yml:25–38`:
    ```yaml
    redis:
      image: redis:7.4-alpine
      container_name: xpenses-redis
      command: ["redis-server", "--appendonly", "yes"]
      volumes:
        - redisdata:/data
      networks:
        - xpenses-net
    ```
  - Backend connects using `REDIS_URL=${REDIS_URL:-redis://redis:6379}` without password.
- **User Impact / Production Risk:** Any container connected to `xpenses-net` (or any SSRF vulnerability in backend/frontend) has unauthenticated read/write access to Redis. Attackers can flush rate limiting data (`FLUSHALL`), manipulate rate limit counters, or inject malicious cached values.
- **Recommended Fix:**
  - Configure Redis with `requirepass ${REDIS_PASSWORD}`:
    `command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"]`.
  - Update `REDIS_URL` to `redis://:${REDIS_PASSWORD}@redis:6379`.
- **Acceptance Criteria:** `redis-cli ping` without `AUTH` returns `NOAUTH Authentication required`.
- **Suggested Tests:** Attempt unauthenticated Redis commands and verify rejection.
- **Dependencies or Sequencing:** Phase 4 ops hardening.

---

### OPS-006 — Docker Compose Lacks Log Rotation Policy, Permitting Unbounded Disk Exhaustion

- **ID:** OPS-006
- **Severity:** Medium
- **Area:** Ops / Reliability
- **Confidence:** Confirmed by `docker-compose.yml`.
- **Evidence:**
  - Neither `docker-compose.yml` nor individual services define `logging` options.
  - In Docker's default `json-file` logging driver without configuration, container logs (`/var/lib/docker/containers/<id>/<id>-json.log`) grow indefinitely until host disk space is completely exhausted.
  - With production JSON logging active in `logback-spring.xml` and Next.js request logging, high-traffic expense upload and OCR polling can generate gigabytes of logs per month.
- **User Impact / Production Risk:** Silent disk fill leading to sudden host freeze, database write failures (Postgres crash on disk full), and complete outage.
- **Recommended Fix:**
  - Add default logging options across all services in `docker-compose.yml`:
    ```yaml
    x-logging: &default-logging
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
    ```
  - Attach `logging: *default-logging` to `db`, `redis`, `backend`, and `frontend`.
- **Acceptance Criteria:** Inspecting running containers via `docker inspect` shows `MaxFile: 5` and `MaxSize: 50m`.
- **Suggested Tests:** Verify `docker inspect <container> --format '{{.HostConfig.LogConfig}}'` output.
- **Dependencies or Sequencing:** Phase 4 ops hardening.

---

### OPS-007 — Missing Distributed Request Tracing and MDC Correlation ID Across Services

- **ID:** OPS-007
- **Severity:** Medium
- **Area:** Ops / Observability
- **Confidence:** Confirmed by searching backend and frontend codebases for `MDC`, `X-Request-Id`, or correlation headers.
- **Evidence:**
  - `backend-kotlin-jpa/src/main/resources/logback-spring.xml:23–29`:
    ```xml
    <fieldNames>
        <timestamp>timestamp</timestamp>
        <level>level</level>
        <logger>logger</logger>
        <message>message</message>
        <thread>thread</thread>
    </fieldNames>
    ```
  - No `requestId`, `correlationId`, or `traceId` field is included in the JSON logstash encoder.
  - No servlet filter populates `org.slf4j.MDC` with an incoming `X-Request-ID` or generates a UUID.
  - Neither `frontend/lib/api.ts` nor `frontend/next.config.ts` passes or traces `X-Request-ID`.
- **User Impact / Production Risk:** In production triage, when a technician encounters an intermittent OCR failure, upload error, or financial calculation mismatch, ops cannot correlate the frontend network failure with backend log lines or database transactions. Every log line exists in isolation.
- **Recommended Fix:**
  1. Add a Spring `OncePerRequestFilter` that reads `X-Request-ID` from the incoming request (or generates a UUID) and puts it in `MDC["requestId"]`.
  2. Add `requestId` to `logback-spring.xml` JSON fields.
  3. Include `X-Request-ID` in all API responses.
  4. Have the frontend Axios client generate and propagate `X-Request-ID` on all requests.
- **Acceptance Criteria:** Every backend log entry contains a `requestId` field that matches the client error telemetry.
- **Suggested Tests:** Send a request with `X-Request-ID: test-12345` and verify backend logs output `"requestId":"test-12345"`.
- **Dependencies or Sequencing:** Phase 4 observability.

---

### OPS-008 — Next.js NEXT_PUBLIC_* Variables Decoupled from Runtime Docker Compose Environment

- **ID:** OPS-008
- **Severity:** Medium
- **Area:** Ops / Frontend
- **Confidence:** Confirmed in `frontend/Dockerfile:8` and `docker-compose.yml:91`.
- **Evidence:**
  - `frontend/Dockerfile` executes `RUN npm run build` during image construction.
  - In Next.js, any environment variable prefixed with `NEXT_PUBLIC_` is inlined into the client-side JavaScript bundle **at build time**.
  - In `docker-compose.yml:91`, `NEXT_PUBLIC_API_URL=https://xpenses.nt-automation.cc/api` is passed as a **runtime** environment variable to the container.
  - Runtime environment variables passed to `docker run` or `docker compose` are NOT reflected in the pre-compiled client bundle unless server-side runtime injection or reverse rewrites are used.
- **User Impact / Production Risk:** Deploying the built frontend container to a different domain, staging environment, or private IP without rebuilding the image can cause the client bundle to make requests to the wrong origin or fail silently.
- **Recommended Fix:** Rely consistently on the Next.js reverse rewrite (`/api/:path*` -> `INTERNAL_API_URL`) for all client-side requests (as already implemented in `api.ts:3`), and remove dependency on client-inlined `NEXT_PUBLIC_API_URL`.
- **Acceptance Criteria:** Client JavaScript makes all requests relative to `/api` without requiring domain-specific compile-time baking.
- **Suggested Tests:** Run frontend container against a mock backend on an arbitrary host and confirm API calls route via `/api`.
- **Dependencies or Sequencing:** Phase 4 ops cleanup.

---

### OPS-009 — JVM Container Ergonomics: Missing Memory Percent Flags and GC Tuning

- **ID:** OPS-009
- **Severity:** Medium
- **Area:** Ops / Performance
- **Confidence:** Confirmed in `backend-kotlin-jpa/Dockerfile:43` and `docker-compose.yml:72`.
- **Evidence:**
  - `docker-compose.yml:72` sets a hard container memory limit:
    ```yaml
    limits:
      cpus: '8.0'
      memory: 2048M
    ```
  - `backend-kotlin-jpa/Dockerfile:43` starts the JVM without explicit memory flags:
    ```dockerfile
    ENTRYPOINT ["sh", "-c", "chown -R appuser:appgroup /app/data 2>/dev/null || true; exec su-exec appuser java -cp /app/unpacked org.springframework.boot.loader.launch.PropertiesLauncher"]
    ```
- **User Impact / Production Risk:**
  - Without `-XX:MaxRAMPercentage`, the OpenJDK JVM in container cgroups can allocate heap based on default percentages (often 25% or 50%), leaving insufficient heap for heavy OCR image processing or high concurrency.
  - Conversely, without bounded off-heap / Metaspace limits, thread stacks + JVM native memory + heap can exceed the 2048MB container cgroup limit, causing the Linux kernel OOM killer to immediately terminate the backend (`SIGKILL`, exit code 137) during peak reporting or bulk upload periods.
- **Recommended Fix:**
  - Add explicit JVM ergonomics flags in `JAVA_TOOL_OPTIONS` or the Dockerfile `ENTRYPOINT`:
    `-XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -XX:+ExitOnOutOfMemoryError`
- **Acceptance Criteria:** The JVM respects container memory boundaries and cleans up gracefully without sudden unlogged cgroup OOM kills.
- **Suggested Tests:** Execute high-concurrency receipt uploads and inspect JVM memory metrics via Actuator.
- **Dependencies or Sequencing:** Phase 4 performance/ops.

---

### OPS-010 — CI Pipeline Bypasses Authenticated Mobile E2E Tests and Lacks Container Integration Verification

- **ID:** OPS-010
- **Severity:** High
- **Area:** Ops / CI
- **Confidence:** Confirmed by inspecting `.github/workflows/ci.yml`.
- **Evidence:**
  - `.github/workflows/ci.yml:92–99`:
    ```yaml
    - name: Run mobile UI and accessibility tests
      env:
        PLAYWRIGHT_USER: ${{ secrets.PLAYWRIGHT_USER }}
        PLAYWRIGHT_PASSWORD: ${{ secrets.PLAYWRIGHT_PASSWORD }}
        PLAYWRIGHT_AUTHENTICATED_UI: "false"
      run: |
        cd frontend
        npm run test:e2e:mobile
    ```
  - In `frontend/tests/mobile-ui.spec.ts:53`, the entire authenticated suite is guarded by:
    `test.skip(!authenticatedUiEnabled || !username || !password, ...)`
  - Out of 36 tests defined in `mobile-ui.spec.ts`, 35 are skipped in CI. Only the unauthenticated login accessibility test runs.
  - In `.github/workflows/ci.yml:110–120`, `build-docker` runs `docker compose build`, but never starts the containers, never waits for healthchecks, and never executes smoke tests against the running container stack.
- **User Impact / Production Risk:** Regressions in mobile flows, bottom navigation, sidebar trapping, expense creation, and dashboard layout are never caught in CI. Container startup failures (such as Flyway migration crashes or missing volume permissions) are only discovered upon actual deployment.
- **Recommended Fix:**
  1. Set up a full end-to-end integration step in CI: start Postgres and Redis services, launch the backend, and run the complete authenticated Playwright suite with `PLAYWRIGHT_AUTHENTICATED_UI="true"`.
  2. In `build-docker`, add a container smoke test: `docker compose up -d`, wait for healthchecks to pass, curl `/api/health`, and tear down.
  3. Add automated dependency vulnerability scanning (`npm audit --audit-level=high` and `./gradlew dependencyCheckAnalyze` or Trivy).
- **Acceptance Criteria:** CI runs all 36 Playwright mobile tests and verifies that the container composition passes healthchecks before merge.
- **Suggested Tests:** Inspect GitHub Actions run log to confirm 0 skipped tests in `test:e2e:mobile`.
- **Dependencies or Sequencing:** Phase 3 CI gates.
