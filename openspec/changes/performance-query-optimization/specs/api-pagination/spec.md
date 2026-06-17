## ADDED Requirements

### Requirement: Optional pagination on expense and report list endpoints
`GET /api/expenses` and `GET /api/reports` SHALL accept optional `page` (zero-indexed) and `size` query parameters. When `page` is absent, all matching results SHALL be returned as a JSON array (backward compatible). When `page` is present, results SHALL be returned as a `PagedResponse` JSON object.

#### Scenario: unpaginated call returns array (backward compatible)
- **WHEN** `GET /api/expenses` is called without `page` param
- **THEN** the response is a JSON array `[...]` (same as before this change)

#### Scenario: paginated call returns wrapper object
- **WHEN** `GET /api/expenses?page=0&size=20` is called
- **THEN** the response is `{"data": [...], "page": 0, "size": 20, "total_elements": 150, "total_pages": 8}`

#### Scenario: page 2 returns the correct slice
- **WHEN** `GET /api/expenses?page=1&size=20` is called with 50 total expenses
- **THEN** the response `data` array contains expenses 21-40, `page` is 1, `total_pages` is 3

### Requirement: PagedResponse data class
A `PagedResponse<T>` data class SHALL exist with fields `data: List<T>`, `page: Int`, `size: Int`, `totalElements: Long` (serialized as `total_elements`), `totalPages: Int` (serialized as `total_pages`).

#### Scenario: PagedResponse serializes with snake_case
- **WHEN** a `PagedResponse<ExpenseOut>` is serialized to JSON
- **THEN** the JSON keys are `data`, `page`, `size`, `total_elements`, `total_pages`

### Requirement: Frontend handles both array and PagedResponse shapes
The frontend API layer SHALL detect whether a list endpoint response is an array or a `PagedResponse` object (via `Array.isArray(response)`), and extract `.data` when paginated. A "Load more" button SHALL appear when `total_pages > current_page + 1`.

#### Scenario: frontend renders paginated expenses
- **WHEN** the expenses page receives `{"data": [...], "total_pages": 3}`
- **THEN** it renders the `data` array and shows a "Load more" button

#### Scenario: frontend renders unpaginated expenses
- **WHEN** the expenses page receives `[...]` (plain array)
- **THEN** it renders the array directly with no "Load more" button
