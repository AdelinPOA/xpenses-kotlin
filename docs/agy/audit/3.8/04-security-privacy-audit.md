# Security and privacy production audit

## Verdict and evidence limits

**Not ready for an unconditional production sign-off.** Source-confirmed trust-boundary failures include executable insurance uploads, cross-account offline replay, caching of authenticated page data, an expired-session recovery mismatch, and an unmetered OCR entry point. No live exploitation or production incident is asserted.

This review is read-only apart from this report. No active network/security tests, database writes, provider requests, or application changes were performed by the security reviewer. Parent-run verification results belong in `06-test-and-verification-plan.md`; source references to existing tests below do **not** mean those tests were executed here. Findings marked **Needs verification** identify the missing deployment or concurrency evidence. Initial README, CONTEXT, planning project/roadmap, mobile remediation plan, and frontend agent guidance were read; implementation, not historical claims of completion, is authoritative.

Severity expresses impact and preconditions: none is labelled Critical because an unauthenticated, deployment-independent takeover was not demonstrated. High findings still warrant release gates. `B/` below means `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/`; paths in that notation resolve exactly under the repository root.

## Security surface inventory

| Surface | Entry points / implementation | Observed boundary |
|---|---|---|
| Authentication | `B/controllers/AuthController.kt`, `B/security/JwtAuthenticationFilter.kt`, `JwtTokenProvider.kt`, `B/model/RefreshToken.kt`, `B/repositories/RefreshTokenRepository.kt` | Cookie JWT, DB-loaded active user/role/version each request, hashed rotating refresh tokens |
| HTTP protection | `B/config/SecurityConfig.kt`, `B/security/RateLimitingFilter.kt`, `RedisRateLimitStore.kt`, `InMemoryRateLimitStore.kt`; `backend-kotlin-jpa/src/main/resources/application{,-prod}.yml` | CORS allowlist, custom mutation Origin/Referer filter, selected IP quotas, production secure cookies |
| Ownership and roles | `B/services/Authorization.kt`, `B/services/ExpenseService.kt`, controllers for users, insurance, signatures, OCR and settings | Owners mutate expenses; manager/finance/mod can view all; finance pays; manager/finance review; mod controls administrative integrations |
| Binary content | `B/controllers/InsuranceController.kt`, `SignatureController.kt`; `B/services/StorageService.kt`, `B/services/storage/{StoragePathResolver,LocalStorageProvider,S3StorageProvider}.kt` | Receipt context checks differ from lower-level generic upload and signature path |
| Administrative outbound connectivity | `B/controllers/{AppSettingsController,LdapSettingsController}.kt`; `B/services/{LdapService,EmailSettingsService,StorageService,OcrService}.kt` | Role-gated configurable hosts/endpoints; stored credentials restored for connection tests |
| Email trust | `B/services/EmailImportService.kt:processIncomingEmail,pollAndProcessEmails` | Header From maps to active application user; creates draft report |
| Secrets / privacy | `B/services/CryptoService.kt`, `OcrResultCacheCleanupService.kt`; `B/model/{OcrJob,OcrComparison,OcrResultCache}.kt`; `backend-kotlin-jpa/src/main/resources/logback-spring.xml` | AES-GCM settings encryption, legacy JWT-derived decrypt, receipt text/results, email addresses/subjects in logs |
| Browser session / persistence | `frontend/components/{AuthProvider,Providers,OfflineSyncProvider,PwaRegistration}.tsx`, `frontend/lib/{api,offlineQueue,queryKeys,serverApi}.ts`, `frontend/public/sw.js`, `frontend/next.config.ts` | Cookies, shared QueryClient, unowned IndexedDB queue, origin-wide service-worker cache, same-origin API proxy |
| Relevant existing tests | `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/{AuthController,InsuranceController,SignatureController,UserController,ExpenseController}Test.kt`; `security/{RateLimitingFilter,InMemoryRateLimitStore}Test.kt`; `services/AuthorizationTest.kt`, `services/storage/StoragePathResolverTest.kt` | Useful happy-path/ownership/path coverage; no proof of cross-account browser persistence isolation or real refresh concurrency |

## Findings

### SEC-001 — Insurance uploads can be served as executable same-origin documents

