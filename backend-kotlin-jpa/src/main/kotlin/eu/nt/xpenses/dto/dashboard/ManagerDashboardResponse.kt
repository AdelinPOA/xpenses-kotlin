package eu.nt.xpenses.dto.dashboard

import com.fasterxml.jackson.annotation.JsonProperty

data class ManagerDashboardResponse(
    val kpis: ManagerKpis,
    @JsonProperty("pending_reports") val pendingReports: List<PendingReportSummary>,
    @JsonProperty("pending_advances") val pendingAdvances: List<PendingAdvanceSummary>,
    @JsonProperty("recent_activity") val recentActivity: List<ActivityFeedItem>
)
