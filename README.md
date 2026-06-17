# xpenses-kotlin

Self-hosted expense management application for internal company use. Built with a **Kotlin + Spring Boot 3.4** backend (MVC + JPA/Hibernate), **Next.js 15** frontend, and **PostgreSQL 16** database, all orchestrated via Docker Compose.

## Features

- **Expenses CRUD** — create, edit, delete, duplicate expenses with merchant, category, date, description
- **Multi-currency** — 200+ currencies with automatic EUR conversion using ECB rates (Frankfurter API + fawazahmed0 fallback); rates cached per (currency, date)
- **Multiple receipts & interactive preview** — attach multiple photos/PDFs per expense (JPG, PNG, PDF, WEBP, max 10MB), with side-by-side interactive zoom & pan preview in create/edit forms
- **Expense reports** — group expenses into reports with date range; full state machine workflow
- **Approval workflow** — managers and CFOs approve/reject submitted reports; rejection reason captured; cannot approve your own report
- **Report recall** — retract a submitted or rejected report back to draft
- **PDF export** — Zoho-style PDF with company branding, FX rates per expense, currency summary, reimbursable summary, digital signature area, and 2-per-row receipt grid with merged PDF receipts
- **Excel/CSV export** — export expense data via Apache POI
- **Receipts ZIP download** — download all report receipts as a single ZIP
- **Advance payments** — full workflow for requesting, approving, and attaching cash advances to reports; manager direct-pay support
- **Mileage recording** — km tracking with driving time (start/end), dual tax rates (before/after), CFO-editable rates via settings
- **Digital signatures** — canvas-based signature pad; sign reports with one click; stored per-user
- **Categories** — with optional EUR spending limits
- **OCR receipt scanning** — hybrid local & cloud system: EasyOCR (local), Gemini 2.5 Flash (cloud), MinerU (opt-in local); auto-fill category, description, amount, currency, date, merchant, tax; includes Naive Bayes category classifier
- **Email receipt import** — IMAP-based ingestion with side-by-side local & Gemini parsing
- **Dashboard** — monthly totals, spend by category (clickable), recent expenses (clickable), time-of-day greetings, role-specific action cards
- **Role-differentiated UX** — 4 roles (Technician, Manager, Chef of Finances, Moderator); each sees only relevant actions
- **LDAP/AD integration** — production authentication with Moderator-managed config, sync, and test UI
- **Email notifications** — async SMTP notifications on report status changes
- **Dark mode** — system preference detection + manual toggle (light/dark/system)
- **Mobile responsive** — collapsible sidebar drawer, responsive tables, flex-wrap filters

## Report State Machine

```
draft → submitted → approved → paid
                  → rejected (expenses detached, reset to draft)
submitted → draft (via recall, by owner)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Kotlin 2.1 / Spring Boot 3.4.3 / MVC + JPA/Hibernate |
| Database | PostgreSQL 16 (Flyway migrations) |
| Frontend | Next.js 15 + React 19 + TypeScript 5 |
| Styling | Tailwind CSS v4 (CSS-first config) |
| Data fetching | TanStack Query v5 + axios |
| Forms & validation | react-hook-form 7 + zod 4 |
| PDF generation | OpenPDF 2.0 + PDFBox 3.0 |
| Excel export | Apache POI 5.3 |
| OCR | EasyOCR (sidecar) + Gemini 2.5 Flash (cloud) + MinerU 2.5 (opt-in) |
| Auth | JWT (access 15min + refresh 7d) in httpOnly cookies |
| Containerization | Docker Compose (5 services) |

## Quick Start

```bash
cp .env.example .env
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3001 |
| Backend API | http://localhost:8001/api |
| Health check | http://localhost:8001/api/health |

**Test accounts** (when `SEED_DEMO_USERS=true`):

| User | Password | Role |
|------|----------|------|
| `tech1` | `tech1` | Technician |
| `manager1` | `manager1` | Manager |
| `cfo1` | `cfo1` | Chef of Finances |
| `mod1` | `mod1` | Moderator |

## Project Structure

