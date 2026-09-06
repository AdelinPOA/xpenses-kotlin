# Executive Summary: Production Readiness & Mobile UX Audit

## Verdict: NOT READY FOR PRODUCTION

The Xpenses codebase (Next.js 16 frontend + Spring Boot 3.4 Kotlin JPA backend) exhibits high feature velocity and ambitious domain modeling, but **is currently NOT production-ready**. 

The application suffers from critical stop-ship issues across financial correctness, security boundaries, mobile usability for field technicians, operational container exposure, and active test breakages in the current repository checkout.

### Key Audit Findings at a Glance
- **Financial Calculation Flaw:** Report reimbursement exported to PDF completely omits mileage totals (`totalMil`), leading to direct underpayment of technicians by company finance (BE-001).
- **Active Backend Test Breakage:** Running `./gradlew test` in the repository fails with 2 test failures out of 213. Specifically, a Hibernate 6 / PostgreSQL query syntax bug (`function lower(bytea) does not exist`) causes `GET /api/expenses` to fail with HTTP 500 Internal Server Error (BE-013, TST-001).
- **Security Vulnerability in File Uploads:** Uploaded insurance policy documents are served with raw user-supplied MIME types and without `Content-Disposition: attachment` or sandboxing, creating a stored cross-site script execution risk on the application origin (SEC-001).
- **Offline Tenant Contamination:** IndexedDB offline expenses and receipt images are unowned; on a shared mobile device, offline entries captured by Technician A replay into Technician B's account upon login (SEC-002, FE-001).
- **False-Green CI Pipeline:** GitHub Actions CI explicitly sets `PLAYWRIGHT_AUTHENTICATED_UI="false"`, skipping 35 out of 36 mobile E2E tests on every build (OPS-010, TST-002).
- **Broken Mobile Navigation:** Dashboard and search links navigate to `/expenses/[id]`, which does not exist in the Next.js App Router, serving a 404 Not Found error (MUX-001).
- **Mobile Usability & Dark-Mode Signature Loss:** Technicians signing reports in dark mode export pure white ink on transparent backgrounds, rendering signatures invisible on white PDF report exports (MUX-011). Closed sidebar drawers remain in the accessibility tab order and fail inertness in Romanian (MUX-002).
- **Operational & Infrastructure Risk:** Docker Compose binds backend port 8001 and frontend port 3001 to `0.0.0.0`, punching through firewalls and bypassing reverse proxies and HTTPS termination. Default demo accounts with well-known passwords are seeded by default in production (OPS-001, OPS-002, OPS-003). Database backup script ignores receipt and signature files, and no restore script exists (OPS-004).

---

## Top 10 Highest-Priority Issues

| Rank | ID | Title | Severity | Area | Core Production Risk | Target Phase |
|---|---|---|---|---|---|---|
| **1** | **BE-001** | PDF Reimbursement Omits Mileage | **Critical** | Backend / Finance | Underpays technicians on signed/exported documents. | Phase 0 |
| **2** | **SEC-001** | Insurance Upload Stored XSS / File Execution | **High** | Security | Malicious document download executes script on app origin. | Phase 0 |
| **3** | **SEC-002** | Cross-Account Offline Expense Replay | **High** | Security / Privacy | User A's pending expenses sync into User B's account on shared device. | Phase 0 |
| **4** | **OPS-001** | Production Secrets Fallback & Default Passwords | **Critical** | Ops / Security | Default database and encryption keys permit instant compromise. | Phase 0 |
| **5** | **OPS-002** | Direct 0.0.0.0 Port Exposure Bypasses Ingress | **High** | Ops / Network | Bypasses Cloudflare, WAF, reverse proxy, and TLS enforcement. | Phase 0 |
| **6** | **BE-013** | Hibernate `lower(bytea)` SQL Crash on Expenses Query | **High** | Backend | Core `GET /api/expenses` crashes with 500 on PostgreSQL. | Phase 0 |
| **7** | **MUX-001** | Dashboard & Search Expense Links 404 | **High** | Mobile UX | Technicians cannot view expense details from recent activity or search. | Phase 1 |
| **8** | **MUX-011** | Dark-Mode Signature Invisible on PDF Export | **High** | Mobile UX | White ink exported to white PDF renders signed documents blank. | Phase 1 |
| **9** | **SEC-004** | Expired Session 403 vs 401 Refresh Mismatch | **High** | Security / Auth | Technicians get logged out or stuck during active field work. | Phase 2 |
| **10** | **OPS-010** | CI Pipeline Skips 97% of Mobile E2E Tests | **High** | Ops / CI | Mobile regressions merge to `main` completely undetected. | Phase 3 |

