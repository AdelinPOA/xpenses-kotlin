# Audit: xpenses-kotlin — GLM-5.2 Findings

Generated: 25 Jun 2026
Auditor: GLM-5.2 (zai-coding-plan/glm-5.2)
Method: 4 parallel agents (backend controllers/services · models/repos/security · complex subsystems · frontend), most severe findings verified against source by reading the actual code.
Frontend `tsc --noEmit`: PASS. Backend build not attempted on host (JDK 25 / Kotlin 2.1 incompatibility — needs Docker).

Verification tags: 🔎 = verified by reading actual source line · ⚠️ = reported, plausible, not executed.

---

## CRITICAL

### G0. Path-traversal guard is broken — `StorageService.kt:117-119` 🔎
```kotlin
val target = File(baseDir, relativePath).absoluteFile
if (!target.startsWith(baseDir)) { throw ... "path traversal detected" }
```
`absoluteFile` does **not** resolve `..`. Kotlin's `File.startsWith(File)` (verified in `FilesKt__UtilsKt` bytecode) does a segment-prefix compare on the **raw, un-normalized** path. So `../etc/passwd` segments to `[app,data,receipts,..,etc,passwd]` whose prefix equals baseDir's `[app,data,receipts]` → check passes, while the canonical target is outside the base. Affects `getLocalPath`, `downloadFile`, `uploadFile`, `deleteFile`, `cleanOrphans` (lines 117, 128, 137). Receipt paths are derived from user-supplied original filenames.
**Fix:** `val target = File(baseDir, relativePath).canonicalFile` and compare `target.canonicalPath.startsWith(baseDir.canonicalPath + File.separator)` — or `target.toPath().normalize().startsWith(baseDir.toPath().normalize())`.

### G1. `CryptoService` derives encryption keys from an unvalidated empty secret — `CryptoService.kt:16,23` 🔎
```kotlin
@Value("\${jwt.secret:}") private val jwtSecret: String   // defaults to ""
...
val secret = jwtSecret.toByteArray()                      // HKDF-SHA256 IKM
return hkdfSha256(secret, infoBytes, 32)
```
If `jwt.secret` is unset, HKDF over an empty IKM produces **deterministic, publicly-predictable** keys. Every encrypted setting (LDAP bind pw, SMTP/IMAP pw, S3 secret key, Gemini API key) is then trivially decryptable. No fail-fast validation in this service at startup.
**Fix:** `@PostConstruct` rejecting blank/short secrets; prefer a separate `encryption.secret`. (The AES-CBC + HMAC construction itself is encrypt-then-MAC with random 16-byte IV and HMAC-before-decrypt — sound apart from the key source.)

---

## HIGH

### G2. Self-payment segregation-of-duties gap — `ReportService.kt:259-270` 🔎
`approveReport` and `rejectReport` both block self-action (`report.user?.id == currentUser.id` → 400), but `payReport` checks only role + status — a `chef_finance` or `mod` who owns an approved report can mark *their own* report paid.
**Fix:** mirror the self-ownership check from `approveReport`.

### G3. Frontend: expense-save error swallowed → duplicate expenses — `ExpenseForm.tsx:138,156,171` 🔎
```ts
catch (e: any) { throw new Error(e.response?.data?.detail ?? "Failed to save expense details"); }   // :138
catch (e: any) { throw new Error("Expense saved, but failed to upload or delete some receipts."); } // :156
...
onError: (e: any) => setError(e.response?.data?.detail ?? "Failed to save"),                         // :171
```
The thrown `Error` objects carry `.message`, but `onError` reads `e.response?.data?.detail` → always `undefined`. In the partial-success path the expense **was** saved but receipts failed; the user sees the generic "Failed to save", clicks Save again, and creates a **duplicate expense**.
**Fix:** `onError: (e: any) => setError(e.message ?? e.response?.data?.detail ?? "Failed to save")`.

### G4. No timeouts on any external HTTP client — `OcrService.kt:109-111`, `FxService.kt:14`, `EmailImportService.kt:32` 🔎
```kotlin
requestFactory(JdkClientHttpRequestFactory(HttpClient.newBuilder().version(HTTP_1_1).build()))  // no connectTimeout
```
`RestClient.builder().build()` in FxService/EmailImportService likewise has no read timeout. A hung EasyOCR/MinerU/Gemini/Frankfurter upstream blocks the thread indefinitely → servlet/async pool exhaustion under load.
**Fix:** `HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))` + per-request read timeout.

### G5. LDAP context leaked on every exception path — `LdapService.kt:230-267` 🔎
```kotlin
val ctx = bindServiceAccount(config)   // opened
val results = ctx.search(...)          // throws here → catch rethrows WITHOUT closing ctx
...
ctx.close()                            // only reached on the happy paths (:242, :248)
```
`ctx.search`, `results.hasMore()`, `results.next()` can throw; the catch at :263 rethrows without closing `ctx`. Each leak holds an LDAP socket. `syncUsers` has the same shape with no try/finally around the search loop.
**Fix:** `ctx.use { ... }` (InitialDirContext is Closeable); close `results`/`userCtx` in finally.

