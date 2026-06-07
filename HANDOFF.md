# HANDOFF.md — xpenses_copy

> Last updated: 2026-06-08 (session 13)  
> Author: Claude Sonnet 4.6

---

## What This Project Is

Self-hosted expense management app (alternative to Zoho Expenses). FastAPI backend + Next.js frontend + PostgreSQL, running in Docker Compose on port 3001 (frontend) / 8001 (backend API).

## Current State: OPERATIONAL (Phase 7 Partial + Access Control Hardening + Digital Signatures + Mileage + Advance Payments v2 + OCR + UI/UX Redesign + UI/UX Audit Fixes + Test Suite)

All 3 Docker containers running, all endpoints healthy:

| Service | Container | Port | Status |
|---------|-----------|------|--------|
| PostgreSQL 16 | `xpenses-db` | 5432 (internal) | Healthy |
| FastAPI backend | `xpenses-backend` | 8001 → 8000 | `{"status":"ok"}` |
| Next.js frontend | `xpenses-frontend` | 3001 → 3000 | Serving (307 redirect to /login if unauthenticated) |

## Latest Session (2026-06-08, session 13)

### What Was Done
- **UI/UX Audit & Fixes** (IMPLEMENTED) — 4 parallel agents audited the frontend across 4 domains (dashboard/nav, report flows, mobile/accessibility, tables/empty states). 26 issues identified, all fixed.

#### Critical functional fixes
- **Approve/Reject UI** — backend endpoints existed but the frontend never called them. Managers and CFOs can now approve or reject submitted reports directly from the report detail page, with an inline rejection reason input.
- **"Mark as paid" role gate** — button now only renders for `chef_finance`; was previously visible to all users.
- **Submitted status text** — corrected from "awaiting payment" to "awaiting manager approval".
- **Approved status panel** — new distinct panel for `approved` state, separate from `submitted`.

#### UX improvements
- **Rejection banner** — rejected reports show a prominent amber banner with the reason and a one-click "Recall to draft" button, replacing the buried `text-xs` span.
- **Mutation error feedback** — all mutations now have `onError` handlers with a dismissible red banner.
- **Delete confirmation** — report delete now shows `window.confirm` dialog.
- **Report search** — debounced text search field on the reports list, client-side filter by title.
- **Sortable columns** — Title, Total, Submitted columns are clickable with asc/desc toggle.
- **Quick-submit from table row** — draft reports can be submitted directly from the reports list via a Send icon.
- **Actionable empty states** — "Clear filter", "Clear search", "Create your first report" actions wired up.
- **Select-all for expense attachment** — checkbox to select/deselect all available draft expenses at once.
- **Role-gated dashboard cards** — Approval card only shown to `manager`/`chef_finance`; Payments card only to `chef_finance`. Technicians no longer see cards that vanish with count=0.
- **Company overview banner** — persistent amber banner when privileged user is in org-wide view mode.
- **Clickable dashboard rows** — category rows link to filtered expenses; recent expense rows link to detail page.

#### Polish & accessibility
- Loading states replaced with `animate-pulse` skeleton layouts (dashboard, reports list, report detail).
- Expense table on report detail collapses non-critical columns on mobile (`hidden sm:table-cell`).
- Checkbox touch targets enlarged with `py-2` on attachment labels.
- Badge component adds prefix symbol (○→✓✗★) so status is not color-only.
- Sidebar: close button has `aria-label`, theme toggle shows current mode name, Signature item separated by `<hr>` divider.
- `EmptyState` button has `type="button"` to prevent accidental form submission.
- Loading containers have `role="status" aria-live="polite"` for screen readers.
- `Expense` and `Report` TS interfaces updated with `user_display_name?: string | null`.

### Modified Files
- `frontend/app/reports/[id]/page.tsx` — approve/reject, status panels, rejection banner, error handling, select-all, mobile columns
- `frontend/app/reports/page.tsx` — delete confirm, search, sort, skeleton, actionable empty states, quick-submit
- `frontend/app/dashboard/page.tsx` — role-gated cards, overview banner, clickable rows, skeleton
- `frontend/components/layout/Sidebar.tsx` — ARIA label, theme label, signature divider
- `frontend/components/ui/Badge.tsx` — status prefix icons
- `frontend/components/ui/EmptyState.tsx` — `type="button"` fix
- `frontend/lib/api.ts` — `user_display_name` on `Expense` and `Report` interfaces

