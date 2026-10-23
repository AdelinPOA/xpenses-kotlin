# CVE remediation — Next.js frontend

**Updated:** 2026-10-23

**Scope:** Patch and release the frontend dependency; OCR capture feature verified enabled after correcting a release build-flag omission.

## Finding and exposure

The frontend lockfile initially resolved `next` to **16.3.8**. A fresh `cd frontend && npm audit --json` reported three advisories:

- [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) — image optimization API RCE when SVG files are used.
- [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) — App Router denial of service involving Server Actions.
- [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) — RCE involving `use cache` functions returning typed arrays.

The current npm advisory database reported `16.4.3` as the available fix (the earlier plan's `16.4.2` was no longer the reported minimum). Before rollout, the production container was confirmed to run Next.js **16.3.8**.

## Remediation

- Pinned `frontend/package.json` to **Next.js 16.4.3** and regenerated `frontend/package-lock.json` without a broad dependency upgrade.
- Built and deployed immutable image `xpenses-frontend:next-16.4.3-cve-ocr-enabled-20261023`, explicitly passing `--build-arg NEXT_PUBLIC_OCR_IMMEDIATE_REVIEW_ENABLED=true`. The Dockerfile defaults this flag to false, so production builds must set the intended value explicitly.
- The first patched image was briefly deployed without this build argument, which disabled OCR capture and displayed the manual-only message. The omission was identified, the feature was verified on the candidate image, and the corrected image replaced it. Details and rollback image are recorded in the private deployment operations record.
- Deployment was frontend-only. The backend stayed on `xpenses-backend:boot4-owner-verification-c5b9adf`; database and Redis were not restarted or modified.

## Verification

Source checks (run from `frontend/`):

- `npm audit` — passed, **0 vulnerabilities**.
- `npm ls next --depth=0` — resolved `next@16.4.3`.
- `npm run typecheck` — passed.
- `npm run i18n:check` — passed (1192 keys in both locales).
- `npm run test:auth:unit` — passed (5 tests).
- `npm run lint` — passed.
- `npm run build` — passed with Next.js 16.4.3.
- `git diff --check` — passed.

OCR/release regression checks:

- With the flag false, `tests/expenses/capture-feature-gate.spec.ts` showed the exact disabled/manual-only state (2 tests passed).
- With the flag true, `tests/expenses/capture-review.spec.ts` passed 15 tests (8 visual-only tests were explicitly skipped).
- The actual corrected production image passed Playwright checks for distinct capture/manual choices and a complete mocked receipt capture/review flow (2 tests passed).

Post-release checks:

- Running container reports Next.js **16.4.3**, image `xpenses-frontend:next-16.4.3-cve-ocr-enabled-20261023`, and healthy status.
- Public `/login` returned HTTP 200; unauthenticated `/api/auth/me` returned HTTP 401; backend `/api/health` returned `{"status":"ok"}`.
- Backend, frontend, database, and Redis reported healthy. No frontend error/fatal log lines were observed after rollout.

## Remaining caveat

This was a frontend JavaScript dependency remediation, not a scan of container operating-system packages or the running backend image. No business data or persistent volumes were changed.