- **Severity:** High
- **Area:** Security
- **Status:** Confirmed unsafe upload/response contract by code; browser exploitation through deployed proxy **Needs verification**.
- **Evidence:** `B/controllers/InsuranceController.kt:87–126` checks size/extension (including `txt`/`csv`) but calls `storageService.uploadFile`, not a format-validating context, and stores `fileType = upload.contentType`. At `:155–164`, download returns `MediaType.parseMediaType(file.fileType)` without `Content-Disposition: attachment` or sandbox. `B/services/StorageService.kt:296–316` generic `uploadFile` validates size/path, **not** contents. `frontend/next.config.ts:4–6,15–16,26–39` proxies this under the frontend origin and allows `script-src 'self' 'unsafe-inline'`.
- **User impact / production risk:** A manager, finance user, or mod who can upload insurance for a target user can supply HTML bytes named `policy.txt`, label them `text/html`, and entice that user or a more privileged reviewer to navigate to `/api/insurance/{id}/download`. The application returns attacker-designated active HTML at an authenticated origin. HttpOnly protects reading cookie values, not script-driven same-origin authenticated requests. This is a privilege-crossing stored-content risk, not an unauthenticated upload vulnerability.
- **Recommended fix:** Introduce an insurance-specific validated storage context; derive a safe response MIME independently of multipart metadata. Default documents to attachment; serve any preview from an isolated origin or strongly sandboxed viewer. Do not rely on extension checks or `nosniff` alone. Replace unsafe-inline CSP with nonce/hash-based policy as defense in depth, not the primary fix.
- **Acceptance criteria:** HTML supplied under every allowed extension and MIME combination is rejected or downloaded inertly; no uploaded insurance content executes with app-origin privileges. Legitimate supported documents still download with a safe filename and disposition.
- **Suggested tests:** MockMvc malicious MIME/extension/content matrix; isolated Playwright fixture opening the download through the actual Next proxy with a harmless execution marker; owner/other-user/manager/mod access matrix; desktop/mobile PDF download smoke.
- **Dependencies / sequencing:** Phase 0. Coordinate frontend download behavior and supported office-format policy before migration; existing stored MIME values must also be sanitized on read.

### SEC-002 — Offline expenses have no owner and replay under whichever account is logged in

- **Severity:** High
- **Area:** Security
- **Status:** Confirmed by source control flow; two-account browser reproduction not run.
- **Evidence:** `frontend/lib/offlineQueue.ts:21–33,68–92`: `PendingExpense` has no user/account identifier; all users share `xpenses-offline/pending_expenses`. `frontend/components/OfflineSyncProvider.tsx:65–81,118–126` reads every item on mount/online/focus and posts it with current cookies, without `useAuth` or ownership check. `frontend/components/AuthProvider.tsx:102–107` logout clears user state and navigates, but does not isolate or clear queue data.
- **User impact / production risk:** On a shared browser/field device, A's pending financial details and receipt images can be uploaded as B's expenses after a switch of account. This is both private-data disclosure and accounting misattribution. Signatures and receipt details may persist on device longer than users expect.
- **Recommended fix:** Bind each queued item to a stable authenticated account ID when created. Sync only after identity is resolved and matches the queue owner, and re-check identity during replay. Define a user-visible preserve/discard policy at logout and retention/expiry. Quarantine existing unowned items rather than assigning them to the next account. Coordinate with frontend idempotency/resumable upload work; ownership isolation alone does not prevent retry duplicates.
- **Acceptance criteria:** A's offline payload/receipts can never be listed or submitted by B; logout/session changes stop in-flight replay safely; legacy ownerless items cannot auto-sync; owner can recover or explicitly discard their own drafts.
- **Suggested tests:** Two users in one browser profile, offline capture → logout/relogin → online; change account during replay; expired session; multiple tabs; legacy schema migration and IndexedDB quota failure.
- **Dependencies / sequencing:** Phase 0 privacy/data-integrity fix, before expanding offline functionality. Preserve user data deliberately rather than indiscriminately deleting it.

### SEC-003 — Service worker persists authenticated pages/RSC; logout also retains shared query data

