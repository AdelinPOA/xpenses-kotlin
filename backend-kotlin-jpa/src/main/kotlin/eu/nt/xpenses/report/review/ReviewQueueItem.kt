package eu.nt.xpenses.report.review

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal
import java.time.Instant

data class ReviewQueueItem(
    val id: Int,
    val title: String,
    @JsonProperty("user_id") val userId: Int,
    @JsonProperty("user_name") val userName: String,
    @JsonProperty("date_submitted") val dateSubmitted: Instant?,
    @JsonProperty("date_from") val dateFrom: String?,
    @JsonProperty("date_to") val dateTo: String?,
    val description: String?,
    @JsonProperty("expense_count") val expenseCount: Int,
    @JsonProperty("total_amount_eur") val totalAmountEur: BigDecimal,
    val currency: String,
    val status: String
)
