# Phase 4: Authentication & Role-Based Access Control

## Overview

Add authentication and four-role authorization to xpenses. Production will use Active Directory / LDAP for identity verification, with roles managed in-app by a MOD user. Local test accounts bridge development until the AD/LDAP switch.

## Roles

| Role | Description |
|------|-------------|
| `technician` | Default role. Creates expenses and submits reports. Sees only their own data. |
| `manager` | Approves or rejects submitted reports from any technician. Can also create own expenses/reports. |
| `chef_finance` | Marks approved reports as paid. Can view all reports across the organization. Can also approve. |
| `mod` | App administrator. Manages categories, settings, users, and roles. No financial authority. |

### Permission Matrix

| Action | Technician | Manager | Chef of Finances | MOD |
|--------|-----------|---------|-----------------|-----|
| Create/edit own expenses | Yes | Yes | Yes | Yes |
| Submit expense reports | Yes | Yes | Yes | Yes |
| Approve/reject reports | No | Yes | Yes | No |
| Mark approved reports as paid | No | No | Yes | No |
| View all reports (across org) | No | No | Yes | Yes |
| Manage categories / settings | No | No | No | Yes |
| Manage users / roles | No | No | No | Yes |

Manager approval is not team-scoped — any Manager can approve any Technician's report (covers holidays and unavailability).

## Auth Strategy

**Approach:** JWT access tokens + refresh tokens, both in httpOnly cookies.

- Access token: JWT, 15-minute expiry, contains `user_id`, `username`, `role`
- Refresh token: opaque random string, 7-day expiry, stored hashed in PostgreSQL
- Token rotation on refresh (old refresh token deleted, new pair issued)
- Production: LDAP authenticates identity, app manages roles
- Development: local accounts with bcrypt password hashing

## Database Schema

### New Tables

```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    display_name  VARCHAR(200) NOT NULL,
    email         VARCHAR(200),
    password_hash VARCHAR(200),
    auth_source   VARCHAR(20) NOT NULL DEFAULT 'local',
    role          VARCHAR(20) NOT NULL DEFAULT 'technician',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_auth_source CHECK (auth_source IN ('local', 'ldap')),
    CONSTRAINT valid_role CHECK (role IN ('technician', 'manager', 'chef_finance', 'mod'))
);

CREATE TABLE refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(200) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Existing Table Changes

```sql
ALTER TABLE expenses ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE expense_reports ADD COLUMN user_id INTEGER REFERENCES users(id);
```

Existing rows (9 expenses, 2 reports) will be assigned to `tech1`'s user ID during migration.

## Authentication Flow

### Login (`POST /api/auth/login`)

1. Receive `username` + `password`
2. Look up user in `users` table, check `is_active`
3. If `auth_source = 'local'`: verify password with bcrypt
4. If `auth_source = 'ldap'` and `LDAP_ENABLED=true`: bind to AD/LDAP with credentials
5. On success: generate access JWT + refresh token, set as httpOnly cookies, return user profile

### Token Refresh (`POST /api/auth/refresh`)

1. Read `refresh_token` cookie
2. Hash it, look up in `refresh_tokens` table
3. If valid and not expired: delete old token, generate new access + refresh pair
4. If invalid or expired: clear cookies, return 401

### Logout (`POST /api/auth/logout`)

1. Delete refresh token from DB
2. Clear both cookies

### Backend Route Protection

- `get_current_user()` FastAPI dependency: extracts JWT from `access_token` cookie, decodes, returns user
- `require_role(*roles)` dependency: stacks on `get_current_user()`, raises 403 if user's role not in allowed list

### Frontend Route Protection

- Next.js middleware checks `access_token` cookie on all routes except `/login`
- Missing cookie → redirect to `/login`
- `AuthProvider` React context stores user profile + role from login
- `useAuth()` hook for accessing user info and `logout()`

## API Endpoints

### Auth Router (`/api/auth`)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Login |
| `POST` | `/api/auth/refresh` | Has refresh cookie | Rotate tokens |
| `POST` | `/api/auth/logout` | Authenticated | Logout |
| `GET` | `/api/auth/me` | Authenticated | Current user profile |

### Users Router (`/api/users`)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/users` | MOD | List all users |
| `GET` | `/api/users/{id}` | MOD | Get user details |
| `PUT` | `/api/users/{id}/role` | MOD | Change role |
| `PUT` | `/api/users/{id}/active` | MOD | Activate/deactivate |

### Changes to Existing Endpoints

All existing routes require `get_current_user()`.

- **Expenses**: scoped to `user_id` of current user
- **Reports**: scoped to `user_id` of current user (Technician/Manager see own; Chef of Finances/MOD see all)
- **Reports — new actions**:
  - `POST /api/reports/{id}/approve` — Manager, Chef of Finances
  - `POST /api/reports/{id}/pay` — Chef of Finances only
- **Categories**: gated to MOD role
- **Dashboard**: Technician sees personal stats; Chef of Finances and MOD see org-wide stats

### Report Status Flow

```
draft → submitted → approved → paid
                  ↘ rejected
```

`approved` and `rejected` are new statuses.

## Frontend Changes

### New Pages

| Page | Route | Access | Description |
|------|-------|--------|-------------|
| Login | `/login` | Public | Username + password form, no sidebar |
| User Management | `/admin/users` | MOD | List users, change roles, activate/deactivate |
| Approvals | `/approvals` | Manager, Chef of Finances | Submitted reports to review |
| Payments | `/payments` | Chef of Finances | Approved reports to mark as paid |

### Sidebar Updates

- Shows logged-in user's display name and role at bottom
- Navigation is role-aware:
  - **Technician**: Dashboard, Expenses, Reports
  - **Manager**: Dashboard, Expenses, Reports, Approvals
  - **Chef of Finances**: Dashboard, Expenses, Reports, Approvals, Payments
  - **MOD**: Dashboard, Expenses, Reports, Categories, Users
- Logout button

### Existing Page Modifications

- **Reports list**: scoped to current user, status badges include "approved" and "rejected"
- **Report detail**: shows approval/rejection info (who, when, comment)
- **Expenses list**: scoped to current user
- **Categories page**: only accessible to MOD
- **Dashboard**: personal stats for Technician, org-wide for Chef of Finances and MOD

## Seed Data

Four test users created on startup if `users` table is empty:

| Username | Password | Role | Display Name |
|----------|----------|------|-------------|
| `tech1` | `tech1` | technician | Ion Popescu |
| `manager1` | `manager1` | manager | Maria Ionescu |
| `cfo1` | `cfo1` | chef_finance | Elena Dumitrescu |
| `mod1` | `mod1` | mod | Admin Xpenses |

Passwords hashed with bcrypt. Seed runs in FastAPI lifespan after schema init, idempotent.

## LDAP Preparation

Not implemented now — only the wiring:

- `config.py` gets `LDAP_HOST`, `LDAP_BASE_DN`, `LDAP_ENABLED=false`
- Login checks `LDAP_ENABLED` flag: if false, local-only auth
- `auth_source` column on `users` distinguishes local vs LDAP users
- When ready for production: set `LDAP_ENABLED=true`, create users with `auth_source='ldap'`, implement LDAP bind in auth service

## Dependencies

### Backend (new packages)

- `PyJWT` — JWT encoding/decoding
- `bcrypt` — password hashing

Note: `python-ldap` will be added when LDAP is implemented. It requires system-level `libldap` headers and should not be installed until needed.

### Frontend

- No new packages — auth context and cookie handling use built-in Next.js/React features
