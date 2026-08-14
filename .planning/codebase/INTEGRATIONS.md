# External Integrations

**Analysis Date:** 2026-08-14

## APIs & External Services

**AI & OCR Receipt Extraction:**
- Google Gemini AI API (`generativelanguage.googleapis.com`) - Automated OCR receipt, invoice, and bill data extraction (merchant, amount, currency, tax, dates, expense categories)
  - SDK/Client: REST API via Spring `RestClient` with JDK `HttpClient` in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt`
  - Auth: Google AI API Key passed via `x-goog-api-key` header (stored encrypted in database via `CryptoService`)
  - Supported Models: Model fallback chain (`gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3-flash`, `gemini-2.5-flash`)
  - Caching: SHA-256 content-hash based caching in PostgreSQL `ocr_result_cache` table to eliminate duplicate provider calls

**Exchange Rates & Foreign Exchange:**
- National Bank of Romania (BNR) FX API (`www.bnr.ro/files/xml/years/nbrfxrates{year}.xml`) - Primary foreign exchange rate source for RON/EUR and multi-currency conversions
  - Integration method: XML feed fetch via `RestClient` and XML DOM parsing in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/FxRateProvider.kt`
  - Auth: None (public XML data)
- Frankfurter / European Central Bank (ECB) FX API (`api.frankfurter.dev/v2/rate/...`) - Fallback foreign exchange rate provider
  - Integration method: REST API via `RestClient` with JSON deserialization in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fx/FxRateProvider.kt`
  - Auth: None (public open API)

**Email Ingestion & Messaging:**
- IMAP Mail Servers - Automated receipt and delegation email polling and ingestion
  - SDK/Client: Jakarta Mail / `jakarta.mail` in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt`
  - Auth: Service credentials (username/password or OAuth) stored encrypted in database
  - Protocol: IMAP / IMAPS (port 993/143) with periodic polling scheduled task (`imap.poll-interval`)
- SMTP Email Servers - Transactional notifications and email dispatches
  - SDK/Client: Spring Boot Starter Mail (`JavaMailSender`) in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailSettingsService.kt`
  - Auth: SMTP host/port/credentials configured via database app settings

## Data Storage

**Databases:**
- PostgreSQL 16 (`postgres:16-alpine`) - Primary relational database for all application entities, users, audit logs, and settings
  - Connection: JDBC connection via `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` (default: `jdbc:postgresql://db:5432/xpenses`)
  - Client: Spring Data JPA / Hibernate (`org.hibernate.dialect.PostgreSQLDialect`)
  - Migrations: Flyway (`backend-kotlin-jpa/src/main/resources/db/migration/` - 32 versioned migration scripts `V1` through `V100`)

**Caching & Transient State:**
- Redis 7.4 (`redis:7.4-alpine`) - Distributed rate limiting and session/token storage
  - Connection: `REDIS_URL` (default: `redis://redis:6379` in Docker, `redis://localhost:6379` in dev)
  - Client: Spring Data Redis / Lettuce
- Caffeine Cache - In-memory local cache for FX rates and fast repository lookups
  - Client: `com.github.ben-manes.caffeine:caffeine` / `jcache`

**File & Receipt Storage:**
- S3-Compatible Cloud Storage (AWS S3, MinIO, Ceph, etc.) - Remote object storage for expense receipts and user signatures
  - SDK/Client: AWS Java SDK v2 S3 (`software.amazon.awssdk:s3` 2.30.0) in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/S3StorageProvider.kt`
  - Auth: AWS IAM Static Credentials (`accessKeyId`, `secretAccessKey`, `region`, `endpointOverride`)
  - Buckets: Configured bucket name
- Local File System Storage - Default local storage provider for file attachments and generated reports
  - Implementation: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/LocalStorageProvider.kt`
  - Mount Location: `/app/data/receipts`, `/app/data/signatures` mounted via Docker volume `xpenses-data`

## Authentication & Identity

