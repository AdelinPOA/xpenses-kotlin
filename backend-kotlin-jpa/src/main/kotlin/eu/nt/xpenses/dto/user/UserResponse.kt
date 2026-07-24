package eu.nt.xpenses.dto.user

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.model.User

data class UserResponse(
    val id: Int,
    val username: String,
    @JsonProperty("display_name") val displayName: String,
    val email: String?,
    val role: String,
    @JsonProperty("is_active") val isActive: Boolean,
    @JsonProperty("auth_source") val authSource: String,
    @JsonProperty("has_signature") val hasSignature: Boolean,
    @JsonProperty("notifications_enabled") val notificationsEnabled: Boolean
) {
    companion object {
        fun fromUser(user: User): UserResponse = UserResponse(
            id = user.id ?: throw IllegalStateException("User must be persisted"),
            username = user.username,
            displayName = user.displayName,
            email = user.email,
            role = user.role,
            isActive = user.isActive,
            authSource = user.authSource,
            hasSignature = !user.signaturePath.isNullOrEmpty(),
            notificationsEnabled = user.notificationsEnabled
        )
    }
}