### Test Results
- **108 tests pass** (was 101 before mileage/signature sessions; backend-only test suite, all green)

---

## Previous Session (2026-06-07, session 12)

### What Was Done
- **UI/UX Redesign & Role Differentiation** (IMPLEMENTED)
  - **Distinct Role Identity**: Assigned color themes to each role for instant visual context: Blue (Technician), Amber (Manager), Emerald (Finance Lead), Indigo (Administrator).
  - **Personalized Dashboard**: Added a `DashboardGreeting` (time-of-day specific) and `DashboardActionCard` components.
  - **Contextual Actions**: The dashboard now highlights role-specific tasks (e.g., Technicians see draft reports, Managers see pending approvals, Finance see pending payments).
  - **Human-Friendly Terminology**: Updated navigation and role labels to be more action-oriented (e.g., "Approvals" -> "Review Reports", "Moderator" -> "Administrator").
  - **Enhanced Components**: Added role-based color variants to `Badge` and actionable buttons to `EmptyState`.
- **Signature Pad Coordinate Fix** (IMPLEMENTED)
  - Resolved "offset to the right" bug by implementing a unified coordinate calculation using `getBoundingClientRect` and internal-to-visual scaling ratios.
  - Improved responsiveness with `max-w-full` for smaller screens.
- **Backend Analytics for UI**: Updated `DashboardStats` API to include `pending_approval_count` and `pending_payment_count` to support the new dashboard action cards.

### New Files
- `frontend/lib/themes.ts` — centralized role-to-color mapping.
- `frontend/components/dashboard/DashboardGreeting.tsx` — personalized greetings.
- `frontend/components/dashboard/DashboardActionCard.tsx` — role-specific task prompts.

### Modified Files
- `backend/xpenses/models.py` — added pending counts to `DashboardStats` model.
- `backend/xpenses/routers/dashboard.py` — implemented calculation for role-specific pending counts.
- `frontend/lib/api.ts` — updated `DashboardStats` interface.
- `frontend/components/layout/Sidebar.tsx` — added role-based color accents and updated labels.
- `frontend/app/dashboard/page.tsx` — full redesign with greetings and action cards.
- `frontend/components/ui/Badge.tsx` — added role variants.
- `frontend/components/ui/EmptyState.tsx` — added support for action buttons.
- `frontend/components/signature/SignaturePad.tsx` — fixed drawing offset and responsiveness.

---

## Previous Session (2026-06-07, session 11)

### What Was Done
- **Access Control & Organizational Boundaries** (IMPLEMENTED + TESTED)
  - Refactored "Moderator" and "Chef of Finances" roles to distinguish between personal and company data.
  - **Company Overview Toggle**: Privileged users now see their personal dashboard/reports by default, with a toggle to view organization-wide data.
  - **Strict Ownership Enforcement**: Moderators can audit/view other users' reports but are strictly blocked from editing, deleting, or submitting them (403 Forbidden).
  - **Owner Identification**: Added "Owner" columns to report and expense tables in organizational views.
  - **Backend Hardening**: `list_reports` and `list_expenses` now require `?all=true` for organizational data; all mutation endpoints verify `user_id` matches.
- **UI/UX Improvement: Sign Report Button** (IMPLEMENTED)
  - Moved the "Sign Report" button from the bottom of the page to the report header action bar (next to Edit/Export/Download).
  - Maintained "Signed on [Date]" audit trail at the bottom of signed reports.

### Modified Files
- `backend/xpenses/models.py` — added `user_display_name` to `ReportOut` and `ExpenseOut`.
- `backend/xpenses/routers/reports.py` — refactored list/get/mutate for ownership vs audit access; added user JOINs.
- `backend/xpenses/routers/expenses.py` — tightened ownership checks on updates/deletes; added `all=true` support.
- `backend/xpenses/routers/dashboard.py` — refactored for personal vs org-wide stats via `all=true`.
- `frontend/app/reports/page.tsx` — added "Company Reports" toggle and Owner column.
- `frontend/app/dashboard/page.tsx` — added "Company Overview" toggle and owner labels.
- `frontend/app/reports/[id]/page.tsx` — moved Sign button to header, removed bottom prompt.

---

## Previous Session (2026-06-07, session 10)

