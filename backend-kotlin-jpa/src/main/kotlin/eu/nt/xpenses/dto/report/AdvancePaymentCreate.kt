package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal

data class AdvancePaymentCreate(
    @field:NotBlank val type: String = "paid",
    @field:Min(0) val amount: BigDecimal,
    @field:NotBlank @field:Pattern(regexp = "^[A-Z]{3}$") val currency: String = "EUR",
    val date: String? = null,
    val description: String? = null
)
