package eu.nt.xpenses.dto.dashboard

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal

data class ManagerKpis(
    @JsonProperty("pending_reports_count") val pendingReportsCount: Int,
    @JsonProperty("pending_reports_total_eur") val pendingReportsTotalEur: BigDecimal,
    @JsonProperty("pending_advances_count") val pendingAdvancesCount: Int,
    @JsonProperty("pending_advances_total_eur") val pendingAdvancesTotalEur: BigDecimal,
    @JsonProperty("monthly_team_spend_eur") val monthlyTeamSpendEur: BigDecimal,
    @JsonProperty("avg_turnaround_days") val avgTurnaroundDays: Double
)
