## ADDED Requirements

### Requirement: Report list can be exported as CSV or XLSX
The system SHALL provide a `GET /api/reports/export` endpoint that returns a summary of reports (one row per report) serialised as either CSV or XLSX.

The endpoint SHALL accept the following query parameters:
- `format` — `csv` (default) or `xlsx`
- `status` — string, filter by report status
- `all` — boolean (default `false`); when `true` and caller has role `manager`, `chef_finance`, or `mod`, returns org-wide reports
- `user_id` — integer; privileged users may filter to a specific user

Role-based scoping SHALL mirror `GET /api/reports`.

The response SHALL set `Content-Disposition: attachment; filename="reports_<YYYY-MM-DD>.<ext>"`.

#### Scenario: CFO exports all submitted reports as XLSX
- **WHEN** a `chef_finance` user calls `GET /api/reports/export?format=xlsx&all=true&status=submitted`
- **THEN** the system returns `200` with an XLSX file where each row represents one submitted report

#### Scenario: Technician exports own reports
- **WHEN** a technician calls `GET /api/reports/export`
- **THEN** the returned file contains only that technician's reports

#### Scenario: Report summary columns are present
- **WHEN** any user exports reports as CSV
- **THEN** the header row contains `id,title,status,date_from,date_to,total_amount,currency,submitted_at,approved_at,paid_at,user`

### Requirement: Report columns are well-defined
The exported reports file SHALL contain the following columns in order:

`id`, `title`, `status`, `date_from`, `date_to`, `total_amount`, `currency`, `submitted_at`, `approved_at`, `paid_at`, `user`

`user` is the `display_name` of the report owner. Datetime columns use ISO 8601 format (`YYYY-MM-DDTHH:MM:SSZ`). `total_amount` is the EUR sum of attached expenses.

#### Scenario: Dates formatted correctly in CSV
- **WHEN** a report with `submitted_at` set is included in a CSV export
- **THEN** the `submitted_at` column value is an ISO 8601 datetime string

#### Scenario: Null dates are empty strings in CSV
- **WHEN** a draft report (no `submitted_at`) is included in a CSV export
- **THEN** the `submitted_at`, `approved_at`, and `paid_at` columns are empty strings

### Requirement: Individual report expenses can be exported as CSV or XLSX
The system SHALL provide a `GET /api/reports/{report_id}/export-csv` endpoint that returns the individual expenses of a specific report as CSV or XLSX, using the same column schema as `GET /api/expenses/export` (without the `user` column, since all expenses belong to the same report owner).

Access control SHALL match `GET /api/reports/{report_id}`: managers, `chef_finance`, and `mod` may export any report; technicians may only export their own.

The response SHALL set `Content-Disposition: attachment; filename="report_<id>_expenses_<YYYY-MM-DD>.<ext>"`.

#### Scenario: Report owner exports their report's expenses
- **WHEN** a technician calls `GET /api/reports/42/export-csv?format=csv`
- **THEN** the system returns a CSV with all expenses belonging to report 42, provided report 42 is owned by that technician

#### Scenario: CFO exports another user's report expenses
- **WHEN** a `chef_finance` user calls `GET /api/reports/42/export-csv`
- **THEN** the system returns a CSV with all expenses in report 42 regardless of ownership

#### Scenario: Technician cannot export another user's report
- **WHEN** a technician calls `GET /api/reports/{id}/export-csv` for a report they do not own
- **THEN** the system returns `403 Forbidden`

#### Scenario: Report not found returns 404
- **WHEN** any user calls `GET /api/reports/99999/export-csv`
- **THEN** the system returns `404 Not Found`
