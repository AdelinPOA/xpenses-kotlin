# frontend

## Overview
Next.js 16.4.3 / React 19 / TypeScript App Router frontend (`package.json`, `tsconfig.json`) configured for standalone Node output, `next-intl` localization, strict CSP and security headers, `/api/*` backend proxy rewrites, cookie-gated edge proxy redirection, ESLint checks, and Playwright browser testing.

## Interface
- `[next.config.ts:nextConfig]` — Next.js config wrapped with `createNextIntlPlugin("./i18n/request.ts")`, setting `output: "standalone"`, `reactStrictMode: true`, `poweredByHeader: false`, `/api/:path*` rewrite to `INTERNAL_API_URL` (default `http://backend:8080/api`), and security/cache headers
- `[proxy.ts:proxy]` & `[proxy.ts:config]` — Edge request proxy redirecting unauthenticated page requests to `/login?next=...` when both `access_token` and `refresh_token` cookies are absent
- `[eslint.config.mjs:eslintConfig]` — Flat ESLint config combining `@eslint/js`, `typescript-eslint`, and ignore rules for `.next/**`, `node_modules/**`, `playwright-report/**`, `test-results/**`, `public/sw.js`, and `postcss.config.js`
- `[playwright.config.ts:default]` — Playwright configuration targeting `tests/` across `mobile-chromium`, `mobile-webkit`, `tablet`, and `desktop` projects with `serviceWorkers: "block"` default
- `[next-env.d.ts]` — Auto-generated Next.js TypeScript reference declarations (do not edit)
- [app](./app/README.md) — Next.js App Router pages, route layouts, error boundaries, and global Tailwind v4 styles
- [components](./components/README.md) — Client providers (auth, offline sync, theme, toast, PWA, query-error) and feature UI components
- [i18n](./i18n/README.md) — `next-intl` configuration, English/Romanian runtime bundles, and `LocaleProvider`
- [lib](./lib/README.md) — Axios transport with single-flight refresh, SSR `serverFetch`, query persistence, IndexedDB offline/OCR queues, and types
- [public](./public/README.md) — PWA manifest, icons, v9 Service Worker (`sw.js`), and standalone offline workspace
- [skills](./skills/SKILL.md) — Frontend architectural/skill guidance document

## Invariants
- `[next.config.ts:nextConfig]` enforces `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `unsafe-eval` permitted only outside production), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()`.
- `[next.config.ts:nextConfig]` sets `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js`, `no-cache` on `/manifest.json`, and `public, max-age=604800` on `/icons/:path*`.
- `[proxy.ts:proxy]` bypasses `/login`, `/_next*`, `/api*`, `/favicon.ico`, `/manifest.json`, `/sw.js`, `/icons/*`, `/offline/*`, and `*.png`; protected routes redirect to `/login` with an optional `next` parameter when both `access_token` and `refresh_token` cookies are missing.
- `[next.config.ts:nextConfig]` embeds `INTERNAL_API_URL` at evaluation/build time when constructing the `/api/:path*` rewrite rule.

## Side Effects
- `[next.config.ts:nextConfig]` rewrites `/api/:path*` traffic to `INTERNAL_API_URL` and injects HTTP security and caching headers onto responses.
- `[proxy.ts:proxy]` reads request cookies and issues 307/302 redirects to `/login` for unauthenticated navigation requests.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
