package eu.nt.xpenses.dto.auth

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class LoginRequest(
    @field:NotBlank val username: String,
    @field:NotBlank @field:Size(max = 72, message = "Password must not exceed 72 characters") val password: String
)
