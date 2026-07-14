# Specification: expense-duplication

## MODIFIED Requirements

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
- `fx_rate`
- `fx_rate_manual`

The system MUST enforce that:
- The duplicated expense's `status` is set to `draft`.
- The duplicated expense's `report_id` is set to `NULL` (unattached to any report).
- The original expense's receipts are **not** copied to the duplicate.
- The FX rate and EUR equivalent amounts (`amount_eur`, `fx_rate`, `tax_amount_eur`) are **preserved from the original expense**, including the `fx_rate_manual` flag — no re-fetch from external API.
- Only the user who owns the original expense is permitted to duplicate it (non-owners receive a 403 Forbidden response).

#### Scenario: Owner duplicates an expense successfully
- **WHEN** the owner of expense ID 123 calls `POST /api/expenses/123/duplicate`
- **THEN** a new expense record is created in the database with status `draft`, unattached to any report, without receipts, copying the metadata of expense ID 123 including `fx_rate` and `fx_rate_manual`, and a 201 Created response is returned with the new expense details.
