# Technology Stack

**Analysis Date:** 2026-08-14

## Languages

**Primary:**
- Kotlin 2.4.0 (JVM target 21) - All backend services, controllers, repositories, and domain models (`backend-kotlin-jpa/src/main/kotlin/`)
- TypeScript 5.x - Frontend application code, components, hooks, and API clients (`frontend/app/`, `frontend/components/`, `frontend/lib/`)

**Secondary:**
- SQL (PostgreSQL dialect) - Database schema definitions and Flyway migration scripts (`backend-kotlin-jpa/src/main/resources/db/migration/`)
- JavaScript/Node.js (ESM/CJS) - Frontend build configuration and tooling scripts (`frontend/eslint.config.mjs`, `frontend/postcss.config.js`, `scripts/check-i18n-parity.mjs`)
- Bash/Makefile - Local orchestration, build workflows, and CI scripting (`Makefile`, `.github/workflows/ci.yml`)

## Runtime

**Environment:**
- Backend: Java 21 (Eclipse Temurin 21 JDK/JRE) - configured via Gradle Java toolchain in `backend-kotlin-jpa/build.gradle.kts` and container runtime in `backend-kotlin-jpa/Dockerfile`
- Frontend: Node.js 22.x (Node 22.11.0 Alpine) - configured in `frontend/Dockerfile` and `.github/workflows/ci.yml`
- Native Compilation (Optional): GraalVM Native Image via `org.graalvm.buildtools.native` (0.10.4) in `backend-kotlin-jpa/build.gradle.kts` and `backend-kotlin-jpa/Dockerfile.native`

**Package Manager:**
- Backend: Gradle Wrapper (`gradlew`, Gradle 8.x) - `backend-kotlin-jpa/build.gradle.kts`
- Frontend: npm (Lockfile: `frontend/package-lock.json` present)

## Frameworks

**Core:**
- Spring Boot 3.4.5 (`org.springframework.boot`) - Core backend microservice framework (`backend-kotlin-jpa/build.gradle.kts`)
- Next.js 16.2.12 (App Router with Turbopack support) - Frontend SSR, SSG, and client UI routing (`frontend/package.json`, `frontend/next.config.ts`)
- React 19.0.0 & React DOM 19.0.0 - Frontend UI rendering engine (`frontend/package.json`)

**Testing:**
- JUnit 5 / JUnit Jupiter (`org.springframework.boot:spring-boot-starter-test`) - Backend unit and integration test runner
- Spring Security Test (`org.springframework.security:spring-security-test`) - Authentication and authorization slice testing
- Testcontainers 1.21.0 (`org.testcontainers:postgresql`, `org.testcontainers:junit-jupiter`) - Isolated containerized PostgreSQL database testing
- Playwright 1.61.1 (`@playwright/test`) - Frontend end-to-end and cross-browser testing (`frontend/playwright.config.ts`, `frontend/tests/`)
- Axe Core (`@axe-core/playwright` 4.10.2) - Automated accessibility compliance testing

**Build/Dev:**
- Tailwind CSS 4.0.0 (`tailwindcss`, `@tailwindcss/postcss`, `postcss` 8.5.10) - Utility-first styling framework
- TypeScript 5.x (`frontend/tsconfig.json`) - Static type checking
- ESLint 10.8.0 (`eslint`, `@eslint/js`, `@next/eslint-plugin-next`) - Code style and static analysis
- GraalVM Native Build Tools 0.10.4 (`org.graalvm.buildtools.native`) - Ahead-of-Time (AOT) binary compilation
- Spring Boot DevTools (`org.springframework.boot:spring-boot-devtools`) - Development hot-reloading

## Key Dependencies

