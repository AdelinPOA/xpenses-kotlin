package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class ReportCreate(
    @field:NotBlank val title: String,
    @field:Size(max = 1000) val description: String? = null,
    @JsonProperty("date_from") val dateFrom: String? = null,
    @JsonProperty("date_to") val dateTo: String? = null,
    val currency: String = "EUR"
)
