# TODO — Audit Remediation (from hermes.md)

Source: `hermes.md` (Opus 4.8 + Hermes + GLM-5.2 passes). Status legend:
`[✅ verified]` proven/read-confirmed · `[⚠️ unverified]` reported, confirm before fixing · `[ ]` not started.

---

## P0 — Critical / security (do first)

- [x] **C0** `ReportService.kt:278` — add V17 migration allowing `'paid'` in `chk_expenses_status`; harden pay test to flush. `[✅ verified — proven via Testcontainers]`
- [x] **C6** `StorageService.kt:117,128,137` — replace `absoluteFile`+`startsWith` with `canonicalFile` containment check; confirm upstream filename sanitization strips `..`. `[✅ verified — guard non-functional]`
- [x] **C1** `EmailImportService.kt:535` — add `@Transactional` (and `@Async`) to scheduled IMAP polling. `[⚠️ unverified]`
- [x] **C3** `EmailImportService.kt:274` — move Gemini API key from `?key=` query param to `x-goog-api-key` header. `[⚠️ unverified]`
- [x] **C5** `OcrService.kt:180,570` — allowlist-validate `mineruUrl`/`baseUrl` (SSRF). `[⚠️ unverified]`
- [x] **C2** `ReportService.kt:107` — replace `.get()` with `.orElseThrow { ResponseStatusException(NOT_FOUND) }`. `[⚠️ unverified]`
- [x] **C7** `UserController.kt:96,121` — `as User` → `as? User ?: throw ResponseStatusException(...)`. `[⚠️ unverified]`

## P1 — High

- [x] **C9** `OcrService.kt:392,404,416` — replace `ForkJoinPool` `runAsync` with `@Async("ocrTaskExecutor")`. `[⚠️ unverified]`
- [x] **C8** `EmailImportService.kt:402` — add `findByEmailIgnoreCase()`, drop `findAll()` scan. `[⚠️ unverified]`
- [x] **C10** `ReportController.kt:481-495` — replace `System.err.println` with `log.warn`; surface uncomputed allowance instead of silent `0.0`. `[⚠️ unverified]`
- [x] **H0a / H0b** `ReportService.kt:260` + `ExpenseController.kt:278,317` — fix `mod`-can-pay and manager receipt-download IDOR inconsistency. `[✅ verified]`
- [x] **H0c** `ReportService.kt:259` — block self-payment (mirror approve/reject self-check). `[✅ verified]`
- [x] **H0d** `Repositories.kt:80` — add deterministic `ORDER BY e.date DESC, e.id DESC` to paged query. `[✅ verified]`
- [x] **H0e** `ExpenseForm.tsx:138,156,171` — fix error swallowing (`e.message`) to prevent duplicate-expense re-submit. `[⚠️ unverified]`
- [x] **H0f / H0g** `LdapService.kt:230` + `S3StorageProvider.kt:65` — close `ctx`/`ResponseInputStream` via `use {}`. `[⚠️ unverified]`
- [x] **H10** `AsyncOcrService.kt:38-43` — persist `failed` status in a `REQUIRES_NEW` tx. `[⚠️ unverified]`
- [x] **H11** `OcrService.kt:109` + `FxService.kt:14` + `EmailImportService.kt:32` — add HTTP connect/read timeouts. `[⚠️ unverified]`
- [x] **H3** Frontend (9 files) — replace `<a href={API_BASE_URL/...}>` with Axios blob download (`downloadBlob` exists). `[⚠️ unverified]`
- [x] **H4** `ExpenseForm.tsx:251` — OCR poll: max-retry + timeout + `AbortController`. `[⚠️ unverified]`
- [x] **H5** `AuthController.kt:183` — invalidate access token on password change (`tokenVersion`). `[⚠️ unverified]`
- [x] **H6** `ReportService.kt:127` — move SMTP send out of `@Transactional` (`@Async`). `[⚠️ unverified]`
- [x] **H7** `InsuranceController.kt:108,176` + `ExpenseController.kt:184,207,255` — replace `!!` on `transactionTemplate.execute`. `[⚠️ unverified]`
- [x] **H8** `ReportService.kt:232` — reconcile `totalAmount=0.0` between reject and recall. `[⚠️ unverified]`
- [x] **H9** `PdfService.kt:93` — close logo `InputStream` with `use {}`. `[⚠️ unverified]`
- [x] **H1 / H2** `DashboardController.kt:38-90` — push filters to SQL; `@EntityGraph`/`JOIN FETCH` to kill N+1; add `@Transactional`. `[⚠️ unverified]`

## P2 — Medium (selected)

- [x] **M-G3** `PdfService.kt:29` — make `DecimalFormat` local/`ThreadLocal` (not thread-safe). `[✅ verified]`
- [x] **M-G5** `Models.kt:183,331,394` — add `@Version` to `Expense`/`AdvancePayment`/`MileageRecord` + migration. `[✅ verified]`
- [x] **M23** `CryptoService.kt:29` — crypto hardening: JCA/JCE GCM, local `@PostConstruct` secret guard, dedicated `encryption.secret` (was C4; severity tempered). `[✅ verified]`
- [ ] **M3** `Models.kt` + `V1` — migrate currency `Double`/`DOUBLE PRECISION` → `BigDecimal`/`NUMERIC(12,2)`. `[⚠️ unverified]`
- [x] **M-G1** `EmailImportService.kt:574` — mark IMAP SEEN on success only. `[⚠️ unverified]`
- [x] **M-G2** file-write-before-commit orphans (`ExpenseController`/`InsuranceController`). `[⚠️ unverified]`
- [x] **M-G7** `EmailSettingsService.kt:166` — enable IMAP STARTTLS on non-993 ports. `[⚠️ unverified]`
- [ ] Remaining M1–M22, M-G6, M-G8 — see hermes.md MEDIUM table. `[⚠️ unverified]`

## P3 — Low / cleanup

- [ ] L1–L12 and L-G1..L-G13 — see hermes.md LOW table (L-G14 removed as false positive). `[⚠️ unverified]`
- [ ] **M-G4 / L items** that are cosmetic — confirm before spending effort (e.g. M-G4 Excel format is NOT a bug).

---

## Verification backlog (do before acting on ⚠️ items)

- [ ] Fan out read-only agents to confirm the ~22 unverified `[GLM]` findings (2 of 8 spot-checked were wrong — long tail needs a pass).
- [ ] Re-run full suite on JDK21 + Testcontainers after each P0/P1 fix (local JDK 25 can't build; see hermes.md Environment Notes).

## Process

- [x] Per CLAUDE.md: use OpenSpec (`/openspec-propose`) for the C0 fix + any non-trivial change; branch `fix/...`, not `main`.
- [ ] `make test` + `make build` green before commit/push; update `HANDOFF.md`.
