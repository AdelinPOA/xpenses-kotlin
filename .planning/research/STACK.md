# Recommended Stack for Future Backlog Work — Xpenses

> Historical research: references to root `todo.md` now refer to `docs/archive/root-md-2026-10-18/todo.md`. Its findings are not current verification; use `README.md` and the documentation-review reports before planning work.

**Mode:** Ecosystem
**Date:** 2026-08-04
**Ground truth:** `backend-kotlin-jpa/build.gradle.kts`, `frontend/package.json`, `.planning/codebase/STACK.md`

The stack is already defined and healthy (Kotlin 2.4 / Spring Boot 3.4.5 / Java 21, Next.js 16 + React 19 + TanStack Query, PostgreSQL 16, Flyway, Docker Compose, Playwright). This file recommends only what the future-backlog domains need. **Default position: use what is already in the build file; add a dependency only when a backlog item cannot be done well without it.**

---

## 1. Export (PDF / XLSX / CSV feedouts)

### Recommendation

| Need | Use | Why |
|------|-----|-----|
| XLSX feedouts (report, expenses, advances) | **Apache POI — keep, migrate `XSSFWorkbook` → `SXSSFWorkbook`** | Already in the build (`poi-ooxml:5.3.0`). Verified against POI sources: `XSSFWorkbook` buffers the whole workbook in memory; `SXSSFWorkbook(rowWindow)` streams with temp-file spill (POI's own 600k-row test uses `SXSSFWorkbook(100)`, `setCompressTempFiles(true)`). Fixes the unbounded-memory class of issues (`PdfService.kt:702-717`, bulk exports) without new infra. |
| PDF report | **OpenPDF + PDFBox — keep as-is** | Both already present (`openpdf:2.0.3`, `pdfbox:3.0.2`). No reason to introduce JasperReports — Xpenses reports are small structured documents, not pixel-perfect invoice batches; page-streaming fixes (merge in chunks, not whole-buffer) are cheaper than a reporting engine. |
| CSV feedout | **Hand-rolled writer — keep, standardize** | `ExportService.kt` already quotes per RFC 4180 and neutralizes `=+-@` formula injection. Keep it; add UTF-8 BOM for Excel, a fixed column contract, and `BigDecimal` scale policy (2 dp, HALF_UP). A CSV library adds nothing here. |
| Streamed HTTP download | **Spring MVC `StreamingResponseBody` / `ResponseBodyEmitter`** | Spring-native; avoids buffering export bytes in a `ByteArrayOutputStream` (current `ExportService.buildXlsx` returns `ByteArray`). |

### Considered and rejected

- **JasperReports** — heavyweight, template-licensing friction (AGPL/LGPL), overkill for fixed-shape report PDFs; OpenPDF suffices.
- **FastExcel / EasyExcel** — good streaming XLSX, but duplicates POI already in the tree; one exporter library is enough.
- **SAGA `.sag` native files** — proprietary format; the Romanian ecosystem moves data by **CSV/XLSX import templates** (Quick Importer for SAGA/WinMentor documents this). Export a documented column layout instead.

---

## 2. OCR (receipt data extraction)

### Recommendation

**Keep the Gemini multi-tier LLM OCR** (`OcrService.kt` fallback chain `gemini-3.1-flash-lite → 3.5-flash → 3-flash → 2.5-flash`) and fix the orchestration defects around it. LLM-based OCR sits in the top accuracy tier (~97–99% field-level on receipts per 2026 benchmarks; template OCR ~64%, Tesseract-class ~96% character on clean scans) and is already wired end-to-end with an `OcrResultCache`, comparison table, and async job queue.

- Fix the **advisory-lock-held-across-network** defect (todo.md high): hold `pg_advisory_xact_lock` only for the cache-fill critical section, not the whole 4-tier chain.
- Add **magic-byte validation** before any upload path and **result normalization** (fix the amount double-roundtrip precision loss — parse once to `BigDecimal`, then format for display only).
- Keep the result cache; make cache writes cheap (today cache hits also write `OcrComparison` + `lastUsedAt` — write amplification).
- Do **not** add Tesseract/tess4j as a permanent tier. Rationale: receipt variety (thermal tape, skewed photos, multi-language) is exactly where Tesseract is weakest; a self-hosted tier would be maintained for worse accuracy. Only revisit if receipt data residency rules forbid cloud OCR.

### Considered and rejected

- **Tesseract (tess4j)** — lower accuracy on messy receipt imagery, per-receipt CPU cost on the JVM, no currency/amount semantics without heavy post-processing; Gemini already outperforms it on this corpus.
- **Mindee / Veryfi / Klippa receipt APIs** — 99%+ claims, but a second paid provider with the same privacy profile as Gemini; no benefit over the existing integration.

---

## 3. Email (import + notifications)

### Recommendation

**Keep Jakarta Mail via `spring-boot-starter-mail`** (already present; drives SMTP out and IMAP in via `EmailImportService.kt`).

- **Inbound:** dedup on `Message-ID` (unique constraint — today a crash/retry duplicates drafts; todo.md medium) and a **sender-domain allowlist** mapped to known technicians. This is the phishing fix that matters for a single-org expense tool: the app should only accept receipts from mailboxes it can attribute to a user.
- **Outbound notifications:** fix the `@Async` self-invocation defect (`ReportLifecycleNotificationAdapter.kt` dispatches through `this`, so approver emails run on the HTTP thread) via self-injection (`@Lazy`) — or better, move notifications to the **transactional outbox** pattern (see Architecture) so email send happens after commit, exactly once.
- **DKIM signing** of outgoing mail with `net.markenwerk:utils-mail-dkim` when the org's mail relay doesn't sign (MEDIUM confidence — lightweight, Jakarta-Mail-compatible). **SPF/DMARC are DNS/infrastructure concerns** — document them, don't code them.
- Full **inbound SPF/DKIM verification in-app (SPF4J)** is a later hardening step, not a milestone requirement: the allowlist already covers the attack that matters (spoofed `From` creating expenses).

### Considered and rejected

- **GreenMail** — test-only utility; use it in tests for `EmailImportService` if coverage expands, not in production.
- **SubEthaSMTP / building an MX** — absurd for this product; the app polls an existing mailbox, it does not receive mail itself.

---

## 4. Security

### Recommendation

| Need | Use | Why |
|------|-----|-----|
| Rate limiting | **Bucket4j — keep** (already in build) | Fix the filter: key on `remoteAddr` only behind a known proxy (never trust `X-Forwarded-For` blindly), prune/expire the request-times map to kill the memory-leak DoS. |
| File download safety | **Spring `HttpHeaders` + magic-byte sniffing** | Replace echoed client `Content-Type` in `InsuranceController.kt` with server-side magic-byte → type mapping, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`. No new library. |
| CSRF | **Spring Security — fix config** | Exempt non-browser clients (`X-Requested-With`, `Authorization` header present) instead of 403-ing all state changes without `Origin`/`Referer`. |
| Token crypto | **jjwt — keep; fix derivation** | Derive legacy CBC/HMAC keys from a dedicated `encryption.secret`, add TTL validation on decrypt (`CryptoService.kt`). |
| Upload size | **Spring multipart `max-file-size` + `MaxUploadSizeExceededException → 413`** | Map the exception; enforce limits before buffering. |
| Headers | **Spring Security default headers** (CSP, HSTS, frame options) | Already available; nothing to buy. |

### Considered and rejected

- **New WAF / rate-limit product (e.g., Cloudflare, nginx limit_req)** — the fix is a code-level keying decision; adding a WAF now hides the defect instead of fixing it.
- **Keycloak / OAuth2 migration** — out of scope; JWT + Spring Security is functional; the backlog items are defects in the current setup, not an auth-model problem.

---

## 5. Concurrency & background jobs

### Recommendation

| Need | Use | Why |
|------|-----|-----|
| Notifications (email, lifecycle) | **Transactional outbox table + poller** (`@Scheduled`, existing pattern) | Emails must go out exactly once after commit; outbox is the standard, dependency-free Spring pattern for exactly-this. Fixes both the dead `@Async` and the "email before commit" class of bugs. |
| OCR jobs | **Existing `OcrJob` table pattern — keep; add reaper** | The job-table pattern already exists (`AsyncOcrService.kt`); add a stuck-job reaper (todo.md low) and a semaphore cap on sync `/scan` instead of trusting the queue cap only. |
| Concurrent report attachment | **Optimistic locking → 409 + atomic membership check** | Catch `OptimisticLockException` at the controller and make the "one report per expense" check atomic (DB unique constraint on the join); no framework change. |
| Rate/cache coordination | **PostgreSQL advisory locks, scoped tightly** | Keep advisory locks (already used) but bound them to the critical section only — the pool-exhaustion findings (`OcrService.kt:146-153`, `ExpenseService.kt:191`) are scope bugs, not tooling bugs. |

### Considered and rejected

- **JobRunr / Quartz / Spring Batch** — the pipeline is a handful of job shapes (OCR, export, mail, storage migration, IMAP poll). A job table + `@Scheduled` poller covers all of them without a scheduler dependency; add only if a future phase introduces true batch processing.
- **Redis/RabbitMQ** — single-instance containerized deployment; adding a broker for mail notifications is unjustified infrastructure.

---

## 6. Storage

### Recommendation

**Keep `StorageService` + `LocalStorageProvider`/`S3StorageProvider` (AWS SDK S3 already in build).**

- Add **path-style addressing for MinIO/self-hosted S3** (`S3Client.builder().endpointOverride(...).forcePathStyle(true)`) — without it the MinIO story is broken (todo.md low).
- **Reject unsupported provider types** (`smb`/`webdav`/`sftp` currently fall back to local silently — data lands where not intended). Either implement or fail fast with a config error.
- Fix **path-traversal containment in the local branch** (canonicalize + `startsWith(canonicalBase+sep)`), make the **storage migration idempotent with per-file progress + reaper**.
- Set `ContentType` on S3 objects; ensure client lifecycle (close) is handled.

### Considered and rejected

- **Azure Blob / GCS providers** — nothing in the backlog or deployment asks for them; S3-compatible already covers MinIO and cloud object stores.

---

## 7. Performance

### Recommendation (no new libraries — all fixes in existing frameworks)

- **JPA:** replace N+1 lazy loads with EntityGraphs (`receipts` on expense lists, `user`+collections on report lists, fetch graphs on advance lists) and mark read paths `@Transactional(readOnly = true)`; set `spring.jpa.open-in-view: false` to expose regressions.
- **SQL:** dashboard manager aggregation and search move to bounded SQL queries (aggregate + `Pageable`), not `findAll().take(10)`.
- **Pagination:** clamp `page`/`size` in controllers (negative page → 400/validation, size cap).
- **Frontend:** unify the React Query key factory (`queryKeys.ts`) — the server-prefetch key mismatch (todo.md high) doubles fetching on the expenses page; fix `list()` vs `list({})` normalization.

---

## 8. Frontend money/UX

### Recommendation

- **Money formatting:** keep `next-intl` (already used) but with an explicit `timeZone` and a Romanian-safe locale config (the `en-EU` invalid-locale defect defaults to US dates); format via `Intl.NumberFormat`/`next-intl` number formatting — never `parseFloat || 0`.
- **Dates:** format in the browser's zone with explicit `timeZone`, not UTC `toISOString()` slicing (off-by-one in negative-offset zones, SSR hydration mismatch).
- **Mutations:** disable submit buttons while pending (double-submit), surface `onError` banners in bulk-upload flows (currently silent failure — todo.md high), reset the drag-drop overlay counter inside the drop handler.

---

## Version-pinning note

New dependencies are only: `net.markenwerk:utils-mail-dkim` (email hardening, MEDIUM priority) and nothing else in the first instance. Everything else is configuration/fix work in existing libraries. Revisit OCR provider, JobRunr, and e-invoicing libraries only if the corresponding phases get explicitly scoped (see Research Flags in SUMMARY.md).