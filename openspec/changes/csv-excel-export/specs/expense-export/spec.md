## ADDED Requirements

### Requirement: Expenses can be exported as CSV or XLSX
The system SHALL provide a `GET /api/expenses/export` endpoint that returns all expenses matching the caller's filter criteria serialised as either CSV or XLSX.

The endpoint SHALL accept the following query parameters:
- `format` — `csv` (default) or `xlsx`
- `from` — ISO date string, inclusive lower bound on `expense.date`
- `to` — ISO date string, inclusive upper bound on `expense.date`
- `category_id` — integer, filter to a single category
- `status` — string, filter by expense status
- `report_id` — integer, filter to a single report
- `all` — boolean (default `false`); when `true` and caller has role `manager`, `chef_finance`, or `mod`, returns org-wide expenses

The response SHALL set `Content-Disposition: attachment; filename="expenses_<YYYY-MM-DD>.<ext>"`.

Role-based scoping SHALL mirror `GET /api/expenses`: a caller without a privileged role only receives their own expenses regardless of the `all` flag.

#### Scenario: Technician exports own expenses as CSV
- **WHEN** an authenticated technician calls `GET /api/expenses/export?format=csv`
- **THEN** the system returns a `200` response with `Content-Type: text/csv` containing only that user's expenses, one row per expense, with a header row

#### Scenario: Manager exports org-wide expenses as XLSX
- **WHEN** a manager calls `GET /api/expenses/export?format=xlsx&all=true`
- **THEN** the system returns a `200` response with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` containing all users' expenses

#### Scenario: Technician cannot escalate with all=true
- **WHEN** a technician calls `GET /api/expenses/export?all=true`
- **THEN** the system returns only the technician's own expenses (the `all` flag is silently ignored)

#### Scenario: Export respects date filter
- **WHEN** a user calls `GET /api/expenses/export?from=2026-01-01&to=2026-03-31`
- **THEN** the returned file contains only expenses with `date` between 2026-01-01 and 2026-03-31 inclusive

#### Scenario: Unsupported format returns 400
- **WHEN** a user calls `GET /api/expenses/export?format=pdf`
- **THEN** the system returns `400 Bad Request` with a descriptive error message

### Requirement: Expense export columns are well-defined
The exported file SHALL contain the following columns in order:

`id`, `date`, `merchant`, `description`, `category`, `amount_original`, `currency`, `amount_eur`, `fx_rate`, `tax_amount`, `tax_rate`, `tax_amount_eur`, `status`, `report_id`, `user`

For CSV: all values are quoted strings. Dates are `YYYY-MM-DD`. Monetary values use `.` as decimal separator with 2 decimal places. `user` column is omitted when the export is scoped to a single user (non-`all` mode).

For XLSX: monetary columns SHALL be formatted as numbers with 2 decimal places. Date columns SHALL be formatted as Excel dates.

#### Scenario: CSV header row matches defined columns (own-data mode)
- **WHEN** a technician exports expenses as CSV
- **THEN** the first row of the CSV is `id,date,merchant,description,category,amount_original,currency,amount_eur,fx_rate,tax_amount,tax_rate,tax_amount_eur,status,report_id`

#### Scenario: CSV header row includes user column in org-wide mode
- **WHEN** a manager exports expenses as CSV with `all=true`
- **THEN** the first row of the CSV includes `user` as the last column
