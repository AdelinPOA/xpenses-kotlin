package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal

data class AdvancePaymentUpdate(
    @field:Min(0) val amount: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Z]{3}$") val currency: String? = null,
    val date: String? = null,
    val description: String? = null
)