### G6. S3 `ResponseInputStream` never closed — `S3StorageProvider.kt:65` 🔎
```kotlin
return s3Client.getObject(request).readAllBytes()   // ResponseInputStream never closed
```
`getObject` returns a `ResponseInputStream` that must be closed to release the HTTP connection; on any exception (or normal completion) it leaks.
**Fix:** `s3Client.getObject(request).use { it.readAllBytes() }`.

### G7. `Double` used for all principal monetary amounts — `Models.kt:107,202,211` + schema `V1__init.sql` 🔎
`totalAmount`, `amountOriginal`, `amountEur`, `fxRate`, `limitAmount` are `Double`/`DOUBLE PRECISION`. IEEE-754 can't represent decimal currency exactly; report totals, FX conversion, and refunds accumulate drift. Tax fields already use `BigDecimal`/`NUMERIC` (`Models.kt:213-220`) — inconsistent.
**Fix:** migrate these columns to `NUMERIC(12,2)` + `BigDecimal` in entities.

### G8. Non-deterministic pagination → duplicate/missing rows across pages — `Repositories.kt:80` + `ExpenseController.kt:70` 🔎
`findAllWithFiltersPaged` has no `ORDER BY` (the non-paged sibling at `:64` has `ORDER BY e.date DESC` but no tiebreaker). PostgreSQL returns rows in unspecified order, so offset/limit paging yields rows on multiple pages or none. Controller passes `Sort.unsorted()`.
**Fix:** `ORDER BY e.date DESC, e.id DESC` (or pass `Sort` in the controller).

---

## MEDIUM

### G9. IMAP marks unread emails SEEN on parse failure → permanent import loss — `EmailImportService.kt:574-581` 🔎
```kotlin
val processed = processIncomingEmail(fromAddress, bodyText)
if (processed) { message.setFlag(SEEN, true) }
else { message.setFlag(SEEN, true) }   // both branches identical
```
`processIncomingEmail` returns `false` when parsing yields null (e.g. Gemini down + local parser misses). The email is marked read and **never retried**. A transient Gemini outage silently drops delegation emails.
**Fix:** mark SEEN only on `processed == true`; on failure leave unread (or move to a "failed" folder) for retry.

### G10. Files written to storage *before* the DB transaction → orphans on rollback — `ExpenseController.kt:172-207`, `InsuranceController.kt:105-128` 🔎
`uploadFile()` runs before the `transactionTemplate.execute { }` block. If the DB transaction throws and rolls back, the bytes remain in storage with no DB row → file leak (disk/cost) over time.
**Fix:** register an `afterCommit` synchronization for the write, or upload inside the tx and delete on failure.

### G11. `DecimalFormat` shared across threads in a singleton — `PdfService.kt:29` 🔎
`private val decimalFormat = DecimalFormat("###,##0.00")` in a `@Service` (singleton), used in `formatAmount` throughout `buildMainPdf`. `DecimalFormat` is explicitly not thread-safe; concurrent report exports race → corruption/exceptions.
**Fix:** make it a local, a `ThreadLocal`, or use `String.format`.

### G12. Excel date format is minutes, not months — `ExportService.kt:42` 🔎
```kotlin
dataFormat = workbook.createDataFormat().getFormat("yyyy-mm-dd")  // mm = minutes in Excel
```
Excel format codes are case-sensitive; months require `MM`. Exported dates show wrong month/minute values.
**Fix:** `"yyyy-MM-dd"`.

### G13. No optimistic locking on mutable financial entities — `Models.kt:183 (Expense), :331 (AdvancePayment), :394 (MileageRecord)` 🔎
Only `ExpenseReport` has `@Version`. `Expense` is edited both manually and by OCR (`AsyncOcrService` writes results). Two concurrent writes to the same expense silently lose one update (last-write-wins) with no error — wrong financial data, no audit trail.
**Fix:** add `@Version` integer columns + Flyway migration (`ADD COLUMN version INTEGER NOT NULL DEFAULT 0`); handle `OptimisticLockingFailureException`.

### G14. OCR cache serves stored provider errors forever — `OcrService.kt:214-303` 🔎
A cache "hit" is returned when `easyocrError/geminiError/mineruError != null` (via `findBestCachedComparison`). A transient rate-limit / network blip is cached and replayed on every subsequent identical-receipt scan, with no TTL and no retry.
**Fix:** key cache hits on success-only, or add a TTL / one-shot retry on cached errors.

