package eu.nt.xpenses.dto.user

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

data class UserCreateRequest(
    @field:NotBlank val username: String,
    @JsonProperty("display_name") @field:NotBlank val displayName: String,
    @field:NotBlank @field:Size(min = 8) val password: String,
    @field:Pattern(regexp = "technician|manager|chef_finance|mod") val role: String,
    val email: String? = null
)
