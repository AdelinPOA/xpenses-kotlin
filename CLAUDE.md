# xpenses — Claude Code Instructions

## Project Tracking (MANDATORY)

You MUST keep project documentation up to date at ALL times. This is not optional.

### At the START of every session:
1. Read `HANDOFF.md` and `README.md` to understand current project state
2. Check `git status` and `docker ps` to verify running state matches docs

### During work:
1. Track what you're changing — files modified, bugs fixed, features added
2. If you create new files, services, or change architecture, note it immediately
3. If you discover or fix bugs, document the root cause and fix

### At the END of every session (or when the user says they're done):
1. **Update `HANDOFF.md`** with:
   - What was done this session
   - Current state of all services (running/stopped/broken)
   - Any uncommitted changes
   - Known issues discovered
   - What's next / unfinished work
2. **Update `README.md`** if any of these changed:
   - Features (added/removed/modified)
   - Tech stack or dependencies
   - Environment variables
   - Project structure (new files/directories)
   - Current status / roadmap checkboxes
3. **Commit and push to GitHub**:
   ```bash
   git add HANDOFF.md README.md [any other changed .md files]
   git commit -m "Update project docs — [brief description]"
   git push origin main
   ```

### Rules:
- GitHub is the single source of truth — not local memory files
- Never leave a session with outdated docs
- Always push docs to GitHub so the next session has accurate state
- When in doubt, update HANDOFF.md — it's cheaper to over-document than to lose context

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.12 (asyncpg, raw SQL) |
| Database | PostgreSQL 16 |
| Frontend | Next.js 15 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query v5 |
| PDF | reportlab + pypdf |
| Containers | Docker Compose (3 services: db, backend, frontend) |

## Ports

- Frontend: `3001` (mapped to container 3000)
- Backend API: `8001` (mapped to container 8000)
- PostgreSQL: `5432` (internal only, not exposed)

## Key Architecture Notes

- **No ORM** — raw SQL with asyncpg (`$1, $2` placeholders, not `?`)
- **asyncpg type strictness** — use native Python `datetime` objects for TIMESTAMPTZ columns, never `.isoformat()` strings
- **`get_pool()`** — services outside FastAPI DI (like `fx_service.py`) use `get_pool().acquire()`, not the `get_db()` dependency
- **Docker networking** — frontend uses `INTERNAL_API_URL=http://backend:8000/api` for server-side proxy; `localhost` inside containers refers to the container itself
- **FX rates** — primary: Frankfurter API (ECB), fallback: fawazahmed0/currency-api; cached per (currency, date) in PostgreSQL

## GitHub

- **Repo:** `AdelinPOA/xpenses`
- **Branch:** `main`
- Always commit and push after completing work
