# Improvements Proposal for the xpenses Project

*(Based on the current state documented in HANDOFF.md, README.md, and a quick code scan)*

---

## 1. Security & Hardening

| Issue | Recommendation | Steps |
|-------|----------------|-------|
| **Hard‑coded DB credentials** in `docker-compose.yml` (visible in the file) | Move to `.env` (or Docker secrets) and reference via `${POSTGRES_PASSWORD}` | 1. Add `POSTGRES_PASSWORD` to `.env.example` and `.env`.<br>2. Replace the literal `xpenses` in `docker-compose.yml` with `${POSTGRES_PASSWORD}`.<br>3. Keep the same value for local dev; in production override via env or secret. |
| **`datetime.utcnow()` deprecation warnings** (21 occurrences) | Replace with timezone‑aware `datetime.now(timezone.utc)` | 1. Run a project‑wide replace: `find backend -type f -name "*.py" -exec sed -i 's/datetime\.utcnow()/datetime.now(timezone.utc)/g' {} +`.<br>2. Add `from datetime import timezone` where missing.<br>3. Run the test suite to ensure nothing breaks. |
| **No rate limiting / brute‑force protection** on auth endpoints | Add simple rate limiting (e.g., via `slowapi` or custom middleware) | 1. Add `slowapi` to `pyproject.toml`.<br>2. Create a middleware in `backend/xpenses/middleware.py` that limits login attempts per IP (e.g., 5/min).<br>3. Register it in `main.py`.<br>4. Add a test for the limit. |
| **Missing security headers** (CSP, HSTS, etc.) | Add `SecureHeadersMiddleware` (or use `fastapi.middleware.httpsredirect` + custom) | 1. Install `secureheaders` or write a small middleware that adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, etc.<br>2. Apply to all responses. |
| **LDAP preparation incomplete** (only flags & column) | Implement LDAP bind for production (optional) | 1. Create `auth_ldap.py` that uses `python-ldap` or `ldap3`.<br>2. Add a flag `LDAP_ENABLED` in `config.py`.<br>3. When enabled, `authenticate_user` falls back to LDAP before checking the local DB.<br>4. Keep local fallback for dev. |

---

## 2. Observability & Monitoring

| Issue | Recommendation | Steps |
|-------|----------------|-------|
| **No health/liveness probes** for frontend/backend beyond DB | Add `/healthz` endpoints that return 200 when the service is ready | 1. In `backend/xpenses/main.py`, add a `@app.get("/healthz")` that checks DB connectivity (`SELECT 1`).<br>2. In frontend, add a simple API route (`/api/healthz`) that proxies to the backend or just returns 200 if the Next.js server is up.<br>3. Update `docker-compose.yml` healthchecks for `backend` and `frontend` to use these endpoints. |
| **No metrics collection** | Export Prometheus metrics (request count, latency, DB pool usage) | 1. Add `prometheus-fastapi-instrumentator` to `pyproject.toml`.<br>2. Instrument the app in `main.py`.<br>3. Expose `/metrics`.<br>4. Optionally add a `grafana` service to `docker-compose.yml` for local dashboards. |
| **Logging is basic `print`** | Switch to structured logging (JSON) with log levels | 1. Replace `print` statements with `logging.getLogger(__name__)`.<br>2. Configure `logging.config.dictConfig` to output JSON in production.<br>3. Keep readable format in dev via env var. |

---

## 3. CI/CD & Quality Gates

| Issue | Recommendation | Steps |
|-------|----------------|-------|
| **No CI pipeline** (tests run manually) | Add GitHub Actions to run lint, tests, and build on every push | 1. Create `.github/workflows/ci.yml`.<br>2. Jobs: `setup` (checkout, setup Python/Node), `lint` (run `make lint`), `test` (run `make test` inside backend container), `build` (docker compose build).<br>3. Use `services:` to spin up PostgreSQL for the test job.<br>4. Add a badge to README. |
| **No pre‑commit hooks** | Install `pre‑commit` with `ruff`, `trailing‑whitespace`, `end-of-file-fixer` | 1. Add `pre-commit` config (`.pre-commit-config.yaml`).<br>2. Run `pre-commit install`.<br>3. Add a `make format` target that runs `pre-commit run --all-files`. |
| **Test coverage unknown** | Add coverage reporting and enforce a minimum threshold | 1. Install `pytest-cov`.<br>2. Extend the `make test` target to run with `--cov=backend/xpenses --cov-report=term-missing`.<br>3. Add a gate in CI that fails if coverage < 80%. |

---

## 4. Feature Enhancements (Roadmap Alignment)

