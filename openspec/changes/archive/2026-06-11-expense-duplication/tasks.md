## 1. Backend Route Implementation

- [x] 1.1 Implement the `POST /api/expenses/{expense_id}/duplicate` endpoint in `backend/xpenses/routers/expenses.py` that validates the caller owns the expense, duplicates the core metadata, sets status to `draft`, clears report association, excludes receipts, and recalculates the FX rates.

## 2. Backend Testing

- [x] 2.1 Add integration tests for the duplication endpoint in `backend/tests/test_expenses.py` to assert correct cloning logic, security gating (403 for non-owners), and receipt exclusion.

## 3. Frontend API Client & Component Integration

- [x] 3.1 Define the `duplicateExpense` mutation function in `frontend/lib/api.ts`.
- [x] 3.2 Add a duplicate action button in the expense list/table in `frontend/app/expenses/page.tsx` (using a copy/duplicate icon with proper tooltips/labels).
- [x] 3.3 Wire the duplication click handler to call the mutation, invalidate the `['expenses']` query, and automatically trigger opening the edit drawer with the new expense's ID.

## 4. Verification

- [x] 4.1 Run the backend test suite (`make test`) and verify 100% success.
- [x] 4.2 Validate frontend compilation using `npx tsc --noEmit` to ensure there are no TypeScript errors.
