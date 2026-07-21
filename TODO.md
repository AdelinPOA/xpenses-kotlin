# xpenses-kotlin Project Todo & Improvement Backlog

Comprehensive backlog of architectural, security, database, frontend, and DevOps improvements.

---

## 🔴 High Priority (Security & Data Integrity)

- [x] **Enforce API Rate-Limiting Filter**
  - Implemented Spring Security `RateLimitingFilter` backed by Caffeine `rate-limit-cache`.
  - Enforced limits on `/api/auth/login` (5 req/min), `/api/expenses/scan` (10 req/min), and export routes.

- [x] **Service-Layer Cascade Soft-Delete Logic**
  - Implemented cascading soft-delete in `ExpenseService` for child `Receipt` entities.

- [x] **Binary Magic-Byte MIME Validation**
  - Implemented `validateMagicBytes` helper in `StorageService` for binary file header validation.

---

## 🟡 Medium Priority (Performance & DB Optimization)

- [x] **Normalize Monetary Precision (`BigDecimal`)**
  - Preserved `BigDecimal` precision in `ReportController` export row building and `ExportService` formatting.

- [x] **Flyway V27 Database Indexing**
  - Created migration `V27__add_performance_indexes.sql`:
    - `idx_expenses_user_status_deleted` on `expenses(user_id, status, deleted)`
    - `idx_expense_reports_user_status_deleted` on `expense_reports(user_id, status, deleted)`
    - `idx_fx_rates_currency_date` on `fx_rates(from_currency, to_currency, rate_date)`

---

## 🔵 Frontend & DX (Developer Experience)

- [x] **Fix Next.js Build & Workspace Config Warnings**
  - Added `outputFileTracingRoot: path.resolve(__dirname, "..")` in `frontend/next.config.ts`.
  - Updated `package.json` lint script to ESLint CLI (`"lint": "eslint ."`).

---

## 🟣 Operational & DevOps Hardening

- [x] **Non-Root Docker Containers**
  - Verified `backend-kotlin-jpa/Dockerfile` (`appuser`) and `frontend/Dockerfile` (`nextjs`) for unprivileged non-root execution.
