# Search Route (`frontend/app/search`)

## Overview
Next.js App Router client route (`/search`) displaying global search results across expense reports and expenses driven by the `q` URL query parameter.

## Interface
- `[page.tsx:SearchPage]` — Default-exported client route component wrapping `SearchPageContent` in `<Suspense>` with a loading spinner fallback.
- `[page.tsx:SearchPageContent]` — Internal route content component reading `q` from `useSearchParams()` and rendering matched reports and expenses inside `AppShell`.

## Invariants
- Query gating: `query` defaults to `""`, and `useQuery<SearchResult>` (`searchKeys.query(query)`, `staleTime: 30_000`) is enabled only when `query.length >= 1` `[page.tsx:SearchPageContent]`.
- Empty & section guards: renders `empty_prompt` when `!query`, reports section only when `data.reports.length > 0`, expenses section only when `data.expenses.length > 0`, and no-results `EmptyState` only when `!isLoading && data && data.report_count === 0 && data.expense_count === 0` `[page.tsx:SearchPageContent]`.
- Display & count rules: total count `n` is `(data?.report_count ?? 0) + (data?.expense_count ?? 0)` selecting `result_one` vs `result_other`; report total falls back from summed `expenses.amount_eur` to `report.total_amount`; `user_display_name` and `merchant` default to `"—"`, and `category_name` defaults to `tc("uncategorized")` `[page.tsx:SearchPageContent]`.

## Side Effects
- Fires `GET /search` (`params: { q: query }`) via `useQuery` when `query.length >= 1` `[page.tsx:SearchPageContent]`.
- Navigates via `router.push("/dashboard")` on no-results action and `<Link>` to `/reports/${report.id}` and `/expenses/${expense.id}` `[page.tsx:SearchPageContent]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
