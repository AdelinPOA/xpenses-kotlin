package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class ImportOrderIn(
    @JsonProperty("body_text")
    @field:NotBlank(message = "Email body text cannot be blank")
    @field:Size(max = 50000, message = "Email body text is too large")
    val bodyText: String
)