### What Was Done
- **Mileage Recording Feature** (IMPLEMENTED + TESTED)
... (rest of the file remains same) ...
  - Dual mileage rates: before-tax (0.60 €/km) and after-tax (0.40 €/km)
  - Server-side cost calculation; rates stored per record for historical accuracy
  - Full CRUD at `/api/reports/{id}/mileage`
  - Frontend page at `/reports/[id]/mileage` with add/delete/totals
  - Teal metric card on report detail linking to mileage page
  - PDF export with mileage table and updated reimbursable summary
- **Driving Time Tracking** (IMPLEMENTED + TESTED)
  - Replaced `date TEXT` with `start_time`/`end_time` TIMESTAMPTZ columns
  - Computed `duration_minutes` field (Pydantic `@computed_field`)
  - DB migration backfills existing records
  - Frontend datetime-local inputs, duration display in table + summary card
  - PDF export shows date/time + duration columns
- **CFO-Editable Mileage Rates** (IMPLEMENTED + TESTED)
  - `app_settings` DB table (key-value, seeded with defaults)
  - `GET/PATCH /api/settings/mileage-rates` endpoints (PATCH is `chef_finance` only)
  - Mileage router reads rates from DB instead of config
  - Frontend settings page at `/admin/settings` (CFO-gated)
  - Sidebar "Settings" nav item for CFO role
- **Test suite grew to 101 passing tests** (from 94)

### New Files
- `backend/xpenses/routers/app_settings.py` — settings router + `get_mileage_rates` helper
- `backend/tests/test_settings.py` — 5 tests (read, update, forbidden, validation, integration)
- `frontend/app/admin/settings/page.tsx` — CFO mileage rates management page

### Modified Files
- `backend/xpenses/database.py` — `app_settings` table, `mileage_records` time columns, migration
- `backend/xpenses/config.py` — updated default rates to 0.60/0.40
- `backend/xpenses/models.py` — time fields, computed duration, settings models, validator
- `backend/xpenses/routers/mileage.py` — time fields, DB rates, time validation
- `backend/xpenses/routers/reports.py` — ORDER BY start_time
- `backend/xpenses/services/pdf_export.py` — date/time + duration columns, helpers
- `backend/xpenses/main.py` — registered app_settings router
- `backend/tests/conftest.py` — time-based create_mileage, app_settings reset
- `backend/tests/test_mileage.py` — updated for time fields + new rate values
- `frontend/lib/api.ts` — MileageRates interface, time fields on MileageRecord
- `frontend/lib/queryKeys.ts` — settingsKeys
- `frontend/components/layout/Sidebar.tsx` — Settings nav item
- `frontend/app/reports/[id]/mileage/page.tsx` — time inputs, duration display

---

## Previous Session (2026-06-06, session 9)

### What Was Done
- **OCR Receipt Scanning Validation & Fixes** (IMPLEMENTED + TESTED)
  - Validated that `easyocr` is fully operational in the backend container (`/api/ocr/scan`).
  - Validated frontend UI integration exists in `ExpenseForm.tsx`.
  - Improved `ocr_service.py` (`extract_amount`): added 2-line lookahead for total amounts on tabular receipts (like PDFs).
  - Added global currency fallback in OCR to detect '€' or 'EUR' anywhere in the receipt text.
  - Test suite grew to 87 passing tests (including `test_ocr.py` and `test_advances.py`).
  - Updated all documentation (`README.md`, `CLAUDE.md`, `HANDOFF.md`) to reflect the real state of the project.

### Modified Files
- `backend/xpenses/services/ocr_service.py` — added lookahead for amounts and `_guess_global_currency()`.
- `README.md` — marked OCR as completed, added Advance payments to features, updated test counts (87).
- `CLAUDE.md` — updated test count, added OCR to Key Patterns.
- `HANDOFF.md` — added session 9 log.

## Previous Session (2026-06-05, session 8)

### What Was Done
- **OCR receipt scanning** (IMPLEMENTED + TESTED)
  - EasyOCR engine (local, free, EN+RO support)
  - `POST /api/ocr/scan` endpoint — accepts image/PDF, returns extracted amount/currency/date/merchant
  - "Scan receipt to auto-fill" button on New Expense form — uploads receipt, pre-fills form fields
  - Regex + heuristic text parsing: TOTAL keyword matching, European number formats (1.234,56), currency detection
  - Security hardened: PIL decompression bomb protection, image size limits (2000px), PDF DPI cap (150), streaming upload size check
  - EasyOCR models cached in Docker volume (`ocr-models`) for fast subsequent loads
  - Configurable via `OCR_ENABLED` and `OCR_LANGUAGES` env vars
  - 87 tests passing (67 existing + 20 OCR tests)
