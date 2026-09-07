package eu.nt.xpenses.dto.settings

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.NotBlank

data class IngestionRetryIn(
    @field:NotBlank
    @JsonProperty("message_key")
    val messageKey: String
)
