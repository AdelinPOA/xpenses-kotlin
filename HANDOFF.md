# HANDOFF.md — xpenses_copy

> Last updated: 2026-05-31 (session 4)  
> Author: Claude (AI assistant session)

---

## What This Project Is

Self-hosted expense management app (alternative to Zoho Expenses). FastAPI backend + Next.js frontend + PostgreSQL, running in Docker Compose on port 3001 (frontend) / 8001 (backend API).

## Current State: OPERATIONAL (Phase 4 Complete)

All 3 Docker containers running, all endpoints healthy:

| Service | Container | Port | Status |
|---------|-----------|------|--------|
| PostgreSQL 16 | `xpenses-db` | 5432 (internal) | Healthy |
| FastAPI backend | `xpenses-backend` | 8001 → 8000 | `{"status":"ok"}` |
| Next.js frontend | `xpenses-frontend` | 3001 → 3000 | Serving (307 redirect to /login if unauthenticated) |

## Latest Session (2026-05-31, session 4)

### What Was Done
- **Security hardening** (from automated security review):
  - Added `COOKIE_SECURE` setting — cookies get `secure=True` in production (HTTPS-only)
  - Changed refresh token cookie `samesite` from `lax` to `strict` (CSRF protection)
  - Gated seed users behind `SEED_DEMO_USERS=true` flag — set `false` in production to prevent shipping known credentials
- No functional changes — all existing features work identically

### Production .env Requirements
```
COOKIE_SECURE=true
SEED_DEMO_USERS=false
```

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

## What's Next (from README roadmap)

- **Phase 5**: Approval Workflow enhancements (email notifications, delegation)
- **Phase 6**: Analytics & Reporting (trends, budgets, CSV export)
- **Phase 7**: Quality of Life (dark mode, mobile, OCR)
- **Production**: Set `LDAP_ENABLED=true`, implement LDAP bind, deploy on company server

---

## How to Resume

1. `cd /home/poa/xpenses_copy`
2. `docker compose up -d` (containers should already be running)
3. Open http://localhost:3001 → login with any test account
4. API docs at http://localhost:8001/docs (FastAPI Swagger)
