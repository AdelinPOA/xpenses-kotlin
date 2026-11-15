# Profile Detail Route (`frontend/app/profile/[id]`)

## Overview
Next.js App Router dynamic server-prefetched route (`/profile/[id]`) displaying account information and user expense reports (with an inline report summary modal) for a specified user ID.

## Interface
- `[page.tsx:dynamic]` — Route segment config exported as `"force-dynamic"`.
- `[page.tsx:UserProfileDetailPage]` — Default-exported async Server Component accepting `{ params: Promise<{ id: string }> }` and prefetching user and report queries into `HydrationBoundary`.
- `[ProfileDetailClient.tsx:ProfileDetailClient]` — Default-exported client component reading `id` via `useParams()`, managing `activeTab` (`"info" | "reports"`) and `selectedReportId`, and rendering inside `AppShell`.

## Invariants
- Route ID parsing: `id` is parsed in base 10 via `parseInt(..., 10)`; `isSelf` evaluates to `!targetUserId || targetUserId === currentUser?.id` `[page.tsx:UserProfileDetailPage, ProfileDetailClient.tsx:ProfileDetailClient]`.
- Query gating: target user query is enabled only when `!isSelf && !!targetUserId` (resolving `profileUser` to `currentUser` when `isSelf`); reports query is enabled when `!!currentUser`; report detail modal query is enabled when `!!selectedReportId` `[ProfileDetailClient.tsx:ProfileDetailClient]`.
- Render & tab guards: loading spinner renders while `(!isSelf && loadingUser) || loadingReports`, and content is withheld if `!profileUser`; tab switcher and reports tab are hidden when `isSelf` is `true`; modal detail link renders only when `activeReport` is truthy `[ProfileDetailClient.tsx:ProfileDetailClient]`.

## Side Effects
- Server prefetch: parallel `serverFetch` `GET /users/${targetUserId}` and `GET /reports?all=true&user_id=${targetUserId}` populating `["users", targetUserId]` and `["reports", "user", targetUserId]`, logging errors via `console.error` `[page.tsx:UserProfileDetailPage]`.
- Client queries: `GET /users/${targetUserId}`, `GET /reports` (`all: true`, `user_id`), and `GET /reports/${selectedReportId}` `[ProfileDetailClient.tsx:ProfileDetailClient]`.
- Navigation: `router.back()` on Back button click and `router.push(`/reports/${activeReport.id}`)` from the report modal `[ProfileDetailClient.tsx:ProfileDetailClient]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
