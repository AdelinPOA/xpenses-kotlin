# xpenses

Self-hosted expense management app for internal company use. Built as a lightweight alternative to Zoho Expenses — no cloud dependency, no monthly costs.

## Features

- **Expenses CRUD** — create, edit, delete expenses with merchant, category, date, description
- **Multi-currency** — supports 50+ currencies with automatic EUR conversion using ECB rates (Frankfurter API + fallback provider for exotic currencies like UAH, GEL, HUF, etc.)
- **Multiple receipts** — attach multiple photos/PDFs per expense (JPG, PNG, PDF, WEBP)
- **Expense reports** — group expenses into reports with date range (draft → submitted → paid)
- **Report recall** — retract a submitted report back to draft
- **PDF export** — Zoho-style PDF with company branding, FX rates per expense, currency summary, reimbursable summary, signature area, and 2-per-row receipt grid with merged PDF receipts
- **Receipts ZIP download** — download all receipts from a report as a ZIP file
- **Categories** — with optional EUR spending limits
- **Dashboard** — monthly totals, spend by category, recent expenses

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.12 |
| Database | PostgreSQL 16 (asyncpg) |
| Frontend | Next.js 15 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query v5 |
| PDF generation | reportlab + pypdf |
| Containerization | Docker Compose (3 services: db, backend, frontend) |

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
├── backend/
│   └── xpenses/
│       ├── main.py              # FastAPI app, CORS, lifespan
│       ├── database.py          # PostgreSQL pool, schema, init
│       ├── models.py            # Pydantic models
│       ├── config.py            # Settings (pydantic-settings)
│       ├── assets/
│       │   └── company_logo.png # NT logo for PDF export
│       ├── routers/
│       │   ├── expenses.py      # CRUD + receipt upload
│       │   ├── reports.py       # Reports + attach/submit/recall/export
│       │   ├── categories.py    # Categories CRUD
│       │   └── dashboard.py     # Dashboard stats
│       └── services/
│           ├── fx_service.py    # FX rate fetching + caching (asyncpg)
│           ├── pdf_export.py    # PDF report generation (Zoho-style)
│           └── storage.py       # Receipt file storage
├── frontend/
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # React components
│   ├── lib/                     # API client, types, query keys
│   └── public/
│       └── logo.png             # NT logo for sidebar
└── docker-compose.yml           # PostgreSQL + backend + frontend
```

## Docker Compose Services

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| `db` | postgres:16-alpine | 5432 (internal) | Health check with `pg_isready` |
| `backend` | Python 3.12 + FastAPI | 8001 → 8000 | Hot-reload via volume mount |
| `frontend` | Node 22 + Next.js 15 | 3001 → 3000 | Turbopack dev server |

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
| `COMPANY_NAME` | `Newtech Automation` | Company name in PDF exports |
| `SUBMITTER_NAME` | `Popescu Adelin` | Submitter name in PDF exports |
| `SUBMITTER_EMAIL` | `adelin.popescu@nt-automation.eu` | Submitter email in PDF exports |

## Current Status

**Phase 3 complete** — PostgreSQL migration done, PDF export matches Zoho quality.

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
- [ ] Authentication (see roadmap)

## Roadmap

### Phase 4 — Authentication & Users
- Active Directory / LDAP integration for production
- JWT-based auth for dev/testing
- User roles (submitter, approver, admin)
- Per-user expense and report isolation

### Phase 5 — Approval Workflow
- Manager approval step (submitted → approved → paid)
- Email notifications on status changes
- Approval delegation

### Phase 6 — Analytics & Reporting
- Spend trends over time (charts)
- Category budget vs. actual tracking
- Per-user / per-team spending reports
- CSV/Excel export

### Phase 7 — Quality of Life
- Dark mode
- Mobile-responsive improvements
- Expense duplication
- Recurring expenses
- OCR receipt scanning (auto-fill merchant, amount, date)
- Manual FX rate override option
- Bulk expense import from CSV

### Phase 8 — Production Hardening
- Backup/restore tooling
- Audit log (who changed what, when)
- Rate limiting and API key auth
- Monitoring and health checks

## License

Private — internal use only.
