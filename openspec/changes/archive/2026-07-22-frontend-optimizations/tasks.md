## 1. Shared Formatters

- [x] 1.1 Create `frontend/lib/format.ts` with cached `Intl.NumberFormat` singletons — export `formatEur(amount)` and `formatAmount(amount, currency)`
- [x] 1.2 Replace local `formatEur`/`formatAmount`/`formatLimit` in all 13 files with imports from `@/lib/format`

## 2. React Query Cache Tuning

- [x] 2.1 Add `refetchOnWindowFocus: true` to global QueryClient defaults in `components/Providers.tsx`
- [x] 2.2 Add `staleTime: 300_000, gcTime: 600_000` to all category `useQuery` calls (ExpensesClient, ExpenseForm, BulkReviewDrawer, categories/page, admin/ocr/page)
- [x] 2.3 Add `staleTime: 300_000, gcTime: 600_000` to all admin settings `useQuery` calls (admin/settings, admin/ldap, admin/email, admin/imap, admin/ocr, admin/storage)
- [x] 2.4 Add `staleTime: 60_000, refetchOnWindowFocus: true` to dashboard stats query in DashboardClient
- [x] 2.5 Add `staleTime: 120_000, gcTime: 300_000` to user list queries (admin/users, admin/imap)

## 3. Next.js Config Cleanup

- [x] 3.1 Remove `experimental.cpus: 6` from `next.config.ts` and add `reactStrictMode: true`

## 4. Dynamic Imports

- [x] 4.1 Convert `BulkReviewDrawer` import in `ExpensesClient.tsx` to `next/dynamic` with loading skeleton
- [x] 4.2 Convert `ExpenseForm` import in `expenses/[id]/edit/page.tsx` to `next/dynamic` with loading skeleton
- [x] 4.3 Convert `ExpenseForm` import in `expenses/new/` to `next/dynamic` with loading skeleton (if applicable)
- [x] 4.4 Convert `SignaturePad` import in `profile/signature/page.tsx` to `next/dynamic` with `ssr: false` and loading skeleton

## 5. SSR Prefetch Expansion

- [x] 5.1 Split `reports/page.tsx` → extract client code to `reports/ReportsClient.tsx`, create server `page.tsx` with `HydrationBoundary` prefetching reports list
- [x] 5.2 Split `reports/[id]/page.tsx` → extract client code to `reports/[id]/ReportDetailClient.tsx`, create server `page.tsx` with `HydrationBoundary` prefetching report by ID
- [x] 5.3 Split `profile/[id]/page.tsx` → extract client code to `profile/[id]/ProfileDetailClient.tsx`, create server `page.tsx` with `HydrationBoundary` prefetching user profile
- [x] 5.4 Split `admin/users/page.tsx` → extract client code to `admin/users/UsersClient.tsx`, create server `page.tsx` with `HydrationBoundary` prefetching user list
- [x] 5.5 Split `admin/settings/page.tsx` → extract client code to `admin/settings/SettingsClient.tsx`, create server `page.tsx` with `HydrationBoundary` prefetching mileage rates and daily allowance

## 6. Verification

- [x] 6.1 Run `npx tsc --noEmit` — verify no type errors
- [x] 6.2 Run `npm run lint` — verify no lint errors
- [x] 6.3 Run `npm run build` — verify production build succeeds
