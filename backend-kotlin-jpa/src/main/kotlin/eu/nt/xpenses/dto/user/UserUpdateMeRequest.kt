package eu.nt.xpenses.dto.user

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.Size

data class UserUpdateMeRequest(
    @JsonProperty("display_name") @field:Size(min = 1) val displayName: String? = null,
    @JsonProperty("notifications_enabled") val notificationsEnabled: Boolean? = null
)