**Authentication Providers:**
- Local Database Authentication - Username and hashed password verification (BCrypt / PBKDF2 via Spring Security)
  - Token storage: HttpOnly, Secure, SameSite cookies for access (`access_token`) and refresh (`refresh_token`) tokens
  - Session management: Stateless JWT authentication with server-tracked refresh token revocation (`RefreshTokenRepository`)
- LDAP / Active Directory Integration - Enterprise directory authentication and user synchronization
  - Implementation: Java Naming and Directory Interface (`javax.naming.directory.InitialDirContext` / `LdapCtxFactory`) in `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/LdapService.kt`
  - Connection: `ldap://` or `ldaps://` (TLS) to configured directory host/port
  - Features: Service account binding, user search, DN binding authentication, scheduled/on-demand user attribute & role synchronization (`technician`, `manager`, `chef_finance`, `mod`)

## Monitoring & Observability

**Metrics & Health:**
- Spring Boot Actuator (`/actuator/health`, `/actuator/info`) - Container liveness and readiness probes
  - Liveness probe: `/actuator/health/liveness` (or `/api/health`)
  - Readiness probe: `/actuator/health/readiness`
- Prometheus Metrics (`/actuator/prometheus`) - JVM, HTTP request throughput, latency, and system performance metrics
  - Integration: Micrometer Prometheus registry (`io.micrometer:micrometer-registry-prometheus`)

**Logs:**
- Logstash Logback Encoder (`net.logstash.logback:logstash-logback-encoder:7.4`) - Structured JSON logging in production mode (`SPRING_PROFILES_ACTIVE=prod`)
  - Configuration: `backend-kotlin-jpa/src/main/resources/logback-spring.xml`
  - Output: stdout / stderr container logs formatted for ingestion into ELK / Datadog / Loki

**API Documentation:**
- Swagger UI / OpenAPI 3.0 (`/swagger-ui/index.html`, `/v3/api-docs`)
  - Implementation: SpringDoc OpenAPI Starter WebMVC UI 2.6.0
  - Controlled by environment flag: `SWAGGER_ENABLED=true/false`

## CI/CD & Deployment

**Hosting & Orchestration:**
- Docker Compose - Multi-container stack definition in `docker-compose.yml` (`db`, `redis`, `backend`, `frontend`)
- Kubernetes - Production deployment manifest in `backend-kotlin-jpa/deployment.yaml` with rolling update strategy and resource constraints

**CI Pipeline:**
- GitHub Actions - Continuous integration workflow in `.github/workflows/ci.yml`
  - `gitleaks`: Automated secret scanning across git commit history
  - `build-kotlin`: JDK 21 Temurin setup, Gradle compilation, and backend unit/integration tests
  - `build-frontend`: Node 22 setup, type check (`tsc --noEmit`), i18n parity check, ESLint, Next.js build, and Playwright mobile/a11y tests
  - `build-docker`: Container image compilation test via `docker compose build`

## Environment Configuration

**Development:**
- Required env vars: `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_SECRET`, `NEXT_PUBLIC_API_URL`, `INTERNAL_API_URL`
- Template: `.env.example` (safe defaults for local docker / localhost development)
- Secrets location: Local `.env` file (gitignored)

**Production:**
- Secrets management: Environment variables injected via Docker Compose `.env` or Kubernetes Secrets (`db-secret`, `jwt-secret`, etc.)
- Strict validation: `application-prod.yml` disables default fallback passwords/salts, enforces strict Flyway schema validation, and enables secure cookie flags

## Webhooks & Callbacks

**Incoming:**
- None currently (system uses scheduled polling for IMAP email ingestion and client-initiated REST calls)

**Outgoing:**
- External REST queries to Google Gemini API (`generativelanguage.googleapis.com`) on receipt scan requests
- External XML/REST queries to BNR (`www.bnr.ro`) and Frankfurter (`api.frankfurter.dev`) for FX rate resolution
- S3 API uploads/downloads to configured object store

---

*Integration audit: 2026-08-14*
*Update when adding/removing external services*
