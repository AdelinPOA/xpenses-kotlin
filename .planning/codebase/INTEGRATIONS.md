# External Integrations

**Analysis Date:** 2026-06-29

## APIs & External Services

**Gemini (Google Generative AI):**
- Service: Google's generative AI API for OCR via vision models
- What it's used for: Receipt image parsing and expense extraction
- SDK/Client: `spring-boot-starter-web` + native `RestClient` (Spring Framework 6.0+)
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{modelName}:generateContent`
- Auth: API key via `x-goog-api-key` header
- Config location: Encrypted in `app_settings` table under key `ocr_config` → field `gemini_api_key`
- Encryption: HKDF-SHA256 derived from `ENCRYPTION_SECRET` with info label `xpenses-gemini-ocr-pw`
- Model fallback chain (multi-tier): `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash` → `gemini-2.5-flash`
- Implementation: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt` (lines 45-50, 141-200+)

**Frankfurter (Currency Exchange Rates):**
- Service: Open-source currency conversion API
- What it's used for: EUR conversion for multi-currency expense reports
- SDK/Client: Native `RestClient` (Spring HTTP)
- Endpoint: `https://api.frankfurter.dev/v1/{date}?from={currency}&to=EUR`
- Auth: None (public API)
- Fallback: `fawazahmed0/currency-api` (via jsDelivr CDN) if Frankfurter is unavailable
  - Endpoint: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/{currency}.min.json`
  - Latest fallback: `https://latest.currency-api.pages.dev/v1/currencies/{currency}.min.json`
- Caching: Per-currency, per-date in `fx_rates` table (JPA entity `FxRate`)
- Implementation: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/FxService.kt` (lines 42-80+)
- Timeout: 10s connection, 30s read

## Data Storage

**Databases:**

- **PostgreSQL 16** (primary)
  - Connection: JDBC via `org.postgresql:postgresql` driver
  - URL: `jdbc:postgresql://{SPRING_DATASOURCE_URL:localhost:5432/xpenses}`
  - User/Pass: `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`
  - ORM: Hibernate + Spring Data JPA
  - Schema management: Flyway (`src/main/resources/db/migration/V1-V16`)
  - Dialect: PostgreSQL

- **App Settings Table** (`app_settings` — key/value JSON store)
  - Stores encrypted config for subsystems: OCR, LDAP, IMAP, storage
  - Decryption via `CryptoService` with subsystem-specific `info` labels
  - Keys: `ocr_config`, `ldap_config`, `imap_config`, `storage_config`, `storage_migration_status`, `mileage_rate_*`, `daily_allowance_rate`

- **FX Rates Cache** (`fx_rates` table)
  - Caches `(from_currency, to_currency, rate_date, rate)` tuples
  - Prevents repeated external API calls for same date/currency pair

- **OCR Jobs Table** (`ocr_jobs` — async status tracking)
  - Tracks in-flight Gemini OCR requests
  - Client polls endpoint (`/api/ocr/{jobId}`) for completion
  - Result persisted to `ocr_comparisons` table (Gemini vs. manual entry comparison)

**File Storage:**

- **Local Filesystem** (default)
  - Path: `/app/data/receipts/` (inside named volume `xpenses-data` in Docker)
  - Used for receipt images, expense PDFs, report ZIPs
  - Fallback directory if remote provider unavailable

