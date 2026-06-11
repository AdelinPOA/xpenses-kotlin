## Why

Technicians frequently encounter similar or recurring expenses (e.g., recurring travel costs, subscription renewals, or regular parking fees). Currently, they must manually fill in all details (amount, currency, category, tax, merchant, date, and description) for each new expense. Allowing users to duplicate an existing expense with one click reduces manual entry overhead, speeds up expense logging, and improves data consistency.

## What Changes

- **Backend API**:
  - Add a new endpoint `POST /api/expenses/{expense_id}/duplicate` which clones the specified expense.
  - The duplicated expense will copy the original metadata (category_id, amount_original, currency_original, tax_amount, tax_rate, merchant, description, and date).
  - The duplicated expense's `status` will be reset to `draft` and its `report_id` set to `NULL` (unattached), regardless of the original expense's status.
  - Receipts from the original expense will **not** be copied to the new duplicate (since receipts represent unique physical proof for a single transaction).
  - Automatic recalculation of the FX rate and EUR equivalent for the duplication date (using stored cached rates or fetching if needed).
- **Frontend UI**:
  - Add a "Duplicate" button/icon to the Expense list rows and details modals/drawers.
  - Clicking "Duplicate" will trigger the API call, refresh the expense list, and automatically open the expense edit drawer/modal populated with the duplicated draft so the user can review and save any modifications.

## Capabilities

### New Capabilities
- `expense-duplication`: Clone metadata of any existing expense to create a new draft expense, resetting report attachment and receipts.

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS are changing -->

## Impact

- **Backend**:
  - FastAPI router `backend/xpenses/routers/expenses.py` (new route handler).
  - Unit and integration tests to verify the duplication behavior, access controls (only the owner can duplicate their own expense, mods/CFOs can copy for read-only references), and field resetting.
- **Frontend**:
  - API client `frontend/lib/api.ts` (new mutation/method).
  - Expense page/drawer components updated to expose the duplication trigger.
