package eu.nt.xpenses.dto.auth

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class ChangePasswordRequest(
    @JsonProperty("old_password") @field:NotBlank @field:Size(max = 72, message = "Password must not exceed 72 characters") val oldPassword: String,
    @JsonProperty("new_password") @field:NotBlank @field:Size.List(
        Size(min = 8),
        Size(max = 72, message = "Password must not exceed 72 characters")
    ) val newPassword: String
)