### G15. IMAP never uses STARTTLS — `EmailImportService.kt:546-554`, `EmailSettingsService.kt:166-169` 🔎
For `imapPort != 993` it uses plaintext `imap` with no `mail.imap.starttls.enable`. Credentials are sent in cleartext on non-993 ports.
**Fix:** set `mail.imap.starttls.enable=true` (and prefer `imaps`/STARTTLS).

---

## LOW (selected)

- **L-G1** `UserController.kt:96,121` — unsafe `as User` (not `as?`) → 500 instead of 401 if attribute absent.
- **L-G2** `ReportService.kt:152-167` — `recallReport` accepts `rejected → draft` but never clears `rejectedBy/rejectedAt/rejectedReason`; after recall→resubmit→approve the report shows both an approver and a stale rejector.
- **L-G3** `ReportController.kt:382-420` — `downloadReceiptsZip` empty-check (`zipBytes.isEmpty()`) is dead code: `ZipOutputStream` always emits an EOCD record (~22 bytes) even with zero entries. When all receipt files are missing/corrupt (each swallowed at :410-412) the client gets a valid-but-empty ZIP instead of 404.
- **L-G4** `ExpenseController.kt:357` — receipt filename `${expenseId}_${rawFilename}` collides; two uploads with the same original name on the same expense overwrite one file while both `receipt` rows point to it.
- **L-G5** `DataInitializer.kt:62-84` — demo accounts where `password == username` if `SEED_DEMO_USERS=true` in prod.
- **L-G6** `JwtTokenProvider.kt:33` — hardcoded PBKDF2 salt `"xpenses-jwt-salt"` (identical across deployments; enables precomputed dictionary attacks on weak `JWT_SECRET`).
- **L-G7** `app/layout.tsx:14-24` vs `ThemeProvider.tsx` — theme flash for "system" users: the no-flash script sets `isDark=false` when `stored==="system"`, then `ThemeProvider` resolves system→dark and toggles → visible light→dark flash.
- **L-G8** `InsuranceController.kt:122,156` — `upload.contentType` stored verbatim and reused on download with no magic-byte validation (unlike `ExpenseController.validateMagicBytes`) → content-sniffing/stored-XSS risk.
- **L-G9** `DashboardController.kt:35-66` — `pendingApprovalCount` is 0 for managers unless `all=true` (their own scoped reports then exclude their own id).
- **L-G10** `ExportService.kt` — every OCR cache-hit inserts a new `OcrComparison` row rather than reusing → table bloat.
- **L-G11** `app/inventory/page.tsx:62-71` — managers' "My Requests" fetches `status:"pending"` then filters to own id, so their approved/rejected history never appears (non-managers see all statuses correctly).
- **L-G12** `app/insurance/page.tsx:82-84` — `downloadBlob(...)` not awaited/caught → unhandled rejection, no toast on failure (other pages wrap it in try/catch).
- **L-G13** `app/reports/new/page.tsx:68-191` — no `<form>` element, so `required` on date inputs is inert; onClick only checks title.
- **L-G14** `components/ToastProvider.tsx:38-40` — `setTimeout` never cleared on unmount.
- **L-G15** `components/expenses/ExpenseForm.tsx:283` — scanned file re-uploaded uncompressed (OCR compresses for scan, but the original `file` is pushed into `receiptFiles`).

---

## Overlap with hermes.md (confirmed, not double-counted in merge)

| GLM-5.2 finding | hermes.md entry |
|-----------------|-----------------|
| G0  path traversal | C6 (path traversal) — G0 adds the Kotlin `File.startsWith` bytecode rationale |
| G1  CryptoService empty secret | C4 (hand-rolled crypto) — G1 is the *key-source* weakness |
| G4  no HTTP timeouts | H11 |
| G7  Double for money (schema-wide) | M3 (limited to ExpenseController/ExpenseService) |
| Gemini API key in URL (G-?) | C3 |
| OCR polling no abort | H4 |
| `<a href>` for auth endpoints | H3 |
| System.err.println daily allowance | C10 |
| unsafe `as User` | C7 |
| hardcoded JWT salt | M4 |

---

## Notes / not bugs (verified)
- Concurrent background `updateEasyOcrResult`/`updateMineruResult`/`updateGeminiResult` are **not** lost updates — each is a column-disjoint `@Modifying` UPDATE (`Repositories.kt:167-201`).
- `ExpenseReport` has `@Version` (`Models.kt:137`) → concurrent double-approve/double-pay on the report itself is mitigated (the CHECK-constraint payment bug in hermes C0 is separate).
- LDAP username in `authenticateLdap:237` **is** escaped (`escapeFilterChars`).
- CSV/Excel formula injection is mitigated (`ExportService.sanitizeFormula:90-91`).
- jjwt uses `verifyWith(SecretKey)` → blocks `alg:none`/asymmetric confusion; `@JsonIgnore` on `passwordHash` prevents secret leakage; native `findDeletedAudit` queries intentionally bypass `@SQLRestriction`.
