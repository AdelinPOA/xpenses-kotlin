package eu.nt.xpenses.dto.ocr

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.Valid
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal

data class OcrManualCompletionRequest(
    @field:Valid val values: OcrManualExpenseValues? = null
)

data class OcrManualExpenseValues(
    @field:DecimalMin(value = "0.0", inclusive = true) val amount: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Z]{3}$") val currency: String? = null,
    val date: String? = null,
    @JsonProperty("tax_amount") @field:DecimalMin(value = "0.0", inclusive = true) val taxAmount: BigDecimal? = null,
    @JsonProperty("tax_rate") @field:DecimalMin(value = "0.0", inclusive = true) val taxRate: BigDecimal? = null,
    val merchant: String? = null,
    val description: String? = null,
    @JsonProperty("category_id") val categoryId: Int? = null,
    @JsonProperty("fx_rate") @field:DecimalMin(value = "0.0", inclusive = false) val fxRate: BigDecimal? = null,
    @JsonProperty("fx_rate_manual") val fxRateManual: Boolean? = null
) {
    fun hasValues(): Boolean = listOf(
        amount, currency, date, taxAmount, taxRate, merchant, description, categoryId, fxRate, fxRateManual
    ).any { it != null }
}
