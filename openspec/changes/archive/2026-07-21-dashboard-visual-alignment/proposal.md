# Change: Dashboard Visual Alignment & Polish

## Why
The frontend dashboard currently contains several visual misalignments and copy artifacts:
- Incorrect copy ("Total spend last order" instead of "Total Monthly Spend") on both desktop and mobile views.
- Mobile list items have potential badge text wrapping or collision issues with merchant name/date.
- "Spend by Category" progress bar logic calculates percentage against the maximum single category spend, forcing the top category to always display 100%. It should calculate percentage relative to total monthly spend.
- Expense status overview gauge SVG rotation math causes arc misalignments.
- SVG SpendChart distorts aspect ratio on wider screens.

## What Changes
1. Update copy from "Total spend last order" to "Total Monthly Spend" across `DashboardClient.tsx` (Desktop & Mobile).
2. Update category progress bar calculation to be relative to total monthly spend (`(category.total / totalSpend) * 100`).
3. Fix Mobile Recent Expenses layout so amount and status badges do not wrap or overflow awkwardly.
4. Refactor SVG Gauge in `ExpenseStatusOverview.tsx` for precise arc calculation without visual distortion.
5. Improve `SpendChart.tsx` SVG viewbox and aspect ratio handling.