**Critical:**
- Spring Data JPA & Hibernate (`org.springframework.boot:spring-boot-starter-data-jpa`) - Object-relational mapping and repository abstractions (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/`)
- Spring Security 6.x (`org.springframework.boot:spring-boot-starter-security`) - Security filter chain, RBAC, and password hashing (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/SecurityConfig.kt`)
- JJWT 0.12.5 (`io.jsonwebtoken:jjwt-api`, `jjwt-impl`, `jjwt-jackson`) - JWT generation, signing, and validation (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/JwtTokenProvider.kt`)
- Flyway Core & PostgreSQL (`org.flywaydb:flyway-core`, `flyway-database-postgresql`) - Database schema migrations (`backend-kotlin-jpa/src/main/resources/db/migration/`)
- TanStack React Query 5.62.0 (`@tanstack/react-query`) - Client-side state synchronization and cached server fetching (`frontend/lib/queryKeys.ts`)
- React Hook Form 7.78.0 & Zod 4.4.3 (`react-hook-form`, `zod`, `@hookform/resolvers`) - Declarative form state management and schema validation
- next-intl 4.13.4 (`next-intl`) - Internationalization and localized translations (`frontend/i18n/`, `frontend/messages/`)

**Infrastructure:**
- PostgreSQL JDBC Driver (`org.postgresql:postgresql`) - Relational database connectivity
- Spring Data Redis (`org.springframework.boot:spring-boot-starter-data-redis`) - Redis client integration for distributed rate limiting and state
- Caffeine & JCache (`com.github.ben-manes.caffeine:caffeine`, `jcache`, `javax.cache:cache-api`) - In-memory caching layer (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/CacheConfig.kt`)
- AWS Java SDK S3 2.30.0 (`software.amazon.awssdk:s3`) - S3-compatible cloud object storage (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/storage/S3StorageProvider.kt`)
- Spring Boot Starter Mail (`org.springframework.boot:spring-boot-starter-mail` / Jakarta Mail) - IMAP email parsing and SMTP delivery (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/EmailImportService.kt`)
- OpenPDF 2.0.3 (`com.github.librepdf:openpdf`) & Apache PDFBox 3.0.2 (`org.apache.pdfbox:pdfbox`) - PDF export generation, report stamping, and parsing (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/PdfService.kt`)
- Apache POI 5.3.0 (`org.apache.poi:poi-ooxml`) - Excel export generation (`backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ExportService.kt`)
- SpringDoc OpenAPI 2.6.0 (`org.springdoc:springdoc-openapi-starter-webmvc-ui`) - OpenAPI 3 / Swagger documentation (`/swagger-ui/index.html`)
- Micrometer Prometheus (`io.micrometer:micrometer-registry-prometheus`) & Actuator - Production health probes and Prometheus metrics (`/actuator/prometheus`)
- Logstash Logback Encoder 7.4 (`net.logstash.logback:logstash-logback-encoder`) - Structured JSON logging (`backend-kotlin-jpa/src/main/resources/logback-spring.xml`)
- Axios 1.7.9 (`axios`) - HTTP client with refresh token interceptor (`frontend/lib/api.ts`)
- Lucide React 0.469.0 (`lucide-react`) - Iconography library
- Sharp 0.35.3 (`sharp`) - Server-side image optimization

## Configuration

**Environment:**
- Configured via environment variables and `.env` file (template: `.env.example`, orchestration: `docker-compose.yml`)
- Backend variables: `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_SECRET`, `REDIS_URL`, `CORS_ALLOWED_ORIGINS`, `SPRING_PROFILES_ACTIVE`, `SWAGGER_ENABLED`
- Frontend variables: `NEXT_PUBLIC_API_URL` (browser-accessible API URL), `INTERNAL_API_URL` (internal container proxy URL), `NODE_ENV`
- Profiles: `dev` (default local configuration in `backend-kotlin-jpa/src/main/resources/application.yml`) and `prod` (hardened production overrides in `backend-kotlin-jpa/src/main/resources/application-prod.yml`)

**Build:**
- `backend-kotlin-jpa/build.gradle.kts` - Gradle project build definition
- `backend-kotlin-jpa/src/main/resources/application.yml` & `application-prod.yml` - Spring Boot properties
- `backend-kotlin-jpa/src/main/resources/logback-spring.xml` - Logback logging configuration
- `frontend/next.config.ts` - Next.js config (standalone output, API rewrites proxy, CSP security headers)
- `frontend/tsconfig.json` - TypeScript configuration
- `frontend/postcss.config.js` - PostCSS configuration
- `frontend/playwright.config.ts` - Playwright test runner settings
- `docker-compose.yml` - Multi-container development and deployment stack

## Platform Requirements

**Development:**
- Linux, macOS, or Windows with Docker & Docker Compose
- Java 21 JDK & Node.js 22.x (when running outside containerized environment)
- Local backing services: PostgreSQL 16 (`postgres:16-alpine`), Redis 7.4 (`redis:7.4-alpine`)

**Production:**
- Containerized environment (Docker Compose or Kubernetes via `backend-kotlin-jpa/deployment.yaml`)
- Multi-stage Docker builds (`backend-kotlin-jpa/Dockerfile`, `frontend/Dockerfile`)
- Backend container runs as unprivileged `appuser` (port 8080)
- Frontend container runs as unprivileged `nextjs` in standalone mode (port 3000)
- External reverse proxy / load balancer for TLS termination

---

*Stack analysis: 2026-08-14*
*Update after major dependency changes*
