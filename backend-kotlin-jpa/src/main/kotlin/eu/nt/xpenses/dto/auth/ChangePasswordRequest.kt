package eu.nt.xpenses.dto.auth

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class ChangePasswordRequest(
    @JsonProperty("old_password") @field:NotBlank val oldPassword: String,
    @JsonProperty("new_password") @field:NotBlank @field:Size(min = 8) val newPassword: String
)
