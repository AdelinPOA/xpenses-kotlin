# xpenses

Self-hosted expense management app for internal company use. Built as a lightweight alternative to Zoho Expenses — no cloud dependency, no monthly costs.

## Features

- **Expenses CRUD** — create, edit, delete expenses with merchant, category, date, description
- **Multi-currency** — supports 50+ currencies with automatic EUR conversion using ECB rates (Frankfurter API + fallback provider for exotic currencies like UAH, GEL, etc.)
- **Multiple receipts** — attach multiple photos/PDFs per expense (JPG, PNG, PDF, WEBP)
- **Expense reports** — group expenses into reports with date range (draft → submitted → paid)
- **Report recall** — retract a submitted report back to draft
- **PDF export** — generates a formatted PDF with expense table (# ID, Original + EUR columns) and embedded receipt images/PDFs
- **Receipts ZIP download** — download all receipts from a report as a ZIP file
- **Categories** — with optional EUR spending limits
- **Dashboard** — monthly totals, spend by category, recent expenses

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.12 |
| Database | SQLite (aiosqlite, WAL mode) |
| Frontend | Next.js 15 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query v5 |
| PDF generation | reportlab + pypdf |
| Containerization | Docker Compose |

## Quick Start

```bash
cp .env.example .env
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8001/api

## Project Structure

```
xpenses/
├── backend/
│   └── xpenses/
│       ├── main.py              # FastAPI app, CORS, lifespan
│       ├── database.py          # Schema, migrations, init
│       ├── models.py            # Pydantic models
│       ├── config.py            # Settings (pydantic-settings)
│       ├── routers/
│       │   ├── expenses.py      # CRUD + receipt upload
│       │   ├── reports.py       # Reports + attach/submit/recall/export
│       │   ├── categories.py    # Categories CRUD
│       │   └── dashboard.py     # Dashboard stats
│       └── services/
│           ├── fx_service.py    # FX rate fetching + caching
│           ├── pdf_export.py    # PDF report generation
│           └── storage.py       # Receipt file storage
├── frontend/
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # React components
│   └── lib/                     # API client, types, query keys
└── docker-compose.yml
```

## FX Rate Conversion

Expenses in any currency are automatically converted to EUR at the date of the expense:

1. **Primary**: Frankfurter API (ECB rates, ~30 major currencies)
2. **Fallback**: fawazahmed0/currency-api (200+ currencies)
3. Rates are cached in the database per (currency, date) pair

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
| `CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
| `DATA_DIR` | `/app/data` | Database and receipts storage path |
| `DEFAULT_CURRENCY` | `EUR` | Base currency |

## Current Status

**Phase 2 complete** — the app is fully functional for personal/testing use without authentication.

- [x] Expenses CRUD with multi-currency FX conversion
- [x] Multiple receipt uploads per expense
- [x] Expense reports with date range, attach/submit/recall workflow
- [x] PDF export with receipt embedding + receipts ZIP download
- [x] Categories with EUR spending limits
- [x] Dashboard with monthly EUR totals and spend by category
- [x] Docker named volume for data persistence
- [x] FX fallback provider for 200+ currencies
- [ ] Authentication (see roadmap)

## Roadmap

### Phase 3 — Authentication & Users
- Active Directory / LDAP integration for production
- JWT-based auth for dev/testing
- User roles (submitter, approver, admin)
- Per-user expense and report isolation

### Phase 4 — Approval Workflow
- Manager approval step (submitted → approved → paid)
- Email notifications on status changes
- Approval delegation

### Phase 5 — Analytics & Reporting
- Spend trends over time (charts)
- Category budget vs. actual tracking
- Per-user / per-team spending reports
- CSV/Excel export

### Phase 6 — Quality of Life
- Dark mode
- Mobile-responsive improvements
- Expense duplication
- Recurring expenses
- OCR receipt scanning (auto-fill merchant, amount, date)
- Manual FX rate override option
- Bulk expense import from CSV

### Phase 7 — Production Hardening
- PostgreSQL migration option
- Backup/restore tooling
- Audit log (who changed what, when)
- Rate limiting and API key auth
- Monitoring and health checks

## License

Private — internal use only.
