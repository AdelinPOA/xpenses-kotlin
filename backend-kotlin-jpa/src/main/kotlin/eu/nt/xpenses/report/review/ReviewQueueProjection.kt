package eu.nt.xpenses.report.review

import java.math.BigDecimal
import java.time.Instant

data class ReviewQueueProjection(
    val id: Int,
    val title: String,
    val userId: Int,
    val userName: String,
    val dateSubmitted: Instant?,
    val dateFrom: String?,
    val dateTo: String?,
    val description: String?,
    val expenseCount: Long,
    val totalAmountEur: BigDecimal,
    val currency: String,
    val status: String
)