---

## Findings Summary Matrix

| Severity | Mobile UX | Frontend | Backend | Security | Ops / CI | Total |
|---|---|---|---|---|---|---|
| **Critical** | 0 | 0 | 1 | 0 | 1 | **2** |
| **High** | 4 | 4 | 7 | 6 | 4 | **25** |
| **Medium** | 7 | 6 | 5 | 5 | 5 | **28** |
| **Low** | 1 | 2 | 1 | 1 | 0 | **5** |
| **Total** | **12** | **12** | **14** | **12** | **10** | **60** |

---

## Verification Execution Ledger

The following verification commands were executed directly during this audit:

| Command | Exit Code | Result | Key Takeaway |
|---|---|---|---|
| `cd frontend && npm run lint` | 0 | **PASSED** | Frontend static linting clean. |
| `cd frontend && npm run i18n:check` | 0 | **PASSED** | 851 keys in `en.json` and `ro.json` match 100%. |
| `cd frontend && npm run build` | 0 | **PASSED** | Next.js 16.3.1 Turbopack build succeeded; confirmed absence of `/expenses/[id]` route. |
| `docker compose config` | 0 | **PASSED** | Valid compose YAML; exposed hardcoded secrets and 0.0.0.0 bindings. |
| `cd backend-kotlin-jpa && ./gradlew test` | 1 | **FAILED** | 213 executed, 2 failed (`lower(bytea)` SQL error and soft delete audit). |
| `cd frontend && npx playwright test --list` | 0 | **PASSED** | 36 test specs exist, but 35 are skipped in CI (`PLAYWRIGHT_AUTHENTICATED_UI="false"`). |

### What Could Not Be Verified
1. **Physical iOS Safari & Android Chrome Hardware Interaction:** Review was performed via source code analysis and headless browser test suites. Physical device quirks (such as virtual keyboard pushing viewport, iOS rubber-band overscroll, hardware back button gesture navigation, and physical camera autofocus/HEIC image compression) require physical device UAT as specified in `01-mobile-ios-android-ux-audit.md`.
2. **Live Production Mail Server:** IMAP polling integration (`EmailImportService`) was audited against the codebase and database schema. Live email polling against Microsoft 365 or Google Workspace IMAP servers was not executed.
3. **Live S3 Storage Failures:** AWS S3 storage provider failure modes and network timeouts were audited structurally; live AWS credentials were not provisioned.

---

## Audit Documentation Navigation

The detailed findings, evidence, recommended fixes, and acceptance criteria are organized across eight specialized reports saved under `/agy/audit/3.8/`:

1. **[00-executive-summary.md](./00-executive-summary.md)**: High-level overview, top 10 issues, metrics, and verification ledger (this document).
2. **[01-mobile-ios-android-ux-audit.md](./01-mobile-ios-android-ux-audit.md)**: Viewports, touch targets, keyboard handling, drawer focus traps, dark mode signature, and Romanian translation issues (Findings MUX-001 to MUX-012).
3. **[02-frontend-audit.md](./02-frontend-audit.md)**: Next.js architecture, TanStack Query caching, offline replay duplication, delete undo deception, and form validation (Findings FE-001 to FE-012).
4. **[03-backend-audit.md](./03-backend-audit.md)**: Reimbursement calculation bugs, advance payment state machine leaks, uncalled IMAP ledger, async OCR transaction leaks, and `lower(bytea)` query crash (Findings BE-001 to BE-014).
5. **[04-security-privacy-audit.md](./04-security-privacy-audit.md)**: Stored file upload execution, cross-account offline leakage, service worker cache privacy, 401/403 token refresh mismatch, and bulk OCR quota bypass (Findings SEC-001 to SEC-012).
6. **[05-deployment-ops-audit.md](./05-deployment-ops-audit.md)**: Docker Compose security, default credentials, 0.0.0.0 network exposure, database & volume backup omissions, log rotation, and JVM container limits (Findings OPS-001 to OPS-010).
7. **[06-test-and-verification-plan.md](./06-test-and-verification-plan.md)**: Analysis of existing test failures, CI skip gaps, test masking in Mockito/PdfService, and a comprehensive phase-by-phase test plan.
8. **[07-prioritized-roadmap.md](./07-prioritized-roadmap.md)**: 6-phase engineering execution plan (Phases 0 to 5) with goals, tasks, affected files, risks, acceptance criteria, verification commands, and effort estimates.
