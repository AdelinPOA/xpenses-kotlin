## Context

Users currently enter repeating or similar expenses manually. We will implement a quick duplication action. This document details the technical implementation on both the backend (FastAPI/PostgreSQL) and frontend (Next.js/React).

## Goals / Non-Goals

**Goals:**
- Implement a `POST /api/expenses/{expense_id}/duplicate` API endpoint on the backend.
- Enforce strict owner-only security gating.
- Ensure the duplicate expense starts as a `draft` and is not attached to any report.
- Recalculate FX rates for the duplicate's date to keep financial calculations correct.
- Implement UI integration in the Next.js frontend, allowing one-click duplication and immediate redirection to editing.

**Non-Goals:**
- Duplicating receipt files (receipts are unique financial proofs).
- Bulk duplicating multiple selected expenses at once.

## Decisions

### 1. Duplication API Design
We will expose the endpoint `POST /api/expenses/{expense_id}/duplicate`.
- **Authorization**: Only the owner of the source expense can duplicate it.
- **Return Code**: `201 Created` returning the enriched `ExpenseOut` object.
- **FX calculations**: Retrieve the FX rate for the expense date using `get_rate` and compute `amount_eur` and `tax_amount_eur` dynamically.
- **Excluded Fields**: `report_id` will be set to `NULL`, `status` will be set to `'draft'`, and `receipts` will be empty.

### 2. Database Insert
We will use a clean SQL insert statement to copy values:
```sql
INSERT INTO expenses
  (category_id, report_id, amount_original, currency_original, amount_eur, fx_rate,
   tax_amount, tax_rate, tax_amount_eur, date, description, merchant, user_id, created_at, updated_at)
VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING id;
```

### 3. Frontend Integration
We will add a "Duplicate" button:
1. As a quick-action icon button in the expense table rows.
2. Inside the expense detail modal/drawer.
Upon click:
- Call the duplication mutation.
- Invalidate the `['expenses']` query cache.
- Open the edit drawer with the newly created expense ID.

## Risks / Trade-offs

- **[Risk]**: User duplicates an expense with an old/unsupported date where the exchange rate provider fails.
  - **[Mitigation]**: The duplication route will handle FX rate failures gracefully (returning 502) and fall back on cached rate values in PostgreSQL, consistent with regular expense creation.
