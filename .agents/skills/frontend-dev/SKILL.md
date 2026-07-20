---
name: frontend-dev
description: Specialized context and gotchas for developing the Next.js frontend. Activate this skill when working on the frontend codebase.
---

# Frontend Developer Skill

You are working on the Next.js 15 frontend for xpenses-kotlin.

## Critical Gotchas & Landmines
- **File downloads**: Use `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL` → synthetic click. **Never** use `<a href>` for authenticated file downloads.
- **Cookies**: Never directly access cookies in client components — use middleware for redirects.
- **API URLs**: SSR uses `INTERNAL_API_URL=http://backend:8080/api`, browser uses `NEXT_PUBLIC_API_URL=http://localhost:8001/api`.
- **Tailwind**: Uses v4 CSS-first config. There is **no** `tailwind.config.js`.
- **Auth**: JWT in httpOnly cookies. Axios `withCredentials: true`. Auto-refresh on 401.
- **Dark mode**: `.dark` class on `<html>`. `@custom-variant dark` in CSS.

## Commands
- **Dev server**: `npm run dev -- -p 3001`
- **Typecheck & Lint**: `npx tsc --noEmit && npx eslint .`
- **Build**: `npm run build`
