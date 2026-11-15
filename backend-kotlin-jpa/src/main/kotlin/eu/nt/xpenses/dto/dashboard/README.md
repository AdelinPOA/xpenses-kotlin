# Dashboard DTOs

## Overview
Response data transfer objects for technician and manager dashboard statistics, category spend breakdowns, pending approvals, and activity feeds in `eu.nt.xpenses.dto.dashboard`.

## Interface
- `[ActivityFeedItem.kt:ActivityFeedItem]` — `data class` representing an activity feed entry (`id`, `type`, `actorName`, `targetTitle`, `userName`, `amountEur`, `timestamp`)
- `[CategorySpend.kt:CategorySpend]` — `data class` representing spend totals per category (`categoryId`, `categoryName`, `total`, `count`)
- `[DashboardStats.kt:DashboardStats]` — `data class` aggregating technician/user dashboard metrics (`expenseCountTotal`, `expenseCountMonth`, `totalLastReportEur`, `draftCount`, `submittedCount`, `paidCount`, `pendingApprovalCount`, `pendingPaymentCount`, `spendByCategory`, `recentExpenses`)
- `[ManagerDashboardResponse.kt:ManagerDashboardResponse]` — `data class` combining `kpis: ManagerKpis`, `pendingReports: List<PendingReportSummary>`, `pendingAdvances: List<PendingAdvanceSummary>`, and `recentActivity: List<ActivityFeedItem>`
- `[ManagerKpis.kt:ManagerKpis]` — `data class` holding manager KPI totals (`pendingReportsCount`, `pendingReportsTotalEur`, `pendingAdvancesCount`, `pendingAdvancesTotalEur`, `monthlyTeamSpendEur`, `avgTurnaroundDays`)
- `[PendingAdvanceSummary.kt:PendingAdvanceSummary]` — `data class` summarizing an advance awaiting manager/finance action
- `[PendingReportSummary.kt:PendingReportSummary]` — `typealias PendingReportSummary = ReviewQueueItem`

## Invariants
- None

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.DashboardControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
