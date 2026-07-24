package eu.nt.xpenses.dto.dashboard

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal

data class PendingAdvanceSummary(
    val id: Int,
    @JsonProperty("report_id") val reportId: Int,
    @JsonProperty("report_title") val reportTitle: String,
    @JsonProperty("user_id") val userId: Int,
    @JsonProperty("user_name") val userName: String,
    @JsonProperty("amount_eur") val amountEur: BigDecimal,
    val description: String?,
    val status: String,
    @JsonProperty("created_at") val createdAt: String?
)
