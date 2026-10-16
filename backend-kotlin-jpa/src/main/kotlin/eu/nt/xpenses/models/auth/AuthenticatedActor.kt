package eu.nt.xpenses.models.auth

import eu.nt.xpenses.model.User

/**
 * Immutable Principal / Actor representation used by application services, controllers,
 * and authorization logic.
 *
 * Contains only identity and authorization claims, completely decoupled from JPA persistence,
 * password hashes, token versions, and Hibernate proxy mechanics.
 */
data class AuthenticatedActor(
    val id: TechnicianId,
    val role: String,
    val email: String? = null,
    val active: Boolean = true
) {
    val userId: Int get() = id.value

    companion object {
        fun fromUser(user: User): AuthenticatedActor {
            val uid = requireNotNull(user.id) { "User ID must not be null for authenticated actor" }
            return AuthenticatedActor(
                id = TechnicianId(uid),
                role = user.role,
                email = user.email,
                active = user.isActive
            )
        }
    }
}