| Feature | Why it matters | Implementation Sketch |
|---------|----------------|-----------------------|
| **Email notifications** (approval, rejection, payment) | Keeps stakeholders informed without logging in | 1. Add an `email_service.py` using `aiosmtplib` (or a simple stub for dev).<br>2. Call it from `reports.py` after approval/rejection/payment.<br>3. Make SMTP settings configurable via env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).<br>4. Add unit tests that mock the SMTP client. |
| **Approval delegation & escalation** | Allows managers to appoint deputies when unavailable | 1. Add a `delegations` table (`delegator_id`, `delegate_id`, `start_date`, `end_date`).<br>2. Modify `require_role` dependency to also check active delegations.<br>3. Add UI in `/admin/delegations` (CFO‑only). |
| **Analytics & Reporting (Phase 6)** | Provides spend trends, budget vs. actual, CSV export | 1. Add a new router `/api/analytics` with endpoints: <br>   - `GET /spend-by-period?range=monthly` (returns chart‑ready JSON).<br>   - `GET /budget-vs-actual` (requires budget table).<br>   - `GET /export.csv` (streams CSV).<br>2. Use `pandas` only for the export endpoint (optional dependency).<br>3. Add a frontend `/analytics` page with recharts or similar (lightweight). |
| **Expense duplication** (Phase 7 QoL) | Saves time for recurring similar expenses | 1. Add a “Duplicate” action button on expense detail.<br>2. Endpoint `POST /expenses/{id}/duplicate` returns a new expense draft with same fields (except ID, date set to today).<br>3. Frontend shows a confirmation toast. |
| **Recurring expenses** (Phase 7 QoL) | Automates regular costs (subscriptions, monthly fees) | 1. Add `recurring_expenses` table (`template_expense_id`, `interval`, `next_due_date`).<br>2. Add a background job (via `APScheduler` or a simple cron inside the container) that creates draft expenses from templates.<br>3. UI to manage templates under `/expenses/recurring`. |
| **Manual FX override** (Phase 7 QoL) | Allows accounting to correct rates when needed | 1. Add a column `manual_fx_rate` nullable to `expenses`.<br>2. In FX service, if `manual_fx_rate` is set, use it instead of cached rate.<br>3. Add UI in expense edit form to optionally input a manual rate (visible only for non‑EUR currencies). |
| **CSV/Excel bulk import** (Phase 7 QoL) | Enables migration from other systems or bulk entry | 1. Add endpoint `POST /expenses/bulk` accepting a CSV file.<br>2. Validate each row, create expenses in a transaction.<br>3. Provide a downloadable template. |
| **Improve OCR language support** | Currently only EN+RO; add others as needed | 1. Make `OCR_LANGUAGES` a comma‑separated list in `.env`.<br>2. Update `ocr_service.py` to split and pass to EasyOCR reader.<br>3. Document supported languages in README. |

---

## 5. Technical Debt & Code Quality

| Item | Recommendation | Steps |
|------|----------------|-------|
| **Untyped or `any` in frontend** | Increase TypeScript strictness | 1. In `tsconfig.json` set `"strict": true` (or gradually enable `noImplicitAny`).<br>2. Fix resulting errors; use explicit types for API responses. |
| **Repeated datetime formatting** | Centralize date/time formatting utilities | 1. Create `backend/xpenses/utils/datetime.py` with a function `format_dt(dt: datetime) -> str`.<br>2. Replace all inline `strftime` calls. |
| **Hardcoded paths for receipts** (`/app/data/receipts/`) | Use configurable `DATA_DIR` from env | 1. Replace literal strings with `settings.DATA_DIR` (already imported in `storage.py`).<br>2. Ensure `DATA_DIR` ends with a slash. |
| **Missing API versioning** | Add a version prefix (`/api/v1/`) to ease future changes | 1. Update all routers to include `prefix="/api/v1"`.<br>2. Change `NEXT_PUBLIC_API_URL` and `INTERNAL_API_URL` to include `/api/v1`.<br>3. Keep a thin alias (`/api/...`) that redirects to v1 for backward compatibility during transition. |
| **Docker build uses `--reload`** (not ideal for production) | Separate dev and prod `docker-compose` files or override command | 1. Create `docker-compose.prod.yml` that uses `uvicorn xpenses.main:app --host 0.0.0.0 --port 8000` (no `--reload`).<br>2. In CI, build using the prod file.<br>3. Keep local dev file as is. |

---

## 6. Documentation & Onboarding

| Item | Recommendation | Steps |
|------|----------------|-------|
| **Architecture decision records (ADR)** | Capture why we chose asyncpg, Docker networking pattern, etc. | 1. Create `docs/adr/` with markdown files (e.g., `0001-asyncpg-over-orm.md`).<br>2. Populate with context, decision, consequences. |
| **Onboarding guide for new developers** | Reduce ramp‑up time | 1. Add `docs/DEVELOPMENT.md` covering: cloning, env setup, running services, running tests, common make targets, debugging tips (backend logs, frontend hot‑reload). |
| **API documentation visibility** | Ensure Swagger UI is reachable and described | 1. In `main.py`, set `docs_url="/docs"` and `redoc_url=None` (or keep both).<br>2. Add a note in README on how to access it (`http://localhost:8001/docs`). |
| **Changelog** | Track improvements per release | 1. Keep a `CHANGELOG.md` following Keep a Changelog format.<br>2. Add entries for each major feature/fix. |

---

## 7. Quick‑Start “Next Actions” (Pick One)

If you want to deliver visible value quickly, start with **email notifications** (Phase 5) because:
* It touches only a few backend files and a small frontend tweak (toast or banner).
* It provides immediate user benefit (managers/CFOs get notified when a report needs action).
* It can be implemented in < 2 hours and tested with a local SMTP server (e.g., `python -m smtpd -c DebuggingServer -l localhost:1025`).

**Proposed steps for email notifications:**
1. Add `aiosmtplib` and `email-validator` to `pyproject.toml`.  
2. Create `backend/xpenses/services/email_service.py` with a `send_template` function.  
3. In `routers/reports.py`, after each state transition (approve, reject, pay) call the service with appropriate template (subject/body from Jinja2 strings).  
4. Add SMTP settings to `.env.example` and `.env` (defaults to a debugging sink).  
5. Write a unit test that mocks `aiosmtplib.SMTP` and verifies the correct method is called.  
6. Frontend: optionally show a toast “Notification sent” after approval/rejection (use existing toast system).  

---

**Summary**  
The application is already solid and feature‑rich. The proposed improvements focus on **security, observability, CI/CD, and the next logical features** (email notifications, analytics, QoL enhancements) while paying down technical debt. Implementing even a subset of these will make the system more production‑ready, easier to maintain, and more valuable to end‑users. 

Feel free to ask for a deeper dive into any specific area (e.g., exact code changes for the datetime fix, or a draft GitHub Actions workflow). Happy coding!