- **Fix: ReportOut missing user_id** — frontend ownership detection for advance payment buttons

### New Files
- `backend/xpenses/services/ocr_service.py` — EasyOCR singleton reader, text parsing (amount/date/merchant extraction)
- `backend/xpenses/routers/ocr.py` — scan endpoint with file validation
- `backend/tests/test_ocr.py` — 20 tests (16 unit + 4 integration)

### Modified Files
- `backend/pyproject.toml` — added easyocr, pdf2image dependencies
- `backend/Dockerfile` — added poppler-utils, libgl1, libglib2.0-0
- `docker-compose.yml` — added ocr-models volume
- `backend/xpenses/config.py` — ocr_enabled, ocr_languages settings
- `backend/xpenses/models.py` — OCRScanResponse model + ReportOut user_id fix
- `backend/xpenses/main.py` — registered ocr router
- `frontend/lib/api.ts` — OCRScanResult interface
- `frontend/components/expenses/ExpenseForm.tsx` — scan button, loading state, auto-fill logic

### Previous Session (2026-06-05, session 8)
- **Advance payments v2 — full request/pay/reject workflow** (IMPLEMENTED + TESTED)
  - Two advance types: self-paid (instant `paid`) and requested (`requested` → `paid`/`rejected`)
  - Dedicated page at `/reports/[id]/advances` + global `/advances` for managers
  - 67 tests passing

### Previous Session (2026-06-04, session 7)
- **Advance payments v1 implemented** — basic inline CRUD within reports
  - `advance_payments` table with FX conversion
  - CRUD router at `/api/reports/{id}/advances`
  - Inline form + table on report detail page
  - PDF export with advance payments table and real summary values
  - 10 tests for advances (59 total tests passing)
  - Updated CLAUDE.md, HANDOFF.md, README.md with AI workflow docs

## Previous Session (2026-06-02, session 6)

### What Was Done
- **Backend test suite** — 49 tests across 4 files, all passing
  - `test_auth.py` (12) — login, refresh, logout, role gating, deactivated user
  - `test_reports.py` (13) — full state machine: draft→submitted→approved→paid, rejection, recall, self-approval prevention
  - `test_expenses.py` (12) — CRUD, ownership isolation, draft-only edit/delete, FX recalculation
  - `test_categories_users.py` (12) — categories CRUD + MOD role gating, user management
- **Test infrastructure** — conftest.py with session-scoped test DB, auto-cleanup, login/create helpers
- **Linting** — ruff wired up via Makefile (`make lint`, `make lint-fix`)
- **Makefile** — test, lint, up, down, rebuild, logs targets
- **No backend code changes** — tests validate existing behavior

### New Files
- `backend/tests/conftest.py` — fixtures, helpers, test DB lifecycle
- `backend/tests/test_auth.py`, `test_reports.py`, `test_expenses.py`, `test_categories_users.py`
- `Makefile` — developer workflow targets

### Modified Files
- `backend/pyproject.toml` — test deps (pytest, pytest-asyncio, ruff), pytest config
- `backend/Dockerfile` — installs test deps (`.[test]`)
- `docker-compose.yml` — volume mounts for tests/ and pyproject.toml
- `backend/xpenses/routers/reports.py` — ruff auto-fix: removed unused ExpenseOut import, sorted imports

### Previous Session (2026-06-01, session 5)
- **Dark mode** — full dark theme across all 16 page/component files
  - ThemeProvider with 3-state toggle: light / dark / system (follows OS preference)
  - Persisted in localStorage, toggles `.dark` class on `<html>`
  - Tailwind CSS v4 `@custom-variant dark` for class-based dark mode
  - Theme toggle button in sidebar (Sun/Moon/Monitor icon cycle)
- **Mobile responsive layout**
  - Sidebar collapses into a drawer overlay below `lg` breakpoint (1024px)
  - Mobile header bar with hamburger menu + "xpenses" title
  - All tables wrapped in `overflow-x-auto` for horizontal scroll
  - Status filter pills wrap on narrow screens (`flex-wrap`)
  - Page headers stack vertically on mobile (`flex-col sm:flex-row`)
  - Stat cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- **No backend changes** — purely frontend

### New Files
- `frontend/components/ThemeProvider.tsx` — theme state + localStorage + system preference detection

