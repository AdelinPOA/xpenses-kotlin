package eu.nt.xpenses.dto.expense

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.Valid
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal

data class ExpenseReviewRequest(
    @JsonProperty("expected_version") @field:Min(0) val expectedVersion: Int,
    @field:Valid val values: ExpenseReviewValues = ExpenseReviewValues(),
    val confirm: Boolean = false
)

data class ExpenseReviewValues(
    @JsonProperty("category_id") val categoryId: Int? = null,
    @field:DecimalMin(value = "0.0", inclusive = true) val amount: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Z]{3}$") val currency: String? = null,
    @JsonProperty("tax_amount") @field:DecimalMin(value = "0.0", inclusive = true) val taxAmount: BigDecimal? = null,
    @JsonProperty("tax_rate") @field:DecimalMin(value = "0.0", inclusive = true) val taxRate: BigDecimal? = null,
    val date: String? = null,
    val description: String? = null,
    val merchant: String? = null,
    @JsonProperty("fx_rate") @field:DecimalMin(value = "0.0", inclusive = false) val fxRate: BigDecimal? = null,
    @JsonProperty("fx_rate_manual") val fxRateManual: Boolean? = null,
    @JsonProperty("clear_category") val clearCategory: Boolean = false
) {
    fun hasCorrections(): Boolean =
        categoryId != null || clearCategory || amount != null || currency != null ||
            taxAmount != null || taxRate != null || date != null || description != null ||
            merchant != null || fxRate != null || fxRateManual != null
}
