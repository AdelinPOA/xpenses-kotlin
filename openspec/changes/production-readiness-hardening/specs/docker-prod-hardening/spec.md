## ADDED Requirements

### Requirement: Frontend production container runs a built bundle, not dev server
`frontend/Dockerfile` SHALL use a multi-stage build: a builder stage runs `npm ci && npm run build` (producing `output: standalone`), and a runner stage executes `node server.js`. The compose override `npm run dev` SHALL be removed so the default `docker compose up` produces a production-optimized container.

#### Scenario: default compose up runs the production server
- **WHEN** `docker compose up -d --build` is run
- **THEN** the frontend container runs `node server.js` (not `next dev`) and serves minified, optimized assets

### Requirement: No container runs as root
The `ocr-sidecar`, `mineru`, and `frontend` Dockerfiles SHALL declare a non-root `USER`. The `backend` Dockerfile already uses `appuser` and SHALL remain non-root.

#### Scenario: OCR sidecar runs as non-root
- **WHEN** the `ocr-sidecar` container starts
- **THEN** the process runs as UID 1000 (not UID 0/root)

### Requirement: Healthchecks on backend and frontend services
`docker-compose.yml` SHALL define a `healthcheck` for the `backend` service (curl `/api/health`) and the `frontend` service (curl `/` or a TCP check). The `backend` service's `depends_on` for `ocr-sidecar` SHALL use `condition: service_healthy`.

#### Scenario: backend waits for OCR sidecar health
- **WHEN** `docker compose up` starts
- **THEN** the backend container does not mark itself ready until `ocr-sidecar` reports healthy

### Requirement: PostgreSQL and OCR sidecar not exposed externally
The `db` service SHALL NOT map port 5432 to the host. The `ocr-sidecar` service SHALL NOT map port 8004 to the host. Internal container-network access SHALL remain available.

#### Scenario: external client cannot reach the database
- **WHEN** a client outside the Docker host attempts to connect to `localhost:5432`
- **THEN** the connection is refused

### Requirement: Repository-wide bind mount removed from backend
The `docker-compose.yml` backend service SHALL NOT bind-mount the entire repository directory. Receipt storage SHALL use the named `xpenses-data` volume only.

#### Scenario: backend container cannot read .env or .git
- **WHEN** the backend container inspects its filesystem
- **THEN** the host `.env`, `.git/`, and `venv/` directories are not present

### Requirement: Resource limits on all compose services
Each service in `docker-compose.yml` SHALL declare `mem_limit` and `cpus` (or `deploy.resources`) to prevent unbounded resource consumption.

#### Scenario: backend memory capped
- **WHEN** the backend attempts to exceed its configured memory limit
- **THEN** the container is OOM-killed and restarted (not allowed to consume host memory)

### Requirement: Base images pinned by digest
All Dockerfiles and `docker-compose.yml` image references SHALL pin base images by SHA256 digest (or at minimum exact version tag), not floating tags like `:latest` or bare `:alpine`.

#### Scenario: postgres image is digest-pinned
- **WHEN** `docker-compose.yml` declares the `db` image
- **THEN** the tag includes a SHA256 digest (e.g. `postgres:16-alpine@sha256:...`)