### Modified Files (20)
- `globals.css`, `layout.tsx`, `Providers.tsx` — dark mode infrastructure
- `AppShell.tsx` — mobile header, responsive margin
- `Sidebar.tsx` — drawer behavior, theme toggle
- `StatCard.tsx`, `Badge.tsx`, `EmptyState.tsx` — dark: variants
- `ExpenseForm.tsx` — dark form inputs
- All 11 page files — dark: classes + responsive improvements

### Previous Session (2026-05-31, session 4)
- Security hardening: COOKIE_SECURE, strict samesite, SEED_DEMO_USERS gate

### Previous Session (2026-05-31, session 3)
- **Phase 4 fully implemented and tested** — authentication & role-based access control
- Full approval workflow verified: tech submits → manager approves → CFO pays
- Security fix: removed fail-open IDOR on NULL user_id
- Database startup order fix: user_id indexes run after column migration

### Implementation Summary
- **Backend**: `auth.py` (JWT/bcrypt utilities), `seed.py` (4 test users), `routers/auth.py` (login/refresh/logout/me), `routers/users.py` (MOD-only user management)
- **All existing routers protected**: expenses/reports/categories/dashboard scoped by user_id
- **New endpoints**: `POST /reports/{id}/approve`, `POST /reports/{id}/reject`, role-gated `POST /reports/{id}/pay`
- **Frontend**: AuthProvider, Next.js middleware (redirect to /login), login page, role-based sidebar
- **New pages**: `/approvals` (Manager/CFO), `/payments` (CFO), `/admin/users` (MOD)
- **Report status flow**: draft → submitted → approved → paid (or → rejected)

### Test Accounts

| Username | Password | Role |
|----------|----------|------|
| tech1 | tech1 | Technician |
| manager1 | manager1 | Manager |
| cfo1 | cfo1 | Chef of Finances |
| mod1 | mod1 | Moderator (app admin) |

---

## Database Contents (PostgreSQL)

| Table | Notes |
|-------|-------|
| `categories` | 10 default categories |
| `expenses` | Now has `user_id` column |
| `expense_reports` | Now has `user_id`, `approved_by`, `approved_at`, `rejected_reason` |
| `receipts` | File references |
| `fx_rates` | Cached ECB rates |
| `users` | 4 seeded test users |
| `refresh_tokens` | JWT refresh token hashes |
| `advance_payments` | Cash advances per report (v2: request/pay/reject workflow) |
| `mileage_records` | Km/mileage records per report with dual rates + driving time |
| `app_settings` | Key-value config (mileage rates, CFO-editable) |

---

## Key Architectural Decisions

1. **asyncpg over SQLAlchemy** — direct raw SQL, no ORM
2. **`get_pool()`** — services outside FastAPI DI use `get_pool().acquire()`
3. **`INTERNAL_API_URL`** — Docker networking (frontend → backend via service name)
4. **Native datetime objects** — asyncpg requires Python datetime for TIMESTAMPTZ
5. **JWT in httpOnly cookies** — access token (15 min) + refresh token (7 days), token rotation on refresh
6. **Role-based access** — `get_current_user()` dependency + `require_role()` for role gates
7. **LDAP prep** — `auth_source` column + config flags, not implemented yet

---

## Common Commands

```bash
# Start all services
docker compose up -d --build

# View logs
docker compose logs -f backend

# Access PostgreSQL
docker exec -it xpenses-db psql -U xpenses

# Test login
curl -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}'

# Test authenticated endpoint
curl -b /tmp/cookies.txt http://localhost:8001/api/expenses
```

---

## Known Issues

- None critical — app is stable with auth working
- Next.js dev server shows CORS `allowedDevOrigins` warning (harmless in dev)
- PostgreSQL credentials hardcoded in docker-compose.yml (dev-only concern)
- `datetime.utcnow()` deprecation warnings in Pyright (works fine, pre-existing pattern)

## What's Next

- **IMMEDIATE**: Execute Advance payments UI polish or start Analytics (Phase 6).
- **Phase 5**: Approval Workflow enhancements (email notifications, delegation)
- **Phase 6**: Analytics & Reporting (trends, budgets, CSV export)
- **Phase 7 remaining**: Expense duplication, recurring expenses, manual FX overrides
- **Production**: Set `LDAP_ENABLED=true`, implement LDAP bind, deploy on company server

---

## How to Resume

1. `cd /home/poa/xpenses_copy`
2. `docker compose up -d` (containers should already be running)
3. Open http://localhost:3001 → login with any test account
4. API docs at http://localhost:8001/docs (FastAPI Swagger)
