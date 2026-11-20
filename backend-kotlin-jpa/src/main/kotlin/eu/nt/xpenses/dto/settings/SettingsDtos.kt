package eu.nt.xpenses.dto.settings

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import java.math.BigDecimal
import java.time.Instant

data class DailyAllowanceOut(
    @JsonProperty("daily_allowance_rate") val dailyAllowanceRate: BigDecimal,
)

data class DailyAllowanceUpdate(
    @JsonProperty("daily_allowance_rate") val dailyAllowanceRate: BigDecimal,
)

data class MobileUiConfigOut(
    @JsonProperty("mobile_quick_add_fab_enabled") val mobileQuickAddFabEnabled: Boolean,
)

data class MobileUiConfigUpdate(
    @JsonProperty("mobile_quick_add_fab_enabled") val mobileQuickAddFabEnabled: Boolean,
)

data class MileageRatesOut(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: BigDecimal,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: BigDecimal,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal,
    @JsonProperty("fuel_price_ron_per_liter") val fuelPriceRonPerLiter: BigDecimal,
    @JsonProperty("fuel_price_petrol_ron_per_liter") val fuelPricePetrolRonPerLiter: BigDecimal = fuelPriceRonPerLiter,
    @JsonProperty("fuel_price_lpg_ron_per_liter") val fuelPriceLpgRonPerLiter: BigDecimal = BigDecimal("4.85"),
    @JsonProperty("fuel_price_electric_ron_per_liter") val fuelPriceElectricRonPerLiter: BigDecimal = fuelPriceRonPerLiter,
    @JsonProperty("pension_rate") val pensionRate: BigDecimal,
    @JsonProperty("health_rate") val healthRate: BigDecimal,
    @JsonProperty("income_tax_rate") val incomeTaxRate: BigDecimal,
    @JsonProperty("tax_deduction_eur") val taxDeductionEur: BigDecimal,
)

data class MileageRatesUpdate(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: BigDecimal? = null,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: BigDecimal? = null,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal? = null,
    @JsonProperty("fuel_price_ron_per_liter") val fuelPriceRonPerLiter: BigDecimal? = null,
    @JsonProperty("fuel_price_petrol_ron_per_liter") val fuelPricePetrolRonPerLiter: BigDecimal? = null,
    @JsonProperty("fuel_price_lpg_ron_per_liter") val fuelPriceLpgRonPerLiter: BigDecimal? = null,
    @JsonProperty("fuel_price_electric_ron_per_liter") val fuelPriceElectricRonPerLiter: BigDecimal? = null,
    @JsonProperty("pension_rate") val pensionRate: BigDecimal? = null,
    @JsonProperty("health_rate") val healthRate: BigDecimal? = null,
    @JsonProperty("income_tax_rate") val incomeTaxRate: BigDecimal? = null,
    @JsonProperty("tax_deduction_eur") val taxDeductionEur: BigDecimal? = null,
)

data class FxMarginsOut(
    val margins: Map<String, BigDecimal>,
    @JsonProperty("default_margin") val defaultMargin: BigDecimal,
    val currencies: List<String>,
)

data class FxMarginsUpdate(
    val margins: Map<String, BigDecimal>? = null,
    @JsonProperty("default_margin") val defaultMargin: BigDecimal? = null,
)

data class OCRProviderOut(
    val id: String,
    val name: String,
    @JsonProperty("base_url") val baseUrl: String,
    @JsonProperty("api_key_set") val apiKeySet: Boolean,
)

data class OCRProviderUpdate(
    val id: String,
    val name: String,
    @JsonProperty("base_url") val baseUrl: String,
    @JsonProperty("api_key") val apiKey: String? = null,
)

data class OCRModelOut(
    val id: String,
    @JsonProperty("provider_id") val providerId: String,
    @JsonProperty("model_id") val modelId: String,
    @JsonProperty("display_name") val displayName: String,
    val active: Boolean,
    val tested: Boolean,
)

data class OCRModelUpdate(
    val id: String,
    @JsonProperty("provider_id") val providerId: String,
    @JsonProperty("model_id") val modelId: String,
    @JsonProperty("display_name") val displayName: String,
    val active: Boolean,
)

data class OCRConfigOut(
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean,
    val providers: List<OCRProviderOut>,
    val models: List<OCRModelOut>,
    @JsonProperty("receipt_model_chain") val receiptModelChain: List<String>,
    @JsonProperty("delegation_model_chain") val delegationModelChain: List<String>,
)

data class OCRConfigUpdate(
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean? = null,
    val providers: List<OCRProviderUpdate>? = null,
    val models: List<OCRModelUpdate>? = null,
    @JsonProperty("receipt_model_chain") val receiptModelChain: List<String>? = null,
    @JsonProperty("delegation_model_chain") val delegationModelChain: List<String>? = null,
)

data class OCRModelTestRequest(
    @JsonProperty("model_id") @field:NotBlank val modelId: String,
)

data class EmailConfigOut(
    @JsonProperty("emails_enabled") val emailsEnabled: Boolean,
    @JsonProperty("smtp_host") val smtpHost: String,
    @JsonProperty("smtp_port") val smtpPort: Int,
    @JsonProperty("smtp_user") val smtpUser: String,
    @JsonProperty("smtp_from") val smtpFrom: String,
    @JsonProperty("password_set") val passwordSet: Boolean,
)

