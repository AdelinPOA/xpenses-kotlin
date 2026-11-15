# Search DTOs

## Overview
Response data transfer objects for cross-entity search results covering expense reports and expenses in `eu.nt.xpenses.dto.search`.

## Interface
- `[SearchResult.kt:SearchResult]` — `data class SearchResult(val reports: List<ReportOut>, val expenses: List<ExpenseOut>, val reportCount: Int, val expenseCount: Int)`
- `[SearchResult.kt:reports]` — `val reports: List<ReportOut>`
- `[SearchResult.kt:expenses]` — `val expenses: List<ExpenseOut>`
- `[SearchResult.kt:reportCount]` — `val reportCount: Int` mapped via `@JsonProperty("report_count")`
- `[SearchResult.kt:expenseCount]` — `val expenseCount: Int` mapped via `@JsonProperty("expense_count")`

## Invariants
- None

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --no-daemon`
