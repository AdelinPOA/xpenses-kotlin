package eu.nt.xpenses.dto.settings

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import java.math.BigDecimal

data class DailyAllowanceOut(
    @JsonProperty("daily_allowance_rate") val dailyAllowanceRate: BigDecimal
)

data class DailyAllowanceUpdate(
    @JsonProperty("daily_allowance_rate") val dailyAllowanceRate: BigDecimal
)

data class MobileUiConfigOut(
    @JsonProperty("mobile_quick_add_fab_enabled") val mobileQuickAddFabEnabled: Boolean
)

data class MobileUiConfigUpdate(
    @JsonProperty("mobile_quick_add_fab_enabled") val mobileQuickAddFabEnabled: Boolean
)

data class MileageRatesOut(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: BigDecimal,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: BigDecimal,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal,
    @JsonProperty("fuel_price_ron_per_liter") val fuelPriceRonPerLiter: BigDecimal,
    @JsonProperty("pension_rate") val pensionRate: BigDecimal,
    @JsonProperty("health_rate") val healthRate: BigDecimal,
    @JsonProperty("income_tax_rate") val incomeTaxRate: BigDecimal,
    @JsonProperty("tax_deduction_eur") val taxDeductionEur: BigDecimal
)

data class MileageRatesUpdate(
    @JsonProperty("mileage_rate_before_tax") val mileageRateBeforeTax: BigDecimal? = null,
    @JsonProperty("mileage_rate_after_tax") val mileageRateAfterTax: BigDecimal? = null,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal? = null,
    @JsonProperty("fuel_price_ron_per_liter") val fuelPriceRonPerLiter: BigDecimal? = null,
    @JsonProperty("pension_rate") val pensionRate: BigDecimal? = null,
    @JsonProperty("health_rate") val healthRate: BigDecimal? = null,
    @JsonProperty("income_tax_rate") val incomeTaxRate: BigDecimal? = null,
    @JsonProperty("tax_deduction_eur") val taxDeductionEur: BigDecimal? = null
)

data class FxMarginsOut(
    val margins: Map<String, BigDecimal>,
    @JsonProperty("default_margin") val defaultMargin: BigDecimal,
    val currencies: List<String>
)

data class FxMarginsUpdate(
    val margins: Map<String, BigDecimal>? = null,
    @JsonProperty("default_margin") val defaultMargin: BigDecimal? = null
)

data class OCRConfigOut(
    val provider: String,
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean,
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null
)

data class OCRConfigUpdate(
    val provider: String? = null,
    @JsonProperty("ocr_enabled") val ocrEnabled: Boolean? = null,
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null
)

data class OCRTestRequest(
    @JsonProperty("gemini_api_key") val geminiApiKey: String? = null,
    @JsonProperty("provider") val provider: String? = null
)

data class EmailConfigOut(
    @JsonProperty("emails_enabled") val emailsEnabled: Boolean,
    @JsonProperty("smtp_host") val smtpHost: String,
    @JsonProperty("smtp_port") val smtpPort: Int,
    @JsonProperty("smtp_user") val smtpUser: String,
    @JsonProperty("smtp_from") val smtpFrom: String,
    @JsonProperty("password_set") val passwordSet: Boolean
)

data class EmailConfigIn(
    @JsonProperty("emails_enabled") val emailsEnabled: Boolean,
    @JsonProperty("smtp_host") val smtpHost: String,
    @JsonProperty("smtp_port") @field:Min(1) val smtpPort: Int,
    @JsonProperty("smtp_user") val smtpUser: String,
    @JsonProperty("smtp_pass") val smtpPass: String,
    @JsonProperty("smtp_from") val smtpFrom: String
)

data class TestEmailIn(
    @field:NotBlank val to: String
)

data class ImapConfigOut(
    val enabled: Boolean,
    @JsonProperty("imap_host") val imapHost: String,
    @JsonProperty("imap_port") val imapPort: Int,
    @JsonProperty("imap_user") val imapUser: String,
    @JsonProperty("imap_folder") val imapFolder: String,
    @JsonProperty("password_set") val passwordSet: Boolean,
    @JsonProperty("active_parser") val activeParser: String
)

data class ImapConfigIn(
    val enabled: Boolean,
    @JsonProperty("imap_host") val imapHost: String,
    @JsonProperty("imap_port") @field:Min(1) val imapPort: Int,
    @JsonProperty("imap_user") val imapUser: String,
    @JsonProperty("imap_pass") var imapPass: String = "",
    @JsonProperty("imap_folder") var imapFolder: String = "INBOX"
)

data class EmailSimulationIn(
    @JsonProperty("from_address") @field:NotBlank val fromAddress: String,
    @JsonProperty("body_text") @field:NotBlank val bodyText: String,
    @JsonProperty("parser") val parser: String? = null
)

data class FxProvidersOut(
    val providers: List<String>,
    @JsonProperty("available_providers") val availableProviders: List<String>
)

data class FxProvidersUpdate(
    @field:NotEmpty val providers: List<String>
)

data class FxTestRequest(
    val currency: String,
    val date: String? = null
)

data class FxTestResponse(
    val success: Boolean,
    val message: String,
    val rate: BigDecimal? = null,
    val source: String? = null,
    @JsonProperty("source_date") val sourceDate: String? = null
)
