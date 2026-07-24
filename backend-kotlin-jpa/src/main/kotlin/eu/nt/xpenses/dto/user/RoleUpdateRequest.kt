package eu.nt.xpenses.dto.user

import jakarta.validation.constraints.NotBlank

data class RoleUpdateRequest(
    @field:NotBlank val role: String
)