- **Severity:** High
- **Area:** Security
- **Status:** Confirmed persistence mechanisms and authenticated payload source; exact cross-account UI display **Needs verification** in browser.
- **Evidence:** `frontend/public/sw.js:1–8` pre-caches `/dashboard`, `/expenses`, `/reports` into global `xpenses-v3`; `:36–44` excludes `/api/` but explicitly routes RSC/data fetches into caching; `:48–59` stores all successful GET responses and falls back to cached ones. Those pages are not empty shells: `frontend/app/expenses/page.tsx:10–28` fetches authenticated expenses and serializes them through `dehydrate`; `frontend/app/reports/page.tsx` and `frontend/app/dashboard/page.tsx` do the same. `frontend/components/Providers.tsx:13–24` retains one QueryClient across client navigation; `frontend/lib/queryKeys.ts:6–20` expense/report/review keys omit identity; `frontend/components/AuthProvider.tsx:102–107` clears neither CacheStorage nor query cache. Service-worker activation only removes *old cache versions*, not current private responses.
- **User impact / production risk:** Private expenses/report/user data can remain in origin storage after logout and be returned on offline RSC requests. In-memory cached lists can also survive account switches. HTTP `no-store`/dynamic rendering is not a substitute for excluding data from this explicit Cache API write path. Exact RSC cache keys and visible reuse depend on navigation/request headers; persistent private bytes are the confirmed problem.
- **Recommended fix:** Cache only an explicit allowlist of public immutable assets and a non-personal offline shell. Never cache authenticated HTML/RSC or hydrate private data into a cached shell. On identity boundary, cancel/remove query data, clear relevant router state, and purge legacy private service-worker caches. Do not claim clearing the query cache fixes the service worker or vice versa.
- **Acceptance criteria:** After logout no expense/report/user payload remains in CacheStorage or is obtainable from the former account's query cache; an offline second account sees no first-account content. Static assets remain available offline.
- **Suggested tests:** Inspect CacheStorage response bodies after authenticated navigation and logout; A→B navigation online/offline, browser back, PWA restart, and upgrade from `xpenses-v3`; verify private RSC requests bypass the worker.
- **Dependencies / sequencing:** Phase 0 alongside SEC-002. Requires service-worker upgrade/purge strategy for existing installed PWAs, not just a source edit.

### SEC-004 — Expired access tokens receive 403, but frontend refresh recovery only handles 401

- **Severity:** High
- **Area:** Security
- **Status:** Confirmed source contract mismatch, supported by an existing test expectation; not executed here.
- **Evidence:** `B/security/JwtTokenProvider.kt:decodeAccessToken` returns null on invalid/expired JWT; `B/security/JwtAuthenticationFilter.kt:29–54` then continues without authentication. `B/config/SecurityConfig.kt:41–65` requires authentication but supplies no 401 authentication entry point. Existing `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/AuthControllerTest.kt`, test **`GET me without cookie returns 403 (Spring Security default for unauthenticated)`**, explicitly asserts 403. `frontend/lib/api.ts:35–68` refreshes only on 401. `frontend/components/AuthProvider.tsx:39–47,62–68,92–93` schedules a refresh 50 minutes ahead but resets that timer after every successful five-minute auth check; normal sustained use therefore keeps postponing it. Access token lifetime is 60 minutes in `application.yml:36`.
- **User impact / production risk:** A valid 30-day refresh cookie does not reliably restore an expired one-hour access session. Field users can encounter failed saves/reads or be sent to login despite having a renewable session. Proactive timing does not repair the reactive status-code mismatch and sleep/resume makes reactive recovery essential.
- **Recommended fix:** Return consistent JSON 401 for unauthenticated/expired credentials, reserving 403 for authorization denial. Fix proactive expiry scheduling so polling does not postpone renewal indefinitely; retain one bounded refresh/retry path and explicit handling of nonrecoverable revocation. Preserve unsaved forms through reauthentication.
- **Acceptance criteria:** Expired access + valid refresh transparently recovers exactly once, including background/resume; expired refresh logs out predictably; genuinely forbidden role/ownership operations remain 403 without refresh loops.
- **Suggested tests:** Real security-chain MockMvc expired-token cases and refresh cookie assertions; fake-time frontend tests through >60 minutes of successful polling; mobile background/resume and failed save after expiry; invalid access versus forbidden ownership distinction.
- **Dependencies / sequencing:** Phase 1 mobile release gate, with SEC-007/008 auth regression coverage. Do not globally treat all 403 responses as expired sessions.

