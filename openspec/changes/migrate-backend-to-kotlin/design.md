## Context

The current backend is written in Python (FastAPI + asyncpg) and runs under the `backend` container service. To consolidate the tech stack to a high-performance JVM-based native architecture, we are migrating all services to Kotlin + Spring Boot 3.4.3 + Spring Data JPA. We have already established a GraalVM native image boilerplate under `backend-kotlin-jpa` that boots in sub-second time. This design outlines how the remainder of the features (Authentication, Expenses CRUD, Reports State Machine, LDAP integration, IMAP ingestion, OCR scanning, Mileage, and PDF generation) will be migrated to Spring Boot.

## Goals / Non-Goals

**Goals:**
- Port 100% of the FastAPI business logic, API endpoints, and database queries to Kotlin.
- Establish Spring Security with JWT cookie-based filters to match the frontend authentication expectations.
- Integrate Spring Data JPA with PostgreSQL, using custom repositories to execute eager `JOIN FETCH` queries to avoid N+1 query loops.
- Configure Flyway migrations to manage the database schema programmatically.
- Maintain full compatibility with the existing Next.js frontend, ensuring port `8001` serves the new Kotlin backend.

**Non-Goals:**
- Redesigning the database tables or modifying the business workflows (the state machine, rules, and mileage rates remain unchanged).
- Modifying the frontend application logic or interface code.

## Decisions

### 1. Web MVC Stack vs. WebFlux
- **Decision**: Spring Web (Servlet MVC) with Spring Data JPA.
- **Rationale**: While reactive WebFlux/R2DBC was considered, Spring Data JPA with standard transactions is much simpler, more mature, and less prone to concurrency bugs in data-heavy transaction code. Eager fetching is handled cleanly via HQL `JOIN FETCH`.
- **Alternatives**: Spring WebFlux + R2DBC (discarded due to reactive driver limitations, complexity, and missing full JPA mature features).

### 2. Authentication & Session Security
- **Decision**: Spring Security with custom JWT Filter reading HTTP-only cookies.
- **Rationale**: The existing frontend expects `access_token` (15 min) and `refresh_token` (7 days) cookies. A custom filter `JwtAuthenticationFilter` will intercept requests, parse the cookies, validate the signature using the configured `JWT_SECRET`, and populate the SecurityContext.
- **Alternatives**: Spring Security OAuth2 resource server (overkill for simple local/cookie JWT authentication).

### 3. Database Migration Management
- **Decision**: Flyway Migration.
- **Rationale**: Since we are getting rid of the Python environment entirely, we will drop Alembic and use Flyway. Flyway integrates natively with Spring Boot, executes SQL files on startup, and is fully compatible with GraalVM Native Image compilation.
- **Alternatives**: Keep Alembic (rejected because it would force us to retain a Python execution environment solely for database migrations).

### 4. IMAP Email Ingestion & OCR Integration
- **Decision**: Spring Integration Mail (for IMAP listening) and hybrid HTTP clients (for Gemini API OCR). EasyOCR will be offloaded to a minimal Python OCR helper container (or run via subprocess) if local OCR is enabled.
- **Rationale**: Native Java IMAP clients are robust and performant. Gemini structured JSON calling will be handled using Spring's `RestClient` or `WebClient` pointing to the Generative Language API.

### 5. PDF Generation
- **Decision**: OpenPDF (LibrePDF) and Apache PDFBox.
- **Rationale**: Replaces python's `reportlab` and `pypdf`. OpenPDF is a clean, open-source fork of iText that allows rich document generation, logo rendering, signatures, and merging existing receipt PDFs.

## Risks / Trade-offs

- **[Risk]**: GraalVM Native Image reflection errors for dynamic libraries (e.g., JWT signing, Flyway, LDAP bindings).
  - *Mitigation*: Register all reflection-bound libraries and classes in the custom `reflect-config.json` file.
- **[Risk]**: Hibernate N+1 query loops in complex loops.
  - *Mitigation*: Enable Hibernate SQL logging (`show-sql: true`) in tests and write custom repository queries using `@Query("SELECT DISTINCT r FROM Report r LEFT JOIN FETCH r.expenses")` to fetch data structures in single SQL rounds.
