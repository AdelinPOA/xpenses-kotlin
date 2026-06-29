# Technology Stack

**Analysis Date:** 2026-06-29

## Languages

**Primary:**
- Kotlin 2.4.0 - Backend (Spring Boot JPA)
- TypeScript 5 - Frontend and type checking

**Secondary:**
- JavaScript (Node.js 22.11.0) - Frontend runtime
- Java 21 - JVM bytecode compilation target (Kotlin compiles to JVM)
- SQL - Database DDL/DML via Flyway migrations

## Runtime

**Environment:**
- JDK 21 (Eclipse Temurin) - Backend Kotlin/Spring Boot
- Node.js 22.11.0 - Frontend (Next.js)
- PostgreSQL 16 (Alpine) - Primary database

**Package Manager:**
- Gradle 8.x (Kotlin DSL) - Backend dependency management and build
- npm - Frontend dependency management
- Lockfiles: `package-lock.json` (frontend), Gradle wrapper (backend)

## Frameworks

**Core:**
- Spring Boot 3.4.5 - Backend REST framework (Spring MVC, not WebFlux)
- Spring Data JPA + Hibernate - ORM for PostgreSQL
- Next.js 15.5.18 - Frontend SSR and build framework
- React 19.0.0 - Frontend UI framework

**Authentication & Security:**
- Spring Security 6.x - Request filtering, role guards
- JJWT 0.12.5 - JWT token generation and validation
- Custom `JwtAuthenticationFilter` - Per-request token validation via `access_token` cookie

**Testing:**
- JUnit 5 - Test framework for Kotlin backend
- Spring MockMvc - HTTP endpoint testing
- Testcontainers 1.21.0 - Ephemeral PostgreSQL for integration tests

**Build & Dev:**
- Gradle bootJar - Spring Boot executable JAR
- GraalVM buildtools 0.10.4 - Native image compilation (optional)
- Flyway 8.x - Database schema migrations
- Spring Boot DevTools - Hot-reload during development
- Turbopack - Frontend bundler (Next.js 15)

## Key Dependencies

**Critical:**
- `spring-boot-starter-web` - HTTP server, REST controllers
- `spring-boot-starter-data-jpa` - ORM abstraction
- `spring-boot-starter-security` - Authentication and authorization
- `org.postgresql:postgresql` - PostgreSQL JDBC driver
- `org.jetbrains.kotlin:kotlin-reflect` - Kotlin reflection support (required by Spring)

**Storage & File Handling:**
- `com.github.librepdf:openpdf:2.0.3` - PDF generation (iText fork, open-source)
- `org.apache.pdfbox:pdfbox:3.0.2` - PDF parsing and merging
- `org.apache.poi:poi-ooxml:5.3.0` - Excel/CSV export
- `software.amazon.awssdk:s3:2.30.0` - AWS S3 storage provider

**Infrastructure & Observability:**
- `io.micrometer:micrometer-registry-prometheus` - Prometheus metrics endpoint
- `net.logstash.logback:logstash-logback-encoder:7.4` - Structured JSON logging
- `com.giffing.bucket4j.spring.boot.starter:bucket4j-spring-boot-starter:0.12.8` - Rate limiting
- `com.github.ben-manes.caffeine:caffeine` - In-memory caching (Caffeine)
- `javax.cache:cache-api:1.1.1` - JCache API for caching

**API Documentation:**
- `springdoc-openapi-starter-webmvc-ui:2.6.0` - Swagger/OpenAPI docs endpoint

**Frontend:**
- `@tanstack/react-query:^5.62.0` - Data fetching and caching
- `axios:^1.7.9` - HTTP client (with credentials for cookie auth)
- `react-hook-form:^7.78.0` - Form state management
- `zod:^4.4.3` - Runtime schema validation
- `tailwindcss:^4.0.0` - CSS framework (CSS-first config)
- `lucide-react:^0.469.0` - Icon library

**Styling:**
- `@tailwindcss/postcss:^4.0.0` - PostCSS plugin for Tailwind v4
- `postcss:^8.5.10` - CSS post-processing

## Configuration

**Environment Variables (Backend):**
- `JWT_SECRET` - Signing key for access tokens (also used as default for `ENCRYPTION_SECRET`)
- `ENCRYPTION_SECRET` - Key for subsystem-specific encryption (LDAP pw, Gemini API key, storage credentials)
- `SPRING_DATASOURCE_URL` - PostgreSQL JDBC connection URL
- `SPRING_DATASOURCE_USERNAME` - PostgreSQL user
- `SPRING_DATASOURCE_PASSWORD` - PostgreSQL password
- `CORS_ALLOWED_ORIGINS` - Comma-separated list of allowed origins (default: localhost:3001)
- `COMPANY_NAME` - Organization name in reports (default: "Newtech Automation")
- `SEED_DEMO_USERS` - Boolean; seed test accounts on startup (default: false)
- `IMAP_POLL_INTERVAL` - IMAP polling interval in milliseconds (default: 300000 = 5 min)

**Environment Variables (Frontend):**
- `NEXT_PUBLIC_API_URL` - Public API base URL (sent to browser)
- `INTERNAL_API_URL` - Internal container-to-container API URL (used server-side)
- `NODE_ENV` - Node environment (production/development)

**Backend Config File:**
- `backend-kotlin-jpa/src/main/resources/application.yml` - Spring Boot properties, database, JWT expiry, rate limiting

**Build Configuration:**
- `backend-kotlin-jpa/build.gradle.kts` - Gradle dependencies, JDK 21 toolchain, GraalVM native config
- `frontend/package.json` - npm scripts, dev/prod dependencies, Next.js config (minimal, CSS-first)

## Platform Requirements

**Development:**
- JDK 21+ (Kotlin 2.4.0 requires JDK 21 as floor)
- Node.js 22.11.0+
- Docker + Docker Compose (for PostgreSQL + multi-container orchestration)
- 8 GB RAM minimum (Gradle build + PostgreSQL + Node dev server)

**Production:**
- JRE 21 (for standard JVM) or GraalVM 23+ native (via `Dockerfile.native`)
- Node.js 22+ runtime (for Next.js server)
- PostgreSQL 16
- 4 GB RAM minimum per service (Docker resource limits: backend 2GB, frontend 1GB, DB 1GB)

**Container Images:**
- Backend: `eclipse-temurin:21-jre-alpine` (runtime), `eclipse-temurin:21-jdk-alpine` (build)
- Frontend: `node:22.11.0-alpine`
- Database: `postgres:16-alpine`
- Reverse Proxy: `caddy:2-alpine` (HTTPS + Let's Encrypt ACME, currently disabled due to firewall)

---

*Stack analysis: 2026-06-29*
