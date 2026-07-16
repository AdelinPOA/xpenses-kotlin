# Phase 01: Auth Session Fix

## Problem
1. **Stale React state**: UI shows "logged in" but cookies are expired — `AuthProvider.tsx` never re-validates after initial mount.
2. **15-min access token TTL**: Too short — causes aggressive refresh cycles that hit the 5/min rate limit under parallel 401s.
3. **access_token cookie maxAge**: Set to 15 min — browser auto-deletes the cookie before JWT expiry, causing unnecessary 401s.
4. **Low refresh rate limit**: 5/min per IP — easily exceeded when multiple components 401 simultaneously.

## Changes

### 1. Backend: `application.yml` — Extend access token TTL
- `access-expires-minutes: 15` → `60`

### 2. Backend: `application.yml` — Increase refresh rate limit
- Refresh filter capacity: `5` → `20`

### 3. Backend: `AuthController.kt` — Remove access_token cookie maxAge
- Remove `.maxAge(15 * 60)` from `access_token` cookie → session cookie (browser keeps it until tab closes)
- JWT's internal `exp` claim still enforces the 60-min server-side limit

### 4. Frontend: `AuthProvider.tsx` — Fix stale auth state
- Add `visibilitychange` listener: re-check `/api/auth/me` when tab becomes visible
- Add 5-min periodic heartbeat: re-check `/api/auth/me` every 5 minutes
- On check failure → `setUser(null)` + redirect to `/login`
- Clean up listeners on unmount

## Files touched
| File | Change |
|------|--------|
| `backend-kotlin-jpa/src/main/resources/application.yml` | access TTL 15→60, refresh rate 5→20 |
| `backend-kotlin-jpa/src/main/kotlin/.../controllers/AuthController.kt` | Remove access_token maxAge |
| `frontend/components/AuthProvider.tsx` | visibility + heartbeat checks |

## Verification
- `make build` (backend compiles)
- `npx tsc --noEmit` (frontend typechecks)
- Start app, confirm session persists through >15 min idle
