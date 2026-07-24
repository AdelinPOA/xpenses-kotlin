package eu.nt.xpenses.dto.user

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.NotNull

data class ActiveUpdateRequest(
    @JsonProperty("is_active") @field:NotNull val isActive: Boolean? = null
)