```
xpenses-kotlin/
├── backend-kotlin-jpa/          # Kotlin Spring Boot backend
│   ├── src/main/kotlin/         #   13 controllers, 11 services, models, repositories
│   ├── src/main/resources/      #   application.yml & Flyway migrations
│   ├── build.gradle.kts         #   Spring Boot 3.4.3, Kotlin 2.1.0
│   └── Dockerfile
├── frontend/                    # Next.js 15 frontend
│   ├── app/                     #   App Router pages (10 route groups + admin panel)
│   ├── components/              #   React components (dashboard, expenses, layout, ui)
│   ├── lib/                     #   API client, auth, query keys, themes
│   └── Dockerfile
├── ocr-sidecar/                 # Python FastAPI — EasyOCR microservice
│   ├── app.py
│   └── Dockerfile
├── mineru/                      # MinerU 2.5 local OCR (opt-in profile)
│   └── Dockerfile
├── docker-compose.yml           # Service orchestration
├── Makefile                     # Common dev commands
├── .env / .env.example          # Environment configuration
├── HANDOFF.md                   # Session-by-session development history
└── GEMINI.md                    # AI assistant instructions (Antigravity)
```

## Backend Architecture

The backend is built with **Spring Boot 3.4.3** + **Spring MVC** + **JPA/Hibernate** running on **Kotlin 2.1**.

- **13 controllers**: Auth, Expenses, Reports, Dashboard, Categories, Users, Advances, Mileage, Signatures, OCR, LDAP Settings, App Settings, Health
- **11 services**: FX conversion, PDF generation, OCR (hybrid), email, LDAP, storage, crypto, export, and more
- **Flyway migrations** for schema management
- **Spring Security** with JWT filter chain
- **@Async** email notifications on report status changes

## Docker Compose Services

| Service | Build Context | Ports | Notes |
|---------|--------------|-------|-------|
| `db` | `postgres:16-alpine` | 5432 (internal) | Health check via `pg_isready` |
| `backend` | `./backend-kotlin-jpa` | 8001 → 8080 | Kotlin Spring Boot backend |
| `frontend` | `./frontend` | 3001 → 3000 | Next.js Turbopack dev server |
| `ocr-sidecar` | `./ocr-sidecar` | 8004 → 5000 | EasyOCR (en + ro), CPU-only |
| `mineru` | `./mineru` | 8002 → 8000 | Opt-in: `docker compose --profile mineru up` |

**Volumes**: `pgdata`, `xpenses-data`, `ocr-models`, `mineru-models`
**Network**: `xpenses-net` (bridge), backend uses public DNS (`8.8.8.8`, `1.1.1.1`)

## Frontend Architecture

**Dual-URL pattern** for Docker networking:

| Context | Variable | URL |
|---------|----------|-----|
| Server-side (SSR/rewrites) | `INTERNAL_API_URL` | `http://backend:8080/api` |
| Client-side (browser) | `NEXT_PUBLIC_API_URL` | `http://localhost:8001/api` |

**Pages**: Dashboard, Expenses (list/new/edit), Reports (list/new/edit), Advances, Approvals, Payments, Categories, Profile, Admin panel (Email, IMAP, LDAP, OCR, Receipts, Settings, Storage, Users)

**Auth flow**: `AuthProvider` context → `useAuth()` hook → `JwtAuthenticationFilter` on backend. Next.js `middleware.ts` redirects unauthenticated users by checking the `access_token` cookie.

## API Endpoints

