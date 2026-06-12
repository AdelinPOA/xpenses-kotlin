# Bug Audit — xpenses_copy

> Date: 2026-06-12
> Branch reviewed: `feature/optimizations` + full codebase scan
> Reviewer: Claude Code (automated + agent-assisted)
> Last verified: 2026-06-12 (all 7 original bugs confirmed fixed)

---

## Critical

### 1. Double pool connection per authenticated request
**File:** `backend/xpenses/auth.py:55–58`
**Status:** ✅ Fixed

`get_current_user()` calls `get_pool().acquire()` independently from the `get_db()` FastAPI dependency. Every authenticated route holds **2 simultaneous pool connections** for the duration of the request. With the default pool `max_size=10`, only 5 truly concurrent users are possible before all requests hang waiting for a free connection.

**Fix applied:** Uses `get_db()` dependency only — no independent pool acquisition.

---

### 2. Managers can write mileage/advance data on other users' reports
**Files:** `backend/xpenses/routers/mileage.py:14–24`, `backend/xpenses/routers/advances.py:21–33`
**Status:** ✅ Fixed

`_verify_report_ownership` permits `manager`, `chef_finance`, and `mod` roles to pass the ownership check. Both `create_mileage` and `create_advance` mutation routes use this helper without any additional check that the actor is the report owner. A manager can POST mileage records or create paid advances on any employee's report.

**Fix applied:** Write handlers have a second owner-only guard after `_verify_report_ownership`.

---

## Important

### 3. Rejected report retains stale `total_amount`
**File:** `backend/xpenses/routers/reports.py:547–568`
**Status:** ✅ Fixed

`reject_report` detaches all expenses by setting `report_id = NULL`, but never updates `total_amount` on the report row. The column retains its submitted total indefinitely.

**Fix applied:** `reject_report` now sets `total_amount = 0` explicitly in the transaction block.

---

### 4. Silent zero `amount_eur` if FX API returns `rate = 0.0`
**Files:** `backend/xpenses/routers/expenses.py:98, 168`
**Status:** ✅ Fixed

`get_rate()` in `fx_service.py` raises `ValueError` if the resolved rate is `None`, but not if it is `0.0`. A broken CDN response returning `"eur": 0` would store a zero-amount expense silently.

**Fix applied:** `get_rate()` now raises on zero or `None` rate.

---

### 5. `os.makedirs` called before path traversal check
**File:** `backend/xpenses/services/storage.py:23–32`
**Status:** ✅ Fixed

In `save_receipt`, `os.makedirs` ran before the `Path.resolve()` traversal check, allowing a crafted filename to create arbitrary directories before the guard triggered.

**Fix applied:** Traversal check at line 28–31 now runs before `makedirs` at line 33.

---

### 6. `manager` role excluded from `GET /expenses?all=true`
**File:** `backend/xpenses/routers/expenses.py:55–57`
**Status:** ✅ Fixed

`list_expenses?all=true` only allowed `chef_finance` and `mod` while `list_reports?all=true` permitted `manager` — inconsistent with dashboard scoping rules.

**Fix applied:** `manager` is now included in the role check at `expenses.py:55`.

---

### 7. Baseline `advance_payments` DDL missing runtime-required columns
**File:** `backend/xpenses/database.py:92–104`
**Status:** ✅ Fixed (non-issue)

The `CREATE TABLE` string in `database.py` appeared to be missing columns, but it is dead code — the actual schema is driven by `backend/xpenses/migrations/0001_init.sql`, which contains all required columns (`status`, `requested_amount`, `requested_currency`, `paid_by`, `paid_at`, `rejected_by`, `rejected_at`).

---

## Low-Severity Observations

### 8. `manager` cannot fetch individual receipt binaries
**File:** `backend/xpenses/routers/expenses.py:317`
**Status:** Open — low severity

`get_single_receipt` checks `role not in ("chef_finance", "mod")` but does not include `"manager"`. A manager can view a report, see its expense detail, and read expense metadata, but cannot directly download a receipt binary by ID. This is inconsistent with the broader viewer-access pattern where managers have read access to org-wide data.

**Suggested fix:** Add `"manager"` to the allowed roles in the receipt fetch endpoint.

---

### 9. `sign_report` has no report status guard
**File:** `backend/xpenses/routers/reports.py` (sign_report, ~line 572–598)
**Status:** Open — low severity / policy decision

`sign_report` allows signing a report regardless of its current status. A user can sign a `draft`, `rejected`, or already-`paid` report. Whether this is intentional depends on the business policy for signatures (e.g. sign-before-submit vs. sign-after-approval). No status check is enforced.

**Suggested fix:** Restrict signing to reports in `submitted` or `approved` status, depending on intended workflow.

---

## Diff-Only Note (feature/optimizations)

The consolidated `dashboard.py` query passes Python `bool` values (`is_org_wide`, `can_approve`, `can_pay`) as `$2/$3/$4` parameters inside `FILTER (WHERE ... OR $2)`. asyncpg maps `bool → boolean` and PostgreSQL accepts this, so it works today. It is fragile — a type coercion edge case would produce silently wrong dashboard counts with no error. Adding explicit `::boolean` casts would make the intent unambiguous.

---

## Summary Table

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| 1 | 🔴 Critical | Double pool connection per request | `auth.py:55` | ✅ Fixed |
| 2 | 🔴 Critical | Managers can write data on others' reports | `mileage.py:14`, `advances.py:21` | ✅ Fixed |
| 3 | 🟠 Important | Rejected report keeps stale `total_amount` | `reports.py:547` | ✅ Fixed |
| 4 | 🟠 Important | Silent zero `amount_eur` on FX rate=0.0 | `expenses.py:98,168` | ✅ Fixed |
| 5 | 🟠 Important | `os.makedirs` before traversal check | `storage.py:23` | ✅ Fixed |
| 6 | 🟠 Important | `manager` missing from `list_expenses?all=true` | `expenses.py:55` | ✅ Fixed |
| 7 | 🟠 Important | `advance_payments` DDL missing columns | `database.py:92` | ✅ Fixed |
| 8 | 🟡 Low | `manager` can't fetch receipt binaries directly | `expenses.py:317` | Open |
| 9 | 🟡 Low | `sign_report` has no status guard | `reports.py:572` | Open |