### SEC-005 — Bulk upload bypasses OCR quotas and file-content validation before provider work

- **Severity:** High
- **Area:** Security
- **Status:** Confirmed unprotected entry point; cost/outage impact depends on provider configuration and deployment limits.
- **Evidence:** `B/security/RateLimitingFilter.kt:35–41,57–64` quotas cover `/api/ocr/scan`, `/api/expenses/scan`, login/refresh and selected report exports, not `/api/expenses/bulk-upload`. `B/controllers/BulkExpenseController.kt:33–61` accepts up to 20 files and calls `ocrService.scanReceipt(file.bytes, filename)` for each **before** `uploadReceipts` validates storage format. `B/services/OcrService.kt:133` has no module-level user/provider budget check; it hashes input and can call Gemini. The alternate `B/controllers/OcrController.kt:scanReceipt` checks extension/size but not magic bytes. Global multipart request size remains 10 MB, so this is not an assertion of unlimited single-request bytes.
- **User impact / production risk:** An authenticated technician can repeatedly trigger expensive paid OCR via the bulk path despite exhausted direct-scan quotas, and arbitrary content can be sent to the processor before rejection. This can drain quota or saturate worker/request/provider resources. No unauthorized role is required beyond a normal account.
- **Recommended fix:** Enforce a shared per-user and global OCR budget at the OCR service boundary (including bulk, sync, async, email and admin paths as applicable); reserve budget per file/provider attempt. Validate size and actual supported content before any provider or parser call. Add bounded concurrency and clear 429/503 feedback.
- **Acceptance criteria:** All public OCR entry points consume the same enforceable allowance; invalid magic bytes consume no provider request; bulk requests cannot multiply quota unnoticed; multi-replica accounting is consistent.
- **Suggested tests:** Exhaust direct quota then attempt bulk/sync calls; count mocked provider invocations with 20 files; invalid binary/extension combinations; Redis outage/multi-instance behavior; HEAD requests to costly export GET routes (limiter currently skips HEAD—framework execution impact needs runtime verification).
- **Dependencies / sequencing:** Phase 0 if paid OCR is enabled, otherwise gate enablement. Coordinate backend OCR queue/transaction fixes, rather than adding only another URL-specific counter.

### SEC-006 — IMAP report ownership trusts a spoofable From header

- **Severity:** High
- **Area:** Security
- **Status:** Confirmed application trust gap; exploitability **Needs verification** against mailbox ingress controls.
- **Evidence:** `B/services/EmailImportService.kt:582–587` takes `message.from.firstOrNull()` and passes it directly to `processIncomingEmail`; `:407–445` extracts the email address, finds an active user by that string, and saves a draft report as that user. The call path does not validate an authenticated sender assertion, trusted gateway result, allowlisted authenticated envelope, or cryptographic signature. It creates **draft reports**, not automatic approvals/payments.
- **User impact / production risk:** If arbitrary mail reaches the configured folder, forged From values can create reports in another employee's account and trigger external parsing of attacker-controlled text. Mail gateway SPF/DKIM/DMARC policy might mitigate this, but it is not evidenced by repository configuration; a raw `Authentication-Results` header cannot itself be trusted unless inserted/validated by a trusted ingress.
- **Recommended fix:** Establish authenticated ingestion identity at a controlled gateway, or use per-user unguessable signed ingestion credentials and verified sender mapping. Require trustworthy provenance before report creation/provider work; quarantine rejected messages with bounded retries and operator visibility.
- **Acceptance criteria:** Mail with a forged From or attacker-supplied authentication-result header cannot create another user's report; legitimate forwarding workflows have a documented, tested identity policy.
- **Suggested tests:** Isolated mailbox fixtures for forged From, DMARC failures, authenticated same-domain mail, forwarded mail, duplicate message IDs, inactive user, and malformed address. Never send spoofing tests to production mailboxes without separate authorization.
- **Dependencies / sequencing:** Gate production IMAP enablement; pair with backend ledger/idempotency remediation. Owner must supply mail-gateway evidence before downgrading this risk.