data class EmailConfigIn(
    @JsonProperty("emails_enabled") val emailsEnabled: Boolean,
    @JsonProperty("smtp_host") val smtpHost: String,
    @JsonProperty("smtp_port") @field:Min(1) val smtpPort: Int,
    @JsonProperty("smtp_user") val smtpUser: String,
    @JsonProperty("smtp_pass") val smtpPass: String,
    @JsonProperty("smtp_from") val smtpFrom: String,
)

data class TestEmailIn(
    @field:NotBlank val to: String,
)

data class ImapConfigOut(
    val enabled: Boolean,
    @JsonProperty("imap_host") val imapHost: String,
    @JsonProperty("imap_port") val imapPort: Int,
    @JsonProperty("imap_user") val imapUser: String,
    @JsonProperty("imap_folder") val imapFolder: String,
    @JsonProperty("password_set") val passwordSet: Boolean,
    @JsonProperty("active_parser") val activeParser: String,
)

data class ImapConfigIn(
    val enabled: Boolean,
    @JsonProperty("imap_host") val imapHost: String,
    @JsonProperty("imap_port") @field:Min(1) val imapPort: Int,
    @JsonProperty("imap_user") val imapUser: String,
    @JsonProperty("imap_pass") var imapPass: String = "",
    @JsonProperty("imap_folder") var imapFolder: String = "INBOX",
)

data class EmailSimulationIn(
    @JsonProperty("from_address") @field:NotBlank val fromAddress: String,
    @JsonProperty("body_text") @field:NotBlank val bodyText: String,
    @JsonProperty("parser") val parser: String? = null,
)

data class FxProvidersOut(
    val providers: List<String>,
    @JsonProperty("available_providers") val availableProviders: List<String>,
)

data class FxProvidersUpdate(
    @field:NotEmpty val providers: List<String>,
)

data class FxTestRequest(
    val currency: String,
    val date: String? = null,
)

data class FxTestResponse(
    val success: Boolean,
    val message: String,
    val rate: BigDecimal? = null,
    val source: String? = null,
    @JsonProperty("source_date") val sourceDate: String? = null,
)

data class FxProviderHealthItemOut(
    val provider: String,
    val priority: Int,
    val healthy: Boolean,
    val active: Boolean,
    @JsonProperty("is_primary") val isPrimary: Boolean,
    @JsonProperty("checked_at") val checkedAt: Instant? = null,
    @JsonProperty("source_date") val sourceDate: String? = null,
    @JsonProperty("ron_per_eur") val ronPerEur: BigDecimal? = null,
    @JsonProperty("latency_ms") val latencyMs: Long? = null,
    val error: String? = null,
)

data class FxLastDbRateOut(
    @JsonProperty("from_currency") val fromCurrency: String,
    @JsonProperty("rate_date") val rateDate: String,
    @JsonProperty("source_date") val sourceDate: String,
    val source: String,
    val rate: BigDecimal,
    @JsonProperty("fetched_at") val fetchedAt: Instant,
)

data class FxHealthStatusOut(
    val status: String,
    @JsonProperty("primary_provider") val primaryProvider: String,
    @JsonProperty("active_source") val activeSource: String? = null,
    @JsonProperty("fallback_active") val fallbackActive: Boolean,
    @JsonProperty("last_checked_at") val lastCheckedAt: Instant? = null,
    @JsonProperty("primary_error") val primaryError: String? = null,
    val providers: List<FxProviderHealthItemOut>,
    @JsonProperty("last_db_rate") val lastDbRate: FxLastDbRateOut? = null,
)

data class FuelProviderHealthItemOut(
    val provider: String,
    val priority: Int,
    val healthy: Boolean,
    val active: Boolean,
    @JsonProperty("is_primary") val isPrimary: Boolean,
    @JsonProperty("checked_at") val checkedAt: Instant? = null,
    @JsonProperty("source_date") val sourceDate: String? = null,
    @JsonProperty("diesel_ron") val dieselRon: BigDecimal? = null,
    @JsonProperty("petrol_ron") val petrolRon: BigDecimal? = null,
    @JsonProperty("lpg_ron") val lpgRon: BigDecimal? = null,
    @JsonProperty("latency_ms") val latencyMs: Long? = null,
    val error: String? = null,
)

data class FuelLastDbPriceOut(
    @JsonProperty("fuel_type") val fuelType: String,
    @JsonProperty("price_date") val priceDate: String,
    @JsonProperty("source_date") val sourceDate: String,
    val source: String,
    @JsonProperty("price_ron_per_liter") val priceRonPerLiter: BigDecimal,
    @JsonProperty("fetched_at") val fetchedAt: Instant,
)

data class FuelPriceHealthStatusOut(
    val status: String,
    @JsonProperty("primary_provider") val primaryProvider: String,
    @JsonProperty("active_source") val activeSource: String? = null,
    @JsonProperty("fallback_active") val fallbackActive: Boolean,
    @JsonProperty("last_checked_at") val lastCheckedAt: Instant? = null,
    @JsonProperty("primary_error") val primaryError: String? = null,
    val providers: List<FuelProviderHealthItemOut>,
    @JsonProperty("last_db_price") val lastDbPrice: FuelLastDbPriceOut? = null,
)
