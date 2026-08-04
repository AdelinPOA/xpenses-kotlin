package eu.nt.xpenses.dto.expense

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal

data class ExpenseCreate(
    @JsonProperty("category_id") val categoryId: Int? = null,
    @JsonProperty("report_id") val reportId: Int? = null,
    @field:Min(0) val amount: BigDecimal,
    @field:NotBlank @field:Pattern(regexp = "^[A-Z]{3}$") val currency: String = "EUR",
    @JsonProperty("tax_amount") val taxAmount: BigDecimal = BigDecimal.ZERO,
    @JsonProperty("tax_rate") val taxRate: BigDecimal? = null,
    @field:NotBlank val date: String,
    val description: String? = null,
    val merchant: String? = null,
    @JsonProperty("raw_ocr_text") val rawOcrText: String? = null,
    @JsonProperty("comparison_id") val comparisonId: Int? = null,
    @JsonProperty("fx_rate") @field:DecimalMin(value = "0.0", inclusive = false) val fxRate: BigDecimal? = null,
    @JsonProperty("fx_rate_manual") val fxRateManual: Boolean? = null
)
