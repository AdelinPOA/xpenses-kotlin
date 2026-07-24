package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal
import java.time.Instant

data class PendingAdvanceOut(
    val id: Int,
    @JsonProperty("report_id") val reportId: Int,
    @JsonProperty("user_id") val userId: Int,
    val status: String,
    @JsonProperty("amount_original") val amountOriginal: BigDecimal,
    @JsonProperty("currency_original") val currencyOriginal: String,
    @JsonProperty("amount_eur") val amountEur: BigDecimal,
    @JsonProperty("fx_rate") val fxRate: BigDecimal,
    val date: String,
    val description: String?,
    @JsonProperty("requested_amount") val requestedAmount: BigDecimal?,
    @JsonProperty("requested_currency") val requestedCurrency: String?,
    @JsonProperty("paid_by") val paidBy: Int?,
    @JsonProperty("paid_by_name") val paidByName: String?,
    @JsonProperty("paid_at") val paidAt: Instant?,
    @JsonProperty("rejected_by") val rejectedBy: Int?,
    @JsonProperty("rejected_by_name") val rejectedByName: String?,
    @JsonProperty("rejected_at") val rejectedAt: Instant?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
    @JsonProperty("user_display_name") val userDisplayName: String,
    @JsonProperty("report_title") val reportTitle: String
)
