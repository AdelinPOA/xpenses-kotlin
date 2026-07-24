package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal
import java.time.Instant

data class MileageRecordOut(
    val id: Int,
    @JsonProperty("report_id") val reportId: Int,
    @JsonProperty("user_id") val userId: Int,
    val origin: String,
    val destination: String,
    @JsonProperty("distance_km") val distanceKm: Double,
    @JsonProperty("rate_before_tax") val rateBeforeTax: BigDecimal,
    @JsonProperty("rate_after_tax") val rateAfterTax: BigDecimal,
    @JsonProperty("amount_before_tax") val amountBeforeTax: BigDecimal,
    @JsonProperty("amount_eur") val amountEur: BigDecimal,
    @JsonProperty("start_time") val startTime: Instant,
    @JsonProperty("end_time") val endTime: Instant,
    val description: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
    @JsonProperty("duration_minutes") val durationMinutes: Double
)