All routes prefixed with `/api/`.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/change-password` |
| Expenses | `GET/POST /expenses`, `GET/PUT/DELETE /expenses/:id`, `POST /expenses/:id/receipts`, `POST /expenses/:id/scan` |
| Reports | `GET/POST /reports`, `GET/PUT/DELETE /reports/:id`, `POST /reports/:id/submit\|approve\|reject\|pay\|recall`, `GET /reports/:id/pdf\|receipts-zip` |
| Advances | `GET/POST /reports/:id/advances`, `GET /advances/pending`, `POST /advances/:id/pay` |
| Mileage | `GET/POST/DELETE /reports/:id/mileage` |
| Signatures | `POST /users/me/signature`, `POST /reports/:id/sign` |
| Categories | `GET/POST /categories`, `PUT/DELETE /categories/:id` |
| Dashboard | `GET /dashboard` |
| Users | `GET/POST /users`, `PUT /users/:id` |
| Settings | `GET/PATCH /settings/mileage-rates`, `GET/PATCH /settings/ocr`, `GET/PATCH /settings/email`, `GET/PATCH /settings/imap`, `GET/PATCH /settings/storage`, `GET/PATCH /settings/daily-allowance-rate` |
| LDAP | `GET/PATCH /settings/ldap`, `POST /settings/ldap/test\|sync` |
| Health | `GET /health` |

## FX Rate Conversion

1. **Primary**: Frankfurter API (ECB rates, ~30 major currencies)
2. **Fallback**: fawazahmed0/currency-api (200+ currencies including UAH, GEL, HUF, etc.)
3. Rates cached in PostgreSQL per `(currency, date)` pair
4. Changing amount/currency/date on an expense triggers automatic recalculation

## OCR System

Three providers with automatic fallback:

| Provider | Type | Setup |
|----------|------|-------|
| **EasyOCR** | Local (sidecar) | Always available, en + ro |
| **Gemini 2.5 Flash** | Cloud API | API key configured in admin panel |
| **MinerU 2.5** | Local (opt-in) | `docker compose --profile mineru up` |

Features:
- Structured JSON extraction (category, description, amount, currency, date, merchant, tax)
- Naive Bayes category classifier trained on historical scan texts
- Drag-and-drop receipt upload with full form autofill

## Makefile

```bash
make up          # docker compose up -d --build
make down        # docker compose down
make rebuild     # rebuild backend only
make logs        # tail backend logs
make build       # build JAR locally (./gradlew bootJar)
make test-health # curl /api/health
make test-login  # curl POST /api/auth/login (tech1)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3001,http://127.0.0.1:3001` | Allowed CORS origins (comma-separated string) |
| `DATA_DIR` | `/app/data` | Receipts storage path |
| `DEFAULT_CURRENCY` | `EUR` | Base currency for conversions |
| `JWT_SECRET` | (required) | Secret for signing JWT tokens. A secure, non-blank value must be configured for production startup. |
| `COOKIE_SECURE` | `false` | Set `true` in production (HTTPS-only cookies) |
| `SEED_DEMO_USERS` | `false` | Seeding of demo accounts (`tech1`, `manager1`, etc.). Defaults to `false`. |
| `COMPANY_NAME` | `Newtech Automation` | Company name in PDF exports |

## Testing

The backend includes a comprehensive unit and integration test suite (JUnit 5 + MockMvc + Testcontainers).

To run all tests locally:
```bash
# Execute within backend-kotlin-jpa directory
./gradlew test
```

## Local Development Requirements

### JDK Version

The Kotlin backend (Kotlin 2.1.0) requires **JDK 21 or 22**. It does not compile on JDK 23+.

```bash
# Check your JDK version
make check-java-version

# If using SDKMAN!, install and use JDK 21:
sdk install java 21.0.8-tem
sdk use java 21.0.8-tem

# The project includes a .java-version file for SDKMAN!/jEnv/asdf
```

**If you're on JDK 25+**, use the Docker-based build instead (the container uses `eclipse-temurin:21-jre-alpine`):
```bash
make build   # runs check-java-version first, fails with clear message on wrong JDK
docker compose up -d --build   # works regardless of host JDK
```

## Roadmap

- [x] Unit & integration test suite (JUnit 5 + MockMvc)
- [x] Rate limiting
- [ ] Spend trends over time (charts)
- [ ] Category budget vs. actual tracking
- [ ] Per-user / per-team spending reports
- [ ] Recurring expenses
- [ ] Manual FX rate override
- [ ] Bulk expense import from CSV
- [ ] Backup/restore tooling
- [ ] Audit log (who changed what, when)

## License

Private — internal use only.