### SEC-007 — Logout and temporary deactivation do not invalidate existing access JWTs

- **Severity:** Medium
- **Area:** Security
- **Status:** Confirmed revocation behavior by code; policy choice requires explicit acceptance or correction.
- **Evidence:** `B/controllers/AuthController.kt:169–186` logout deletes the matching refresh row and clears browser cookies, but does not increment user tokenVersion or revoke the access JWT. `B/controllers/UserController.kt:126–144` deactivation removes refresh tokens but does not change tokenVersion. `B/security/JwtAuthenticationFilter.kt:33–45` rejects inactive users and old versions only; reactivation makes an old unexpired JWT acceptable again. Password changes *do* increment version (`AuthController.kt:209`), proving an available revocation mechanism. Access TTL is 60 minutes (`application.yml:36`).
- **User impact / production risk:** A copied access JWT remains usable for up to an hour after logout; a token from before disable/re-enable can regain access. Clearing cookies on the legitimate browser is not server revocation. Ordinary users cannot read HttpOnly cookies; theft assumes device compromise, transport/configuration problems, or another compromise.
- **Recommended fix:** Define per-device versus all-device logout semantics. Use session/token-family revocation or increment tokenVersion for all-session security events, including disablement; avoid accidentally logging out every device if product requires only local logout.
- **Acceptance criteria:** Tokens issued before the relevant logout/revocation/deactivation boundary fail protected requests according to documented policy, including after reactivation.
- **Suggested tests:** Save a valid access token in a fixture, logout/disable/re-enable/change password, then replay it through the real security chain; verify unaffected sessions if per-device semantics are chosen.
- **Dependencies / sequencing:** Phase 2; design together with refresh families and SEC-004, not an isolated cookie deletion patch.

### SEC-008 — Refresh rotation lacks a coherent multi-tab/replay transaction contract

- **Severity:** Medium
- **Area:** Security
- **Status:** Confirmed missing atomic claim/family state; exact race outcome **Needs verification** with independent PostgreSQL transactions.
- **Evidence:** `B/controllers/AuthController.kt:112–164` does an ordinary lookup, delete and replacement insert. `B/model/RefreshToken.kt` has no optimistic version or token-family/revocation fields; `B/repositories/RefreshTokenRepository.kt` has no locking/atomic consume method. When the old token is absent but a valid access cookie exists (`AuthController.kt:113–129`), it increments the entire user's tokenVersion and deletes all refresh rows. `frontend/lib/api.ts:12–13` refresh synchronization is per JavaScript module/tab; proactive `refreshTokens()` in `AuthProvider.tsx` is another initiating path.
- **User impact / production risk:** Concurrent tabs/requests can race consumption, resulting in rejected rotation, multiple successors, or rollback/500 depending on SQL flush/interleaving. A late legitimate duplicate can be treated as compromise and revoke the entire account session. These are hypotheses requiring deterministic reproduction, not claims that every parallel request creates two valid tokens.
- **Recommended fix:** Atomic token consumption with explicit family/device state, bounded policy for legitimate duplicate rotation, and recorded replay behavior. Serialize renewals across tabs where practical, but enforce correctness server-side. Ensure cookies are not accepted as successful rotation if the DB commit fails.
- **Acceptance criteria:** Exactly one authorized successor chain; parallel refresh has deterministic documented results without spurious global logout; confirmed theft/replay revokes the intended family; failed commit never yields a usable orphan cookie.
- **Suggested tests:** Barrier-controlled independent DB transactions for simultaneous refresh, refresh/logout, password change/refresh, and delayed second-tab response; cookie ordering and expired access + invalid refresh cases.
- **Dependencies / sequencing:** Phase 2, before multi-device session expansion. Existing controller tests contain no refresh concurrency coverage and their shared test transaction cannot prove this race safe.

### SEC-009 — Configurable directory/mail connections allow cleartext or non-required TLS