- **AWS S3** (optional remote provider)
  - SDK: `software.amazon.awssdk:s3:2.30.0`
  - Config keys in `storage_config` (encrypted): `region`, `bucket`, `access_key_id`, `secret_key`, `endpoint`
  - Encryption: HKDF-SHA256 derived from `ENCRYPTION_SECRET` with info label `xpenses-storage-settings`
  - Supported operations: upload, download, delete
  - Fallback: If remote unavailable, reads/writes local cache first
  - Implementation: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/S3StorageProvider.kt`

- **Future Providers** (stubbed, not implemented)
  - SFTP, SMB (Samba), WebDAV
  - Config layer ready; provider logic not yet written

**Caching:**

- **Caffeine In-Memory Cache**
  - Lib: `com.github.ben-manes.caffeine:caffeine` + JCache API
  - Used for: Spring Cache abstraction, rate-limit counters (bucket4j)
  - Config: `cache-type: jcache` in `application.yml`

## Authentication & Identity

**Auth Provider:**
- Custom implementation via Spring Security + JWT

**JWT Flow:**
- Generation: `JwtTokenProvider.kt` (JJWT 0.12.5)
- Token placement: `access_token` cookie (httpOnly, secure in production)
- Validation: `JwtAuthenticationFilter.kt` runs on every request
  - Reads cookie → validates signature → decodes claims → loads full `User` entity from DB
  - Sets `SecurityContext` + request attribute `currentUser` for controller use
- Expiry: `jwt.access-expires-minutes` (default 15)
- Secret: `JWT_SECRET` environment variable (HMAC-SHA256)

**Alternative Authentication** (supported):
- LDAP (optional, pluggable via `LdapService.kt`)
  - Config stored encrypted in `app_settings` → `ldap_config`
  - Bind credentials encrypted with `ENCRYPTION_SECRET` + info label `xpenses-ldap-pw`
  - Fallback to local database if LDAP unavailable
- Email (IMAP delegation import, secondary feature)

**Role-Based Access Control:**
- Roles: `user`, `manager`, `mod` (administrator), `chef_finance` (finance lead)
- URL-level guards via `@PreAuthorize` in `SecurityConfig.kt`
- Data-scoping: Controllers/services filter by `currentUser` role
- Soft-delete: Org-owned records not visible across organizations (if multi-tenant model added)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Rollbar, etc.)
- Logs written to `stdout` via Logback

**Logs:**
- Framework: Logback (Spring Boot default)
- Format: JSON structured logging via `logstash-logback-encoder:7.4`
- Output: Container `stdout` (Docker logs capture)
- Log levels: Configured in `logback-spring.xml`

**Metrics:**
- Framework: Micrometer (Spring Boot native)
- Endpoint: `/actuator/prometheus` (Prometheus-compatible format)
- Health checks: `/actuator/health` (Spring Boot standard)
- Included: JVM memory, HTTP request counts, response times

**Rate Limiting:**
- Library: bucket4j 0.12.8
- Config: `application.yml` `bucket4j` section
- Protected endpoints:
  - `/api/auth/login` — 10 requests per minute per IP
  - `/api/auth/refresh` — 5 requests per minute per IP
- Backend: JCache (Caffeine-backed)

## CI/CD & Deployment

**Hosting:**
- Docker Compose (development and production)
- Caddy reverse proxy (HTTPS termination, Let's Encrypt ACME) — currently firewall-blocked on port 80, bypassed for now
- Ports:
  - Frontend: 3001 (host) → 3000 (container)
  - Backend: 8001 (host) → 8080 (container)
  - PostgreSQL: 5432 (host) ↔ 5432 (container)
  - Caddy HTTP/HTTPS: 80/443 (host) (disabled temporarily)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`)
- Triggers: Push or PR to `main`
- Steps:
  1. **gitleaks** — secrets scan
  2. **build-kotlin** — JDK 21, `./gradlew test bootJar --no-daemon`
  3. **build-frontend** — Node.js 22, `npm ci`, `tsc --noEmit`, `npm run lint`, `npm run build`
  4. **build-docker** — `docker compose build` (builds all images)

**Build Output:**
- Backend: `build/libs/backend-microservice-1.0.0-SNAPSHOT.jar` (Spring Boot executable JAR)
- Frontend: `.next/standalone/` (Next.js optimized output)
- Docker images: `xpenses-backend:latest`, `xpenses-frontend:latest`

**Deployment Process:**
- Standard: Deploy via `docker compose up -d` with `.env` file secrets
- Production: Caddy handles HTTPS (when port 80 reachable); otherwise reverse-proxy via load balancer
- Database: Flyway runs migrations automatically on backend startup

## Environment Configuration

**Required env vars (production):**
- `JWT_SECRET` — At least 32 chars, strong entropy (HMAC key)
- `ENCRYPTION_SECRET` — At least 32 chars (HKDF master key for subsystems)
- `SPRING_DATASOURCE_PASSWORD` — PostgreSQL password
- `CORS_ALLOWED_ORIGINS` — Production frontend domain

**Optional env vars:**
- `SEED_DEMO_USERS` — Set to `true` only in dev/staging
- `COMPANY_NAME` — Org name in reports
- `IMAP_POLL_INTERVAL` — Email import polling (ms, default 5 min)

**Secrets location:**
- Development: `.env` file (Git-ignored, created locally)
- Production: Environment variables injected via container orchestration (Kubernetes secrets, Docker Swarm, etc.)
- Never committed to git

**SSL/TLS:**
- Development: None (HTTP only, localhost)
- Production: Caddy automatic via Let's Encrypt (requires port 80 internet-reachable)
- Alternative: Reverse-proxy behind nginx/ALB with external cert management

## Webhooks & Callbacks

**Incoming:**
- None currently. System is request-response only.

**Outgoing:**
- None currently. No third-party webhook integrations.

**Async Tasks:**
- IMAP polling: `EmailImportService` runs on scheduled interval (`IMAP_POLL_INTERVAL`, default 5 min)
- OCR job processing: `AsyncOcrService` runs Gemini requests off-thread via Spring `@Async`, persists results to DB

---

*Integration audit: 2026-06-29*
