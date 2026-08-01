package eu.nt.xpenses.dto.dashboard

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal

data class PendingReportSummary(
    val id: Int,
    val title: String,
    @JsonProperty("user_id") val userId: Int,
    @JsonProperty("user_name") val userName: String,
    @JsonProperty("date_submitted") val dateSubmitted: String?,
    @JsonProperty("date_from") val dateFrom: String?,
    @JsonProperty("date_to") val dateTo: String?,
    @JsonProperty("total_amount_eur") val totalAmountEur: BigDecimal,
    @JsonProperty("expense_count") val expenseCount: Int,
    val description: String?,
    val status: String
)
