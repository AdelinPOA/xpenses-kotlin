## ADDED Requirements

### Requirement: Backend API for duplicating expense
The system SHALL expose a `POST /api/expenses/{expense_id}/duplicate` endpoint that allows the owner of an expense to create a exact copy. The duplicated expense MUST copy:
- `category_id`
- `amount_original`
- `currency_original`
- `tax_amount`
- `tax_rate`
- `merchant`
- `description`
- `date`

The system MUST enforce that:
- The duplicated expense's `status` is set to `draft`.
- The duplicated expense's `report_id` is set to `NULL` (unattached to any report).
- The original expense's receipts are **not** copied to the duplicate.
- The FX rate and EUR equivalent amounts (`amount_eur`, `fx_rate`, `tax_amount_eur`) are re-evaluated based on the expense date using the exchange rate cache.
- Only the user who owns the original expense is permitted to duplicate it (non-owners receive a 403 Forbidden response).

#### Scenario: Owner duplicates an expense successfully
- **WHEN** the owner of expense ID 123 calls `POST /api/expenses/123/duplicate`
- **THEN** a new expense record is created in the database with status `draft`, unattached to any report, without receipts, copying the metadata of expense ID 123, and a 201 Created response is returned with the new expense details.

#### Scenario: Non-owner attempts to duplicate an expense
- **WHEN** user A (who does not own expense ID 123) calls `POST /api/expenses/123/duplicate`
- **THEN** the system returns a 403 Forbidden error response and no duplicate is created.

### Requirement: Frontend UI action for expense duplication
The Next.js frontend UI SHALL expose a visible "Duplicate" option for expenses in the expenses table list and detail views. Clicking this action MUST:
- Call the duplication API `POST /api/expenses/{expense_id}/duplicate`.
- Refresh the active query for the expense list.
- Automatically open the edit drawer for the newly created draft expense to allow the user to make changes and save.

#### Scenario: User duplicates an expense from the list
- **WHEN** the user clicks the "Duplicate" button on an expense item in the UI list
- **THEN** the frontend triggers the duplicate mutation, refetches the expenses list, and launches the edit drawer initialized with the cloned expense's draft.
