# New Expense Route (`frontend/app/expenses/new`)

## Overview
Next.js App Router Server Component route (`/expenses/new`) presenting either the capture-vs-manual entry choice or the dynamically loaded `ExpenseForm` when `mode=manual`.

## Interface
- `[page.tsx:NewExpensePage]` — Default-exported async Server Component accepting `{ searchParams: Promise<{ [key: string]: string | string[] | undefined }> }` (`reportId`, `mode`, `currency`).
- `[page.tsx:ExpenseForm]` — Dynamically imported client form component (`next/dynamic`) rendered with `reportId` and `defaultCurrency`.

## Invariants
- `reportId` parsing: `sp.reportId` is accepted only when it is a `string`, `Number(sp.reportId)` is a safe integer, and `rawReportId > 0`; otherwise `reportId` is `undefined` `[page.tsx:NewExpensePage]`.
- Mode switching: renders `<ExpenseForm reportId={reportId} defaultCurrency={currency} />` only when `sp.mode === "manual"`; otherwise renders the capture-vs-manual selection screen `[page.tsx:NewExpensePage]`.
- Currency forwarding & link construction: `defaultCurrency` is passed only when `typeof sp.currency === "string"`; `captureHref` (`/expenses/capture`) and `manualHref` (`/expenses/new?mode=manual`) append `reportId` only when valid `[page.tsx:NewExpensePage]`.

## Side Effects
- Loads server-side translations via `await getTranslations("expenses")` `[page.tsx:NewExpensePage]`.
- Code-splits `@/components/expenses/ExpenseForm` via `next/dynamic` `[page.tsx:ExpenseForm]`.
- Declarative `<Link>` navigation targets to `captureHref` and `manualHref` `[page.tsx:NewExpensePage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
