# Frontend dependency security update — 2026-10-16

Delivery: [GitHub issue #55](https://github.com/AdelinPOA/xpenses-kotlin/issues/55). Unpatched development-tooling follow-up: [#54](https://github.com/AdelinPOA/xpenses-kotlin/issues/54).

## Remediation

The original 17 open Dependabot alerts (#59–#75) were concentrated in four packages in `frontend/package-lock.json`. This update removes the vulnerable versions from the dependency graph:

| Package | Before | After | Original alerts |
| --- | --- | --- | --- |
| Next.js | 16.3.5 resolved from `^16.3.3` | **16.3.8**, pinned | #70, #72–#75 |
| Axios | 1.19.0 | **1.20.0** | #60–#68, #71 |
| brace-expansion | 5.0.9 | **5.0.12** | #69 |
| fast-uri | 3.1.6 | **Removed** with the unused optional AJV peer branch | #59 |

The Next environment/SWC packages and ESLint plugin are aligned to 16.3.8. The optional AJV integration of `@hookform/resolvers` is not used by this app's Zod imports; refreshing the lockfile removes that branch rather than retaining a vulnerable unused package.

The fresh npm audit also identified two additional repairable findings, included here:

- `sharp` **0.35.4 → 0.35.5**, including the existing override and matched native/libvips packages: [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- `source-map-js` **1.2.1 → 1.2.2**: [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

No major framework migration, forced audit fix, backend code change, database migration, or audit-policy weakening is included.

## Audit result and unresolved development risk

- `npm audit --omit=dev --json`: **0 vulnerabilities**, at every severity, for the resulting production dependency graph.
- Full `npm audit --json`: **4 HIGH entries**, all representing one development-only chain: `@next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`.
- Underlying unpatched advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). At verification time its first patched version was null.
- npm's suggested fix is a major downgrade to the Next 14 ESLint plugin, not a compatible braces patch. That downgrade was not applied.
- Follow-up: [GitHub issue #54](https://github.com/AdelinPOA/xpenses-kotlin/issues/54). Alerts are not dismissed. The existing full-audit CI policy remains unchanged and will still reject this chain; **full audit/CI security acceptance is not claimed**.

A clean production audit does not prove absence of every possible vulnerability or justify closing the separate development-tooling risk.

## Verification

A clean `npm ci` succeeded with the updated lockfile. TypeScript and English/Romanian key parity passed (964 keys). The focused browser regressions ran sequentially with one worker:

```bash
cd frontend
npm run typecheck
npm run i18n:check
npx playwright test tests/auth tests/admin/ocr.spec.ts tests/admin/imap.spec.ts \
  tests/admin/email.spec.ts tests/admin/ldap.spec.ts \
  tests/expenses/mobile-layout.spec.ts tests/offline/offline-queue.spec.ts \
  --project=desktop --workers=1
npx playwright test tests/auth/token-refresh.spec.ts \
  tests/expenses/mobile-layout.spec.ts tests/admin/ocr.spec.ts \
  --project=mobile-chromium --workers=1
```

Results: **51 desktop + 26 mobile tests passed (77 total)**. Two skips are the same WebKit-only screenshot-evidence case outside the WebKit project; no failing test was skipped to make the runs pass. New Axios regressions verify a 401 causes one refresh and one successful retry, and a rejected refresh redirects to login. Existing coverage exercises protected routes, login, uploads, OCR cancellation/promotion, receipt downloads, admin forms, and offline recovery.

Browser APIs are mocked; these runs do not probe production with exploit payloads or real financial writes. Existing development-server SSR-prefetch hostname and framework/time-zone warnings were non-failing fixture/environment warnings. No paid AI-provider requests were made.

## Deployment

Only the frontend image was rebuilt and recreated. The production Docker build passed using Node 22 and the updated lockfile. A protected server-local database backup and a tagged previous frontend image were retained for rollback before deployment; audit/build/test evidence remains server-local.

Deployment used `docker compose up -d --no-deps --no-build --wait` for **frontend only**, preserving its existing published port binding. Backend, PostgreSQL and Redis container IDs/start times were compared before and after and remained unchanged. No volumes were removed or recreated, and no `docker compose down` was used.

Post-deploy checks passed:

- Running frontend reports **Next.js 16.3.8**, not merely an updated manifest range.
- Frontend Docker health: **healthy**.
- Frontend-to-backend `/api/health` and public `/api/health`: HTTP 200.
- Public `/login`: HTTP 200; anonymous `/expenses`: HTTP 307 to authentication.
- Local logo through `/_next/image`: HTTP 200 with an image response, exercising the patched image stack.

Rollback, if necessary, selects the retained `xpenses-frontend:pre-security-<UTC timestamp>` image and recreates only the frontend with the recorded port binding. No database restoration is needed for these dependency-only changes. A rollback also reintroduces vulnerable frontend dependencies and should be temporary and explicitly assessed.
