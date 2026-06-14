## 1. Setup & Schema Migrations

- [x] 1.1 Configure Flyway migrations under `src/main/resources/db/migration/` to baseline the Postgres database schema (matching Alembic's baseline tables and indexes).
- [x] 1.2 Configure `application.yml` profiles and register GraalVM reflection configurations in `reflect-config.json` for database drivers and utility classes.

## 2. Models & JPA Repositories

- [x] 2.1 Migrate Pydantic models to Kotlin data classes and JPA entities, including `@Entity` mapping, `@ManyToOne`/`@OneToMany` relations, and JSON circular reference annotations.
- [x] 2.2 Implement Spring Data JPA repository interfaces for all domains (Users, Categories, Reports, Expenses, Receipts, FxRates, AppSettings, Advances, Mileage, RefreshTokens).
- [x] 2.3 Write custom JPQL/HQL queries using `@Query` with explicit `JOIN FETCH` to eagerly load child associations and prevent N+1 query problems.

## 3. Security, Authentication & Users

- [x] 3.1 Implement JWT token generation, parsing, and validation utility class `JwtTokenProvider`.
- [x] 3.2 Create `JwtAuthenticationFilter` to intercept HTTP-only cookies and set up authentication context.
- [x] 3.3 Configure Spring Security in `SecurityConfig` to restrict endpoints by role and expose login, logout, and token refresh endpoints.
- [x] 3.4 Implement local user registration, profile lookup, and role management under `/api/users` and `/api/auth/me`.

## 4. LDAP Active Directory Integration

- [x] 4.1 Implement `LdapService` to bind, search, authenticate directory users, and run the background directory sync.
- [x] 4.2 Expose the LDAP configuration and synchronization triggers under `/api/settings/ldap`.

## 5. Core Business Logic: Expenses & Reports

- [ ] 5.1 Implement the Expenses CRUD REST Controller, handling merchant, category, and date parameters.
- [ ] 5.2 Implement file validation and local disk storage management for receipt file uploads.
- [ ] 5.3 Implement the Reports REST Controller enforcing state machine validations: draft creation, recall, submission, manager approval, and paid status.
- [ ] 5.4 Implement the Advance Payments CRUD and org-wide approvals queue.
- [ ] 5.5 Implement Mileage records tracking and CFO-editable mileage rates management.

## 6. Email Ingestion, OCR & PDF Export

- [ ] 6.1 Implement `ImapService` to fetch and parse incoming delegating email forwards and simulate parses.
- [ ] 6.2 Implement `OcrService` to scan receipts using local OCR Python helper fallback or Google Gemini Flash AI with category prediction.
- [ ] 6.3 Implement `PdfService` to generate Zoho-style PDF reports, draw digital signature stamps, and merge receipt images/PDFs.

## 7. DevOps & E2E Validation

- [ ] 7.1 Write Spring Boot integration tests verifying authentication, reports workflow, and database queries.
- [ ] 7.2 Update `docker-compose.yml` to set the context of `backend` to `./backend-kotlin-jpa` and map port `8001:8080`.
- [ ] 7.3 Build the GraalVM native container, verify sub-second startup, and test the Next.js frontend on `localhost:3001` to ensure all pages function correctly.