- **Severity:** Medium
- **Area:** Security
- **Status:** Confirmed configuration paths; deployed connection modes and actual downgrade behavior **Needs verification**.
- **Evidence:** `B/services/LdapService.kt:LdapConfig` defaults `useTls=false`, port 389; `authenticateLdap` and `bindServiceAccount` choose plain `ldap://` with `simple` bind when false. `B/services/EmailSettingsService.kt:88–102,193–205` enables SMTP STARTTLS only on port 587 and does not require it; other ports except 465 have no explicit TLS. `B/services/EmailImportService.kt:558–567` enables but does not require STARTTLS and sets `mail.imap.*` properties while selecting `imaps` at port 993 (verify protocol-specific effective settings). Secrets are encrypted at rest, but that does not secure transport.
- **User impact / production risk:** Misconfiguration or permissive STARTTLS negotiation can transmit directory credentials, mailbox credentials or financial email content without required encryption. The repository does not prove deployed plaintext use; private network topology alone is not a cryptographic guarantee.
- **Recommended fix:** Require TLS with endpoint identity validation in production; make insecure development exceptions explicit and impossible to enable silently. Validate allowed mode/port combinations; set protocol-correct timeouts/TLS properties consistently for normal sends, test sends and polling.
- **Acceptance criteria:** Production startup/config save rejects unapproved insecure modes; failed STARTTLS/certificate verification fails closed without sending credentials; all connect/read calls have bounded timeouts.
- **Suggested tests:** Local fake LDAP/SMTP/IMAP servers advertising no STARTTLS, wrong certificates and stalled handshakes; compare test-connection and production execution paths. Owner verifies actual TLS negotiation separately.
- **Dependencies / sequencing:** Phase 2 before enabling directory/mail integrations; coordinate certificate provisioning and trusted internal CA policy.

### SEC-010 — Admin connection tests can redirect stored credentials/workload to arbitrary hosts

- **Severity:** Medium
- **Area:** Security
- **Status:** Confirmed admin-controlled egress capability; unapproved-network access **Needs verification** against deployment firewall and admin trust model.
- **Evidence:** `B/controllers/AppSettingsController.kt:testImapSettings` uses an existing saved password when the submitted password is blank but uses the submitted host/port. `testStorageSettings` restores stored secrets before testing supplied configuration. `B/services/storage/S3StorageProvider.kt:37–41` accepts `URI.create(endpointOverride)` without application host/scheme restrictions. `B/services/LdapService.kt:bindServiceAccount` and `EmailSettingsService.kt:testImapConnection` use configured hosts. These endpoints are guarded by `hasRole('mod')`; this is **not** a technician or unauthenticated SSRF claim.
- **User impact / production risk:** A compromised application-admin account can probe internal services and direct credential-bearing protocol traffic to attacker-chosen infrastructure; an IMAP test may send the saved mailbox password to a changed host. Masked settings fields do not prevent this indirect disclosure. Admin access need not imply permission to obtain organization directory/mail/cloud credentials or access instance metadata.
- **Recommended fix:** Approved egress destinations/protocols at network and application boundaries; block link-local/metadata and unintended loopback/private endpoints with explicit exceptions for legitimate internal services. Bind stored secret reuse to an approved destination; require separate secret entry/reapproval when destination changes; audit connection tests.
- **Acceptance criteria:** Changing host/endpoint cannot silently reuse a privileged saved credential at an unapproved destination; metadata/unapproved endpoints are blocked after DNS resolution and redirects; valid approved internal services work.
- **Suggested tests:** Role-denial tests; local fake endpoints proving no secret leaves on rejected host changes; DNS/redirect/private-address policy cases; deployment egress allowlist verification.
- **Dependencies / sequencing:** Phase 2 with SEC-009. Do not indiscriminately ban all private IPs: LDAP/S3-compatible services may intentionally be internal.

### SEC-011 — Auth mutations are exempted from Origin/Referer checks

