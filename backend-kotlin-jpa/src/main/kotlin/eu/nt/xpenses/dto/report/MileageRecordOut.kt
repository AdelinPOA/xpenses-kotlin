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
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal?,
    @JsonProperty("fuel_price_ron_per_liter") val fuelPriceRonPerLiter: BigDecimal?,
    @JsonProperty("fuel_exchange_rate") val fuelExchangeRate: BigDecimal?,
    @JsonProperty("fuel_cost_eur") val fuelCostEur: BigDecimal?,
    @JsonProperty("taxable_amount") val taxableAmount: BigDecimal?,
    @JsonProperty("withholding_amount") val withholdingAmount: BigDecimal?,
    @JsonProperty("pension_rate") val pensionRate: BigDecimal?,
    @JsonProperty("health_rate") val healthRate: BigDecimal?,
    @JsonProperty("income_tax_rate") val incomeTaxRate: BigDecimal?,
    @JsonProperty("tax_deduction_eur") val taxDeductionEur: BigDecimal?,
    @JsonProperty("amount_original") val amountOriginal: BigDecimal,
    @JsonProperty("currency_original") val currencyOriginal: String,
    @JsonProperty("fx_rate") val fxRate: BigDecimal,
    @JsonProperty("start_time") val startTime: Instant,
    @JsonProperty("end_time") val endTime: Instant,
    val description: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
    @JsonProperty("duration_minutes") val durationMinutes: Double,
    @JsonProperty("vehicle_id") val vehicleId: Int? = null,
    @JsonProperty("vehicle_plate") val vehiclePlate: String? = null,
    @JsonProperty("vehicle_make_model") val vehicleMakeModel: String? = null,
    @JsonProperty("vehicle_fuel_type") val vehicleFuelType: String? = null
)
