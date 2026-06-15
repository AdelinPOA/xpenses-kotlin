# xpenses-kotlin

Self-hosted expense management app for internal company use. This repository is a fork representing the migration and rewrite of the backend in **Kotlin (Spring Boot WebFlux & Coroutines)**.

See the [Kotlin Migration Plan](file:///home/poa/xpenses-kotlin/kotlin_migration_plan.md) for the architecture design, technology choices, and step-by-step roadmap.
Also see the [GraalVM Native Image Blueprint](file:///home/poa/.gemini/antigravity-cli/brain/23454a6c-af66-4fbd-be99-6a79c289c9eb/kotlin_migration_blueprint.md) for JPA JOIN FETCH optimization, multi-stage native Dockerfile config, and resource-constrained Kubernetes deployment configurations.

## Features

- **Expenses CRUD** — create, edit, delete expenses with merchant, category, date, description
- **Multi-currency** — supports 50+ currencies with automatic EUR conversion using ECB rates (Frankfurter API + fallback provider for exotic currencies like UAH, GEL, HUF, etc.)
- **Multiple receipts & interactive preview** — attach multiple photos/PDFs per expense (JPG, PNG, PDF, WEBP), with side-by-side interactive image zoom & pan preview directly in the creation/edit forms.
- **Expense reports** — group expenses into reports with date range; full state machine: `draft → submitted → approved → paid`, with recall and reject
- **Report approval workflow** — managers and CFOs approve/reject submitted reports; rejection reason captured and displayed prominently; cannot approve your own report
- **Report recall** — retract a submitted or rejected report back to draft
- **PDF export** — Zoho-style PDF with company branding, FX rates per expense, currency summary, reimbursable summary, signature area, and 2-per-row receipt grid with merged PDF receipts
- **Receipts ZIP download** — download all receipts from a report as a ZIP file
- **Advance payments** — full workflow for requesting, approving, and attaching cash advances to reports
- **Mileage recording** — km tracking with driving time (start/end), dual tax rates (before/after), CFO-editable rates via settings
- **Digital signatures** — canvas-based signature pad; sign reports with one click
- **Categories** — with optional EUR spending limits
- **Dashboard** — monthly totals, spend by category (clickable, links to filtered expenses), recent expenses (clickable), role-specific action cards
- **Role-differentiated UX** — each role sees only the actions relevant to them; managers see approval queue, CFO sees payment queue

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Kotlin 2.1.0 / Spring Boot 3.4.3 (JPA/Hibernate) |
| Database | PostgreSQL 16 (JDBC) |
| Frontend | Next.js 15 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query v5 |
| PDF generation | OpenPDF + PDFBox |
| Containerization | Docker Compose (5 services: db, backend, frontend, mineru, ocr-sidecar) |
| AI Workflow | Antigravity (Gemini-powered assistant) + Subagents & slash commands |

## Quick Start

```bash
cp .env.example .env
docker compose up -d --build
```

- Frontend: http://localhost:3001
- Backend API: http://localhost:8001/api
- PostgreSQL: internal (port 5432, not exposed)

## Project Structure

```
xpenses/
├── backend-kotlin-jpa/          # Kotlin Spring Boot JPA Backend
│   ├── src/
│   │   ├── main/
│   │   │   ├── kotlin/          # Kotlin MVC Controllers & Services
│   │   │   └── resources/       # Application config & Flyway migrations
│   │   └── test/
│   ├── build.gradle.kts
│   └── Dockerfile
├── ocr-sidecar/                 # Python EasyOCR API microservice
│   ├── app.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                    # Next.js Frontend (unchanged)
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # React components
│   ├── lib/                     # API client, types, themes (role colors)
│   └── public/
└── docker-compose.yml           # PostgreSQL + backend + frontend + sidecars
```

## Docker Compose Services

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| `db` | postgres:16-alpine | 5432 (internal) | Health check with `pg_isready` |
| `backend` | Kotlin + Spring Boot | 8001 → 8080 | Active Java JVM MVC backend |
| `frontend` | Node 22 + Next.js 15 | 3001 → 3000 | Turbopack dev server |
| `ocr-sidecar` | Python + EasyOCR | 8004 → 5000 | Persistent EasyOCR scanner |
| `mineru` | Python + MinerU | 8002 → 8000 | Optional local MinerU API |

## FX Rate Conversion

Expenses in any currency are automatically converted to EUR at the date of the expense:

1. **Primary**: Frankfurter API (ECB rates, ~30 major currencies)
2. **Fallback**: fawazahmed0/currency-api (200+ currencies)
3. Rates are cached in PostgreSQL per (currency, date) pair

## PDF Export

The PDF export matches Zoho Expenses quality:

- Company logo + name (Newtech Automation)
- Report ID, status, total amount
- Submitted By (name + email)
- Report duration in DD.MM.YYYY format
- Expense summary table with FX rates per expense
- Report summary by currency (breakdown per currency with EUR equivalents)
- Report summary (Total - Non Reimbursable - Advance = Total Reimbursable)
- Signature area
- Receipt images in 2-per-row grid layout
- PDF receipts merged as additional pages

## Report Workflow

1. Create expenses (draft)
2. Create a report with title, date range, description
3. Attach expenses to the report
4. Submit the report (expenses + report move to "submitted")
5. Mark as paid when reimbursed
6. Recall to draft if needed (revert submitted → draft)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `["http://localhost:3001"]` | Allowed CORS origins |
| `DATA_DIR` | `/app/data` | Receipts storage path |
| `DEFAULT_CURRENCY` | `EUR` | Base currency |
| `DATABASE_URL` | `postgresql://xpenses:xpenses@db:5432/xpenses` | PostgreSQL connection (set in docker-compose) |
| `JWT_SECRET` | (random) | Secret for signing JWT tokens (set a stable value in prod) |
| `COOKIE_SECURE` | `false` | Set `true` in production (HTTPS-only cookies) |
| `SEED_DEMO_USERS` | `true` | Set `false` in production (disables test accounts) |
| `COMPANY_NAME` | `Newtech Automation` | Company name in PDF exports |
| `SUBMITTER_NAME` | `Popescu Adelin` | Submitter name in PDF exports |
| `SUBMITTER_EMAIL` | `adelin.popescu@nt-automation.eu` | Submitter email in PDF exports |

## Current Status

**Kotlin backend JVM/AOT migration + Phase 7 complete** — Developed a fully functioning Spring Boot 3.4.3 + JPA Kotlin backend microservice running on JVM (development) and supporting GraalVM Native Image (production compilation) inside Docker, featuring eager `JOIN FETCH` queries, circular reference checks, and transaction handling.

- [x] Spring Boot 3.x + JPA Kotlin backend migration blueprint & implementation (JVM & Native support)
- [x] Expenses CRUD with multi-currency FX conversion
- [x] Multiple receipt uploads per expense
- [x] Expense reports with date range, attach/submit/recall workflow
- [x] PDF export with company branding, FX rates, currency summary, signature area
- [x] Receipts ZIP download
- [x] Categories with EUR spending limits
- [x] Dashboard with monthly EUR totals and spend by category
- [x] Docker Compose with PostgreSQL + backend + frontend
- [x] FX fallback provider for 200+ currencies
- [x] Company branding (NT logo in sidebar + PDF)
- [x] JWT authentication with httpOnly cookies (access + refresh tokens)
- [x] 4 roles: Technician, Manager, Chef of Finances, Moderator
- [x] Approval workflow: submit → approve → pay (or reject)
- [x] Role-based UI: login page, role-aware sidebar, approvals/payments/user management pages
- [x] Data isolation: users only see their own expenses/reports
- [x] Local test accounts (tech1, manager1, cfo1, mod1) for development
- [x] LDAP integration with dedicated Moderator UI for configuration and sync
- [x] Dark mode with system preference detection + manual toggle (light/dark/system)
- [x] Mobile responsive layout (collapsible sidebar drawer, responsive tables, flex-wrap filters)
- [x] OCR receipt scanning (auto-fill merchant, amount, date)
- [x] Mileage recording with driving time tracking + dual tax rates (CFO-editable)
- [x] UI/UX Redesign: Personalized dashboard with time-of-day greetings and contextual action cards
- [x] Signature Pad: Fixed drawing offset via coordinate scaling; full responsiveness
- [x] Backend test suite (185 tests: auth, expenses, reports, advances, mileage, settings, categories, users, ocr, ldap)
- [x] Email delegation ingestion with side-by-side Local (multilingv) & Gemini parsing simulation
- [x] Linting with ruff + Makefile workflow

## Roadmap

### Phase 4 — Authentication & Users
- [x] Active Directory / LDAP integration for production
- [x] JWT-based auth for dev/testing
- [x] User roles (submitter, approver, admin)
- [x] Per-user expense and report isolation

### Phase 5 — Approval Workflow
- [x] Manager approval step (submitted → approved → paid)
- [x] Email notifications on status changes


### Phase 6 — Analytics & Reporting
- Spend trends over time (charts)
- Category budget vs. actual tracking
- Per-user / per-team spending reports
- CSV/Excel export

### Phase 7 — Quality of Life
- [x] Dark mode
- [x] Mobile-responsive improvements
- [x] OCR receipt scanning (auto-fill merchant, amount, date)
- [x] Expense duplication
- Recurring expenses
- Manual FX rate override option
- Bulk expense import from CSV

### Phase 8 — Production Hardening
- Backup/restore tooling
- Audit log (who changed what, when)
- Rate limiting and API key auth
- Monitoring and health checks

## License

Private — internal use only.