- **Severity:** Medium
- **Area:** Security
- **Status:** Confirmed defense gap; same-site cross-origin exploitation **Needs verification** in a controlled browser environment.
- **Evidence:** `B/config/SecurityConfig.kt:81–95` skips login, logout and refresh and matches skips with `path.startsWith`. `B/controllers/AuthController.kt:99–105,169–173` exposes cookie-only POST refresh/logout with no required JSON body. Cookies are `SameSite=Lax` (`:223–239`), which is a site rather than origin restriction. CORS allowlisting protects cross-origin response access/preflight, not every simple form POST side effect.
- **User impact / production risk:** A hostile origin on the same schemeful site, if one exists, can potentially trigger logout/refresh with attached cookies despite not being a CORS-approved frontend. Ordinary cross-site form POSTs are normally restricted by Lax; do not describe this as a demonstrated universal CSRF bypass. No current protected prefix-collision route was found, but prefix exemptions are brittle.
- **Recommended fix:** Apply exact-path and trustworthy Origin/Referer validation to browser auth mutations, including refresh/logout; document any non-browser integration exception. Consider CSRF tokens for cookie-auth flows rather than treating stateless JWT as a reason to omit CSRF protection.
- **Acceptance criteria:** Unapproved same-site origins cannot rotate/delete session cookies or tokens; approved frontend works; missing/`null` Origin and malformed Referer cases have documented fail-closed behavior; no unintended prefix exemptions.
- **Suggested tests:** Security-chain POSTs with allowed/disallowed/missing/`null` headers; real browser same-site sibling-origin form submits; refresh/logout failure leaves session state unchanged.
- **Dependencies / sequencing:** Phase 2 with auth repair. Verify actual CORS/proxy origin settings before rollout to avoid locking out the legitimate frontend.

### SEC-012 — Financial/email personal data persists in logs and secondary OCR stores without a unified retention policy

- **Severity:** Medium
- **Area:** Security
- **Status:** Confirmed code data flows and incomplete application cleanup; legal basis, provider retention and deployment retention **Needs verification**.
- **Evidence:** `B/services/EmailImportService.kt:415,419,553,586–592` logs sender/mailbox identifiers; `B/services/EmailSettingsService.kt:189,224–226` logs recipient and subject (including the disabled-email branch). `B/services/OcrService.kt:284–345` sends receipt bytes to Google's Gemini API; `EmailImportService.kt:parseDelegationEmailGemini` sends message text when enabled. `B/model/OcrJob.kt:24` retains `resultJson`; `B/model/OcrComparison.kt` retains extracted fields/error data. `B/services/OcrResultCacheCleanupService.kt:20–31` deletes expired **result-cache** rows only; repository search found no equivalent OcrJob/comparison retention scheduler. `backend-kotlin-jpa/src/main/resources/logback-spring.xml` produces production JSON, but no field minimization/redaction policy. Browser persistence is separately covered by SEC-002/003.
- **User impact / production risk:** Expense/insurance/work-assignment data and contact details can remain in secondary stores, logs, backups and third-party processing beyond intended necessity. JSON logging is useful operationally but does not sanitize sensitive values. No plaintext JWT/password log statement was identified in the reviewed paths; this is not a claim that production logs contain exposed secrets or that a legal violation has been established.
- **Recommended fix:** Document data categories, processors, locations, access and retention; minimize routine personal identifiers/subjects in logs; use opaque event IDs. Apply bounded cleanup to diagnostic/job data with financial-record retention exceptions. Decide cloud OCR/email parsing consent/notice and processor contracts before enabling them. Include backup and local-cache retention rather than deleting posted financial evidence blindly.
- **Acceptance criteria:** Approved retention matrix covers primary records, receipts/signatures, OCR results/comparisons/jobs, email-derived content, browser storage, logs and backups; diagnostics expire as configured; provider settings/legal basis are documented; logs exclude reusable credentials and unnecessary content.
- **Suggested tests:** Log-capture assertions on auth/provider/error paths; retention boundary/batch/restart tests; deletion/export data inventory against an isolated account; owner review of processor configuration and backup retention.
- **Dependencies / sequencing:** Phase 2 policy/minimization, Phase 4 automated operational verification; preserve statutory financial evidence and coordinate immutable report/signature requirements.

## Controls verified in source — do not remove while fixing findings

