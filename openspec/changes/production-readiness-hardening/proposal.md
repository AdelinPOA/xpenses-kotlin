## Why

A full end-to-end audit scored the project at **64/100 production-readiness**. The application is feature-complete but ships with P0 crash/auth-bypass bugs, P1 data-integrity gaps (missing `@Transactional` on `@Version`-protected rows, half-implemented features), unguarded demo-admin seeding, a public-default JWT secret, dev-mode frontend containers, and a CI pipeline that never runs the 10 existing test files. This change closes every P0 and P1 finding from the audit so the project can be deployed behind a VPN with confidence, and lays the groundwork (CI tests, observability deps) for ongoing hardening.

## What Changes

- **Fix 6 P0 crash/auth-bypass bugs**: React hooks violation crashing `/admin/storage`; missing role guard on `/admin/receipts` (destructive endpoint exposed to all users); `SecurityConfig` URL rule blocking `GET /api/users` for `manager`/`chef_finance`; `manager` IDOR on receipt/PDF/ZIP downloads; storage-file-deleted-before-DB-row race; `PdfService` daily-allowance hardcoded to `50.0` while the JSON API uses the configurable rate.
- **Harden secrets & seeding**: `JWT_SECRET` has no default and fails fast at startup if unset; `DataInitializer` seeds demo admin accounts only when `SEED_DEMO_USERS=true`; `signaturePath` removed from `UserResponse` (replaced with `hasSignature` boolean); Gemini API key moved from URL query string to `x-goog-api-key` header.
- **Add `@Transactional` to all mutating endpoints**: currently ~20 multi-write endpoints lack transaction boundaries, including `PATCH /reports/{id}` and `POST /reports/{id}/sign` which mutate `@Version`-protected rows (optimistic locking silently disabled).
- **Expand request validation**: bean-validation annotations (`@NotBlank`, `@Min`, `@Size`, `@Pattern`) on every request DTO; `ValidationExceptionHandler` extended to handle `ConstraintViolationException`, `HttpMessageNotReadableException`, `MissingServletRequestParameterException`.
- **Fix 8 frontend defects**: add `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`; add role gates to `/advances` and `/categories`; fix dead deeplinks (`/reports?status=draft`, `/expenses?category_id=X`); replace hover-only export dropdowns with click+keyboard menus; clear `setTimeout` leaks; replace `<a href>` internal links with `<Link>`; normalize error extraction to read Spring's `message`/`error` fields.
- **Production-ize Docker stack**: frontend `Dockerfile` switched to multi-stage `npm run build && npm run start` (currently runs `npm run dev`); non-root `USER` added to `ocr-sidecar`, `mineru`, `frontend` Dockerfiles; `healthcheck` added to `backend` and `frontend` services; entire-repo bind-mount removed from `backend`; PostgreSQL and OCR sidecar ports unexposed externally; resource limits added.
- **Wire CI to run tests + add security scanning**: `ci.yml` currently only runs `./gradlew bootJar` despite 10 test files existing; add `./gradlew test`, frontend `tsc --noEmit` + `npm run build`, Trivy image scan, CodeQL, gitleaks.
- **Fix observability misconfiguration**: add `micrometer-registry-prometheus` dependency (the endpoint is exposed but the registry is missing); add `logback-spring.xml` with JSON encoder for prod profile.
- **Decide on IMAP polling**: either add a `@Scheduled` job calling `processIncomingEmail` (currently dead code) or remove the IMAP config endpoints + simulation UI.

## Capabilities

### New Capabilities
- `critical-bugfixes`: P0 backend logic/security bugs — SecurityConfig GET /api/users filter, manager receipt-download IDOR, delete-order race (DB-before-storage), PdfService daily-allowance hardcode, @Transactional on @Version endpoints.
- `secrets-and-seeding-hardening`: JWT-secret no-default fail-fast, SEED_DEMO_USERS gating, signaturePath info-disclosure fix, Gemini key header migration.
- `frontend-defects`: storage page hooks crash, receipts role guard, error/not-found boundaries, role gates on advances/categories, dead deeplinks, hover dropdowns, setTimeout leaks, error extraction normalization.
- `docker-prod-hardening`: non-root containers, healthchecks, frontend prod build, repo bind-mount removal, port unexposure, resource limits, base-image pinning.
- `ci-test-observability`: CI test execution, frontend build/lint, security scanning, Prometheus registry dependency, structured logging config.
- `imap-polling-resolution`: either ship a scheduled IMAP poller or remove the half-built feature.

### Modified Capabilities
- `bean-validation`: expand validation from 4 DTOs to all request DTOs; extend exception handler coverage to all 400-cause exceptions.
- `configurable-storage`: implement the stubbed `scanOrphans`/`cleanOrphans` endpoints (or remove the UI buttons).

## Impact

- **Backend**: `SecurityConfig.kt`, `DataInitializer.kt`, `JwtTokenProvider.kt`, `CryptoService.kt`, `application.yml`, `UserResponse.kt`, `ValidationExceptionHandler.kt`, all 8 non-health controllers (transaction + validation annotations), `PdfService.kt`, `OcrService.kt`, `ExpenseController.kt` (delete order), `EmailImportService.kt`/scheduler or removal, new `V5__constraints.sql` Flyway migration (NOT NULL/CHECK/indexes).
- **Frontend**: `app/admin/storage/page.tsx`, `app/admin/receipts/page.tsx`, `app/advances/page.tsx`, `app/categories/page.tsx`, new `app/error.tsx`/`global-error.tsx`/`not-found.tsx`, `lib/api.ts` (error extraction + types), 3 export-dropdown components, `ExpenseForm.tsx`, `profile/signature/page.tsx`, `admin/imap/page.tsx`.
- **DevOps**: `docker-compose.yml`, `frontend/Dockerfile`, `ocr-sidecar/Dockerfile`, `mineru/Dockerfile`, `deployment.yaml`, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`, new `logback-spring.xml`, `build.gradle.kts` (micrometer + rate-limit deps).
- **Dependencies added**: `micrometer-registry-prometheus`, `bucket4j-spring-boot-starter` (rate limiting), `logstash-logback-encoder`. Versions upgraded: `next` 15.1.0→15.1.6+, `axios` 1.7.9→1.8.x, pinned base images.
- **No intentional API contract breaks**: `signaturePath` removal from `UserResponse` is the only wire-format change (replaced by `hasSignature`); the frontend already uses optional chaining.