- `JwtAuthenticationFilter` reads current user role/active state from DB, rather than authorizing solely from a stale JWT role claim. Role changes therefore apply on the next request. Password changes increment tokenVersion and revoke refresh rows.
- Auth cookies are HttpOnly and SameSite=Lax; `application-prod.yml:21–22` forces Secure. `JwtTokenProvider.validateSecret` refuses blank signing secret; `CryptoService.validateSecrets` requires a nonblank, distinct encryption secret. These checks do **not** establish entropy or secure deployed environment; secrets were not inspected.
- Refresh token generation uses 48 random bytes and stores SHA-256 hashes; settings use authenticated AES-GCM with random IVs. Legacy CBC decryption authenticates with HMAC. **Rotation warning:** `CryptoService.getFernetKey/decryptCbc` still uses the JWT secret for legacy ciphertext; rotating JWT material without inventory/migration can strand old settings. This is an operational precondition, not proof that legacy rows exist.
- Custom CSRF filtering rejects missing/disallowed Origin/Referer for ordinary mutations, and configured CORS is an explicit allowlist. Rate limiting is bounded in memory and has Redis support with production fail-closed default; forwarded IP headers are accepted only from configured immediate proxies. Actual proxy overwriting of forwarded headers and production Redis wiring still require owner verification.
- `Authorization` explicitly restricts expense mutations to owners and separates review/payment roles from `mod`. `ExpenseService.getReceiptDownload` checks expense ownership/read permission and receipt association; OCR job status checks the job owner. No blanket unauthenticated receipt/signature read was found.
- `StoragePathResolver` performs canonical containment, including symlink containment, and receipt `storeFile` validates extension/size/magic. That defense is not universal: SEC-001 follows generic `uploadFile`; `SignatureController` writes a server-selected user ID path, independently checks PNG header and 500 KB decoded size, and does not accept a client-selected filename. Signature archival immutability is handled in the backend audit.
- Sensitive integration settings have method-level mod authorization and masked responses; Swagger is disabled by default. Health details are configured `when-authorized`; non-health actuator access is role-gated. Cloud buckets are not made public by the reviewed S3 upload code, but bucket policy/access logging/encryption was not remotely inspected.
- SQL/ownership and core financial concurrency are primarily covered in the backend audit. No SQL injection or directory-filter username injection was found in the inspected paths; LDAP username filter characters are escaped in `LdapService.escapeFilterChars`. This is not a universal proof over every endpoint.

## Verification handoff and remaining blind spots

1. **Release gates:** inert insurance downloads (SEC-001), two-account offline/cache isolation (SEC-002/003), exact expired-session contract (SEC-004), all-entry-point OCR budget (SEC-005), trusted email provenance before enabling ingestion (SEC-006).
2. **Real filter-chain tests:** preserve ownership/role protections while adding auth expiry/revocation/CSRF tests. Existing `IntegrationTestBase` enables the security chain but adds a default approved Origin and disables rate limiting; ordinary controller green tests do not prove production abuse/CSRF behavior.
3. **Independent-transaction tests:** refresh rotation/revocation under contention cannot be validated by one shared test transaction. Test outside transactional test wrappers using PostgreSQL and actual HTTP/Spring proxies.
4. **Owner-only environment checks:** secure cookie attributes through TLS proxy; default profile is really prod; CORS origin list; proxy header sanitization; TLS hostname checks; IMAP gateway authenticity; S3 IAM/public-access/encryption; credential strength/rotation; backup and processor retention. Do not print secret values in audit output.
5. **Not performed here:** active vulnerability scanning, penetration attempts, private dependency advisories, repository-history secret scan, production login, screenshots, real iOS/Android browser execution, restore tests, mailbox/cloud access or production log sampling. Parent verification must state its own executed checks separately.
6. **Exact suggested owner test commands (not executed by this reviewer):**
   ```bash
   cd backend-kotlin-jpa
   ./gradlew test --tests '*AuthControllerTest' --tests '*InsuranceControllerTest' --tests '*SignatureControllerTest' --tests '*UserControllerTest' --tests '*RateLimitingFilterTest' --tests '*StoragePathResolverTest'
   cd ../frontend
   npm run test:e2e:mobile
   ```
   These existing suites establish only their current assertions. Add the finding-specific tests above before treating passing commands as closure. Run any browser attack-shaped fixture or fake mailbox test only in an isolated, disposable environment.